import { useEffect, useMemo, useRef, useState } from "react";
import {
  addTeam,
  createFixture,
  createGroup,
  createTournament,
  createWorldCupKnockoutFromStandings,
  deleteFixture,
  fetchBootstrap,
  generateFixtures,
  loginAdmin,
  subscribeToRealtimeUpdates,
  updateFixture,
  updateMatch,
} from "./api.js";
import logo from "./assets/logo.png";

const PUBLIC_NAV_ITEMS = [
  { label: "Home", href: "#home" },
  { label: "Tournaments", href: "#tournaments" },
  { label: "Fixtures", href: "#fixtures" },
  { label: "Standings", href: "#standings" },
];

const PUBLIC_TABS = [
  { id: "matches", label: "Matches" },
  { id: "standings", label: "Standings" },
  { id: "top-scorers", label: "Top Scorers" },
];

const ADMIN_PASSWORD_KEY = "kick-and-chill-admin-password";

const initialTournamentForm = {
  name: "",
  format: "round_robin",
  venue: "",
};

const initialTeamForm = {
  name: "",
  players: "",
  groupId: "",
};

const initialGroupForm = {
  name: "",
};

const initialFixtureForm = {
  stage: "",
  phase: "group",
  groupId: "",
  homeTeamId: "",
  awayTeamId: "",
  scheduledAt: "",
};

function getStatusTone(status) {
  return {
    upcoming: "",
    live: "live",
    finished: "done",
  }[status] || "";
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString));
}

function toDateTimeLocalValue(dateString) {
  if (!dateString) {
    return "";
  }

  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createFixtureDraft(match) {
  return {
    stage: match.stage,
    phase: match.phase || "league",
    groupId: match.groupId || "",
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    scheduledAt: toDateTimeLocalValue(match.scheduledAt),
  };
}

function formatTournamentFormat(format) {
  return format.replace(/_/g, " ");
}

function formatMatchStage(match) {
  if (match.groupName && !match.stage.includes("Group")) {
    return `${match.stage} - Group ${match.groupName}`;
  }

  return match.stage;
}

function parseScorers(text, teams) {
  const players = teams.flatMap((team) => team.players);

  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [playerId, minuteText] = entry.split("@").map((part) => part.trim());
      const player = players.find((item) => item.id === playerId);

      if (!player) {
        return null;
      }

      return {
        playerId: player.id,
        teamId: player.teamId,
        minute: Number(minuteText) || 0,
      };
    })
    .filter(Boolean);
}

function getSelectedTournament(tournaments, selectedTournamentId) {
  return tournaments.find((tournament) => tournament.id === selectedTournamentId) || tournaments[0] || null;
}

function getAllNotifications(tournaments) {
  return tournaments
    .flatMap((tournament) =>
      (tournament.notifications || []).map((notification) => ({
        ...notification,
        tournamentName: tournament.name,
      })),
    )
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function getResultForm(match, resultForms) {
  return resultForms[match.id] || {
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    status: match.status,
    scorers: "",
  };
}

function getCurrentPath() {
  return window.location.pathname || "/";
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Header({ title, subtitle, actions, children }) {
  return (
    <header className="site-header">
      <div className="navbar">
        <div className="brand-lockup">
          <img className="brand-logo-image" src={logo} alt="Kick and Chill Hub logo" />
          <div className="brand-copy">
            <p className="eyebrow">5-a-side football center</p>
            <h1>{title}</h1>
          </div>
        </div>

        <div className="header-stack">
          {children}
          <nav className="nav-list" aria-label="Primary navigation">{actions}</nav>
        </div>
      </div>
      <p className="hero-copy">{subtitle}</p>
    </header>
  );
}

function NotificationBell({ notifications, isOpen, onToggle }) {
  return (
    <div className="notification-shell">
      <button type="button" className="ghost-button" onClick={onToggle}>
        Bell ({notifications.length})
      </button>
      {isOpen ? (
        <div className="card notification-dropdown">
          <h3>Notifications</h3>
          <div className="scorer-list">
            {notifications.length > 0 ? notifications.slice(0, 10).map((notification) => (
              <span key={notification.id}>
                [{notification.tournamentName}] {notification.message}
              </span>
            )) : (
              <span>No notifications yet.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TournamentPicker({ tournaments, selectedTournamentId, setSelectedTournamentId }) {
  return (
    <select
      value={selectedTournamentId}
      onChange={(event) => setSelectedTournamentId(event.target.value)}
    >
      {tournaments.map((tournament) => (
        <option key={tournament.id} value={tournament.id}>
          {tournament.name}
        </option>
      ))}
    </select>
  );
}

function StandingsRows({ rows }) {
  return (
    <div className="standings-card-list">
      {rows.map((row, index) => (
        <article className="standings-row-card" key={row.teamId}>
          <div className="standings-rank">{index + 1}</div>
          <div className="standings-team-block">
            <strong>{row.teamName}</strong>
            <span>{row.played}P - {row.won}W - {row.drawn}D - {row.lost}L</span>
          </div>
          <div className="standings-metrics">
            <span>GD {row.goalDifference}</span>
            <strong>{row.points} pts</strong>
          </div>
        </article>
      ))}
    </div>
  );
}

function MatchCard({ match, selectedTournament }) {
  const homeTeam = selectedTournament.teams.find((team) => team.id === match.homeTeamId);
  const awayTeam = selectedTournament.teams.find((team) => team.id === match.awayTeamId);

  return (
    <article className="card fixture-card">
      <div className="badge-row">
        <span className={`status-badge ${getStatusTone(match.status)}`}>{match.status}</span>
        <span>{formatMatchStage(match)}</span>
      </div>

      <div className="match-card-body">
        <div className="match-team-side">
          <strong>{homeTeam?.name}</strong>
          <span>Home</span>
        </div>

        <div className="match-score-center">
          <p className="fixture-score">{match.homeScore} : {match.awayScore}</p>
          <span className="match-time">{formatDate(match.scheduledAt)}</span>
        </div>

        <div className="match-team-side align-right">
          <strong>{awayTeam?.name}</strong>
          <span>Away</span>
        </div>
      </div>

      <div className="scorer-list">
        {match.goals.length > 0 ? match.goals.map((goal) => {
          const player = selectedTournament.teams.flatMap((team) => team.players).find((item) => item.id === goal.playerId);
          return (
            <span key={goal.id}>
              {player?.name || "Unknown"} {goal.minute}'
            </span>
          );
        }) : <span>No scorers recorded yet.</span>}
      </div>
    </article>
  );
}

function MatchSection({ id, eyebrow, title, emptyText, matches, selectedTournament }) {
  return (
    <section className="panel page-section" id={id}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>

      {matches.length > 0 ? (
        <div className="list-grid">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} selectedTournament={selectedTournament} />
          ))}
        </div>
      ) : (
        <div className="section-empty">{emptyText}</div>
      )}
    </section>
  );
}

function PublicTabs({ activeTab, setActiveTab }) {
  return (
    <section className="panel page-section tabs-panel" aria-label="Content tabs">
      <div className="tabs-scroll">
        <div className="tabs-list" role="tablist" aria-label="Tournament content tabs">
          {PUBLIC_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function OverviewPanel({ selectedTournament, tournaments, selectedTournamentId, setSelectedTournamentId }) {
  return (
    <section className="panel home-panel page-section" id="home">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>{selectedTournament?.name || "No tournament selected"}</h2>
        </div>
        <TournamentPicker
          tournaments={tournaments}
          selectedTournamentId={selectedTournamentId}
          setSelectedTournamentId={setSelectedTournamentId}
        />
      </div>

      {selectedTournament ? (
        <div className="hero-stats">
          <article>
            <span>Format</span>
            <strong>{formatTournamentFormat(selectedTournament.format)}</strong>
          </article>
          <article>
            <span>Teams</span>
            <strong>{selectedTournament.teams.length}</strong>
          </article>
          <article>
            <span>Matches</span>
            <strong>{selectedTournament.matches.length}</strong>
          </article>
          <article>
            <span>Venue</span>
            <strong>{selectedTournament.venue}</strong>
          </article>
          {selectedTournament.format === "world_cup" ? (
            <article>
              <span>Groups</span>
              <strong>{selectedTournament.groupStandings.length}</strong>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TournamentsPanel({ tournaments, selectedTournament, onSelect }) {
  return (
    <section className="panel page-section" id="tournaments">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tournaments</p>
          <h2>Available Competitions</h2>
        </div>
      </div>

      <div className="list-grid">
        {tournaments.map((tournament) => (
          <article className={`card tournament-card ${selectedTournament?.id === tournament.id ? "active" : ""}`} key={tournament.id}>
            <div className="badge-row">
              <span className="status-badge">{formatTournamentFormat(tournament.format)}</span>
              <span>{tournament.venue}</span>
            </div>
            <h3>{tournament.name}</h3>
            <p>
              {tournament.teams.length} teams
              {tournament.format === "world_cup" ? ` - ${tournament.groupStandings.length} groups` : ""}
            </p>
            <button type="button" onClick={() => onSelect(tournament.id)}>
              View
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function StandingsPanel({ selectedTournament }) {
  if (selectedTournament?.format === "world_cup") {
    return (
      <section className="panel page-section" id="standings">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Standings</p>
            <h2>Group Tables</h2>
          </div>
        </div>

        <div className="group-standings-grid">
          {(selectedTournament.groupStandings || []).map((group) => (
            <article className="card group-card" key={group.groupName}>
              <div className="panel-heading compact-heading">
                <div>
                  <p className="eyebrow">Group Stage</p>
                  <h3>Group {group.groupName}</h3>
                </div>
              </div>
              <StandingsRows
                rows={group.rows.map((row, index) => ({
                  ...row,
                  teamName: index < 2 ? `${row.teamName} (Q)` : row.teamName,
                }))}
              />
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel page-section" id="standings">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Standings</p>
          <h2>League Table</h2>
        </div>
      </div>

      <StandingsRows rows={selectedTournament?.standings || []} />
    </section>
  );
}

function TopScorersPanel({ selectedTournament }) {
  return (
    <section className="panel page-section" id="top-scorers">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Top Scorers</p>
          <h2>Golden Boot Race</h2>
        </div>
      </div>

      <div className="list-grid scorer-grid">
        {(selectedTournament?.topScorers || []).map((scorer) => (
          <article className="card scorer-card" key={scorer.playerId}>
            <span className="goals-total">{scorer.goals}</span>
            <h3>{scorer.playerName}</h3>
            <p>{scorer.teamName}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PublicApp({ data, selectedTournament, selectedTournamentId, setSelectedTournamentId, notifications, isNotificationsOpen, onToggleNotifications }) {
  const [activeTab, setActiveTab] = useState("matches");
  const allMatches = selectedTournament?.matches || [];
  const liveMatches = allMatches.filter((match) => match.status === "live");
  const upcomingMatches = allMatches.filter((match) => match.status === "upcoming");

  return (
    <>
      <Header
        title="Kick and Chill Hub"
        subtitle="Tournament fixtures, standings, top scorers, and live match updates for everyone at the center."
        actions={[
          ...PUBLIC_NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href}>{item.label}</a>
          )),
          <NotificationBell
            key="notifications"
            notifications={notifications}
            isOpen={isNotificationsOpen}
            onToggle={onToggleNotifications}
          />,
          <button key="admin-link" type="button" className="ghost-button" onClick={() => navigateTo("/admin/login")}>
            Admin Login
          </button>,
        ]}
      />

      <main className="layout public-layout">
        <OverviewPanel
          selectedTournament={selectedTournament}
          tournaments={data.tournaments}
          selectedTournamentId={selectedTournamentId}
          setSelectedTournamentId={setSelectedTournamentId}
        />
        <TournamentsPanel
          tournaments={data.tournaments}
          selectedTournament={selectedTournament}
          onSelect={setSelectedTournamentId}
        />
        <PublicTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        {activeTab === "matches" ? (
          <>
            <MatchSection
              id="fixtures"
              eyebrow="Live Matches"
              title="Live Matches"
              emptyText="No live matches at the moment."
              matches={liveMatches}
              selectedTournament={selectedTournament}
            />
            <MatchSection
              id="upcoming-fixtures"
              eyebrow="Upcoming Fixtures"
              title="Upcoming Fixtures"
              emptyText="No upcoming fixtures scheduled yet."
              matches={upcomingMatches}
              selectedTournament={selectedTournament}
            />
          </>
        ) : null}
        {activeTab === "standings" ? <StandingsPanel selectedTournament={selectedTournament} /> : null}
        {activeTab === "top-scorers" ? <TopScorersPanel selectedTournament={selectedTournament} /> : null}
      </main>
    </>
  );
}

function AdminLoginPage({ loginForm, setLoginForm, onSubmit, message }) {
  return (
    <>
      <Header
        title="Admin Access"
        subtitle="Log in to manage tournaments, teams, fixtures, and match results."
        actions={[
          <button key="public-link" type="button" className="ghost-button" onClick={() => navigateTo("/")}>
            Back to Public Site
          </button>,
        ]}
      />

      <main className="layout auth-layout">
        <section className="panel auth-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Protected Route</p>
              <h2>/admin/login</h2>
            </div>
          </div>

          <form className="card form-card" onSubmit={onSubmit}>
            <label className="field-stack">
              <span>Admin Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ password: event.target.value })}
                placeholder="Enter admin password"
                required
              />
            </label>
            <button type="submit">Log In</button>
            {message ? <p className="inline-message">{message}</p> : null}
          </form>
        </section>
      </main>
    </>
  );
}

function AdminDashboard({
  data,
  selectedTournament,
  selectedTournamentId,
  setSelectedTournamentId,
  notifications,
  isNotificationsOpen,
  onToggleNotifications,
  tournamentForm,
  setTournamentForm,
  groupForm,
  setGroupForm,
  teamForm,
  setTeamForm,
  fixtureForm,
  setFixtureForm,
  fixtureEditorForms,
  setFixtureEditorForms,
  resultForms,
  setResultForms,
  adminPassword,
  onCreateTournament,
  onCreateGroup,
  onAddTeam,
  onCreateFixture,
  onGenerateWorldCupKnockout,
  onUpdateFixture,
  onDeleteFixture,
  onGenerateFixtures,
  onSaveResult,
  onLogout,
  message,
}) {
  function setResultValue(matchId, field, value) {
    setResultForms((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] || {}),
        [field]: value,
      },
    }));
  }

  function setFixtureEditorValue(matchId, field, value) {
    setFixtureEditorForms((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] || {}),
        [field]: value,
      },
    }));
  }

  const fixtureGroupTeams = selectedTournament?.format === "world_cup" && fixtureForm.phase === "group"
    ? selectedTournament.teams.filter((team) => team.groupId === fixtureForm.groupId)
    : selectedTournament?.teams || [];

  return (
    <>
      <Header
        title="Kick and Chill Hub Admin"
        subtitle="Protected tournament operations for staff only. Public viewers cannot see these controls."
        actions={[
          <a key="admin-home" href="#admin-home">Dashboard</a>,
          <a key="admin-results" href="#admin-results">Results</a>,
          <NotificationBell
            key="notifications"
            notifications={notifications}
            isOpen={isNotificationsOpen}
            onToggle={onToggleNotifications}
          />,
          <button key="public-link" type="button" className="ghost-button" onClick={() => navigateTo("/")}>
            Public Site
          </button>,
          <button key="logout" type="button" className="ghost-button" onClick={onLogout}>
            Log Out
          </button>,
        ]}
      >
        <div className="admin-banner">Authenticated as admin</div>
      </Header>

      {message ? <div className="toast">{message}</div> : null}

      <main className="layout">
        <section className="panel home-panel" id="admin-home">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Admin Overview</p>
              <h2>{selectedTournament?.name || "No tournament selected"}</h2>
            </div>
            <TournamentPicker
              tournaments={data.tournaments}
              selectedTournamentId={selectedTournamentId}
              setSelectedTournamentId={setSelectedTournamentId}
            />
          </div>

          {selectedTournament ? (
            <div className="hero-stats">
              <article>
                <span>Format</span>
                <strong>{formatTournamentFormat(selectedTournament.format)}</strong>
              </article>
              <article>
                <span>Teams</span>
                <strong>{selectedTournament.teams.length}</strong>
              </article>
              <article>
                <span>Matches</span>
                <strong>{selectedTournament.matches.length}</strong>
              </article>
              <article>
                <span>Auth</span>
                <strong>{adminPassword ? "Active" : "Missing"}</strong>
              </article>
            </div>
          ) : null}
        </section>

        <section className="panel admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Admin Controls</p>
              <h2>Manage Tournament</h2>
            </div>
          </div>

          <div className="form-grid">
            <form className="card form-card" onSubmit={onCreateTournament}>
              <h3>Create Tournament</h3>
              <input
                placeholder="Tournament name"
                value={tournamentForm.name}
                onChange={(event) => setTournamentForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
              <select
                value={tournamentForm.format}
                onChange={(event) => setTournamentForm((current) => ({ ...current, format: event.target.value }))}
              >
                <option value="round_robin">Round Robin</option>
                <option value="knockout">Knockout</option>
                <option value="world_cup">World Cup</option>
              </select>
              <input
                placeholder="Venue"
                value={tournamentForm.venue}
                onChange={(event) => setTournamentForm((current) => ({ ...current, venue: event.target.value }))}
              />
              <button type="submit">Create</button>
            </form>

            {selectedTournament?.format === "world_cup" ? (
              <form className="card form-card" onSubmit={onCreateGroup}>
                <h3>Create Group</h3>
                <input
                  placeholder="Group letter (A-H)"
                  maxLength="1"
                  value={groupForm.name}
                  onChange={(event) => setGroupForm({ name: event.target.value.toUpperCase() })}
                  required
                />
                <button type="submit" disabled={!selectedTournament}>
                  Add Group
                </button>
              </form>
            ) : null}

            <form className="card form-card" onSubmit={onAddTeam}>
              <h3>Add Team</h3>
              <input
                placeholder="Team name"
                value={teamForm.name}
                onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
              <textarea
                rows="4"
                placeholder="Players separated by commas"
                value={teamForm.players}
                onChange={(event) => setTeamForm((current) => ({ ...current, players: event.target.value }))}
              />
              {selectedTournament?.format === "world_cup" ? (
                <select
                  value={teamForm.groupId}
                  onChange={(event) => setTeamForm((current) => ({
                    ...current,
                    groupId: event.target.value,
                  }))}
                  required
                >
                  <option value="">Assign to group</option>
                  {(selectedTournament.groups || []).map((group) => (
                    <option key={group.id} value={group.id}>
                      Group {group.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="submit"
                disabled={!selectedTournament || (selectedTournament?.format === "world_cup" && !(selectedTournament.groups || []).length)}
              >
                Add Team
              </button>
            </form>

            <div className="card form-card">
              <h3>Generate Fixtures</h3>
              <p>Create fixtures using the current tournament format for the selected competition.</p>
              {selectedTournament?.format === "world_cup" ? (
                <p>World Cup mode is admin-managed. Use the fixture form below, or optionally seed the Round of 16 from completed group standings.</p>
              ) : null}
              <button
                type="button"
                onClick={onGenerateFixtures}
                disabled={
                  !selectedTournament ||
                  selectedTournament.format === "world_cup" ||
                  selectedTournament.teams.length < 2 ||
                  (selectedTournament.format === "world_cup" && selectedTournament.teams.length !== 32)
                }
              >
                Generate Fixtures
              </button>
              {selectedTournament?.format === "world_cup" ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onGenerateWorldCupKnockout}
                  disabled={!selectedTournament}
                >
                  Generate Round of 16 From Standings
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {selectedTournament?.format === "world_cup" ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">World Cup Groups</p>
                <h2>Groups And Team Assignment</h2>
              </div>
            </div>

            <div className="group-standings-grid">
              {(selectedTournament.groups || []).map((group) => (
                <article className="card group-card" key={group.id}>
                  <div className="panel-heading compact-heading">
                    <div>
                      <p className="eyebrow">Group</p>
                      <h3>Group {group.name}</h3>
                    </div>
                  </div>

                  <div className="scorer-list">
                    {selectedTournament.teams.filter((team) => team.groupId === group.id).length > 0 ? (
                      selectedTournament.teams
                        .filter((team) => team.groupId === group.id)
                        .map((team) => (
                          <span key={team.id}>{team.name}</span>
                        ))
                    ) : (
                      <span>No teams assigned yet.</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Fixture Control</p>
              <h2>Create And Manage Fixtures</h2>
            </div>
          </div>

          <div className="form-grid">
            <form className="card form-card" onSubmit={onCreateFixture}>
              <h3>Create Fixture</h3>
              <select
                value={fixtureForm.phase}
                onChange={(event) => setFixtureForm((current) => ({
                  ...current,
                  phase: event.target.value,
                  groupId: event.target.value === "group" ? current.groupId : "",
                  homeTeamId: "",
                  awayTeamId: "",
                }))}
              >
                <option value="group">Group</option>
                <option value="knockout">Knockout</option>
                <option value="league">League</option>
              </select>
              {selectedTournament?.format === "world_cup" ? (
                <select
                  value={fixtureForm.groupId}
                  onChange={(event) => setFixtureForm((current) => ({
                    ...current,
                    groupId: event.target.value,
                    homeTeamId: "",
                    awayTeamId: "",
                  }))}
                  disabled={fixtureForm.phase !== "group"}
                  required={fixtureForm.phase === "group"}
                >
                  <option value="">Select group</option>
                  {(selectedTournament.groups || []).map((group) => (
                    <option key={group.id} value={group.id}>
                      Group {group.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                placeholder={fixtureForm.phase === "knockout" ? "Stage e.g. Quarterfinal" : "Stage name"}
                value={fixtureForm.stage}
                onChange={(event) => setFixtureForm((current) => ({ ...current, stage: event.target.value }))}
                required
              />
              <select
                value={fixtureForm.homeTeamId}
                onChange={(event) => setFixtureForm((current) => ({ ...current, homeTeamId: event.target.value }))}
                required
              >
                <option value="">Select home team</option>
                {fixtureGroupTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <select
                value={fixtureForm.awayTeamId}
                onChange={(event) => setFixtureForm((current) => ({ ...current, awayTeamId: event.target.value }))}
                required
              >
                <option value="">Select away team</option>
                {fixtureGroupTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={fixtureForm.scheduledAt}
                onChange={(event) => setFixtureForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                required
              />
              <button type="submit" disabled={!selectedTournament}>
                Create Fixture
              </button>
            </form>
          </div>
        </section>

        <section className="panel" id="admin-results">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Admin Results</p>
              <h2>Input Match Results</h2>
            </div>
          </div>

          <div className="list-grid">
            {(selectedTournament?.matches || []).map((match) => {
              const homeTeam = selectedTournament.teams.find((team) => team.id === match.homeTeamId);
              const awayTeam = selectedTournament.teams.find((team) => team.id === match.awayTeamId);
              const form = getResultForm(match, resultForms);

              return (
                <article className="card fixture-card" key={match.id}>
                  <div className="badge-row">
                    <span className={`status-badge ${getStatusTone(match.status)}`}>{match.status}</span>
                    <span>{formatMatchStage(match)}</span>
                  </div>
                  <h3>{homeTeam?.name} vs {awayTeam?.name}</h3>
                  <p className="fixture-score">{match.homeScore} : {match.awayScore}</p>
                  <p>{formatDate(match.scheduledAt)}</p>

                  <div className="result-editor">
                    <input
                      value={(fixtureEditorForms[match.id] || createFixtureDraft(match)).stage}
                      onChange={(event) => setFixtureEditorValue(match.id, "stage", event.target.value)}
                      placeholder="Stage"
                    />
                    <select
                      value={(fixtureEditorForms[match.id] || createFixtureDraft(match)).phase}
                      onChange={(event) => setFixtureEditorValue(match.id, "phase", event.target.value)}
                    >
                      <option value="group">Group</option>
                      <option value="knockout">Knockout</option>
                      <option value="league">League</option>
                    </select>
                    {selectedTournament?.format === "world_cup" ? (
                      <select
                        value={(fixtureEditorForms[match.id] || createFixtureDraft(match)).groupId}
                        onChange={(event) => setFixtureEditorValue(match.id, "groupId", event.target.value)}
                        disabled={(fixtureEditorForms[match.id] || createFixtureDraft(match)).phase !== "group"}
                      >
                        <option value="">No group</option>
                        {(selectedTournament.groups || []).map((group) => (
                          <option key={group.id} value={group.id}>
                            Group {group.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <select
                      value={(fixtureEditorForms[match.id] || createFixtureDraft(match)).homeTeamId}
                      onChange={(event) => setFixtureEditorValue(match.id, "homeTeamId", event.target.value)}
                    >
                      {selectedTournament.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={(fixtureEditorForms[match.id] || createFixtureDraft(match)).awayTeamId}
                      onChange={(event) => setFixtureEditorValue(match.id, "awayTeamId", event.target.value)}
                    >
                      {selectedTournament.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      value={(fixtureEditorForms[match.id] || createFixtureDraft(match)).scheduledAt}
                      onChange={(event) => setFixtureEditorValue(match.id, "scheduledAt", event.target.value)}
                    />
                    <button type="button" onClick={() => onUpdateFixture(match)}>
                      Save Fixture
                    </button>
                    <button type="button" className="ghost-button" onClick={() => onDeleteFixture(match)}>
                      Delete Fixture
                    </button>
                  </div>

                  <div className="player-help">
                    {selectedTournament.teams.flatMap((team) => team.players).map((player) => (
                      <span key={player.id}>{player.name}: {player.id}</span>
                    ))}
                  </div>

                  <div className="result-editor">
                    <input
                      type="number"
                      min="0"
                      value={form.homeScore}
                      onChange={(event) => setResultValue(match.id, "homeScore", event.target.value)}
                      placeholder="Home score"
                    />
                    <input
                      type="number"
                      min="0"
                      value={form.awayScore}
                      onChange={(event) => setResultValue(match.id, "awayScore", event.target.value)}
                      placeholder="Away score"
                    />
                    <select
                      value={form.status}
                      onChange={(event) => setResultValue(match.id, "status", event.target.value)}
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="finished">Finished</option>
                    </select>
                    <textarea
                      rows="2"
                      value={form.scorers}
                      onChange={(event) => setResultValue(match.id, "scorers", event.target.value)}
                      placeholder="Goal scorers: playerId@minute, playerId@minute"
                    />
                    <button type="button" onClick={() => onSaveResult(match)}>
                      Save Result
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}

function App() {
  const [data, setData] = useState({ tournaments: [] });
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [path, setPath] = useState(getCurrentPath());
  const [adminPassword, setAdminPassword] = useState(() => window.localStorage.getItem(ADMIN_PASSWORD_KEY) || "");
  const [loginForm, setLoginForm] = useState({ password: "" });
  const [tournamentForm, setTournamentForm] = useState(initialTournamentForm);
  const [groupForm, setGroupForm] = useState(initialGroupForm);
  const [teamForm, setTeamForm] = useState(initialTeamForm);
  const [fixtureForm, setFixtureForm] = useState(initialFixtureForm);
  const [fixtureEditorForms, setFixtureEditorForms] = useState({});
  const [resultForms, setResultForms] = useState({});
  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const refreshTimeoutRef = useRef(null);
  const loadInFlightRef = useRef(false);
  const selectedTournamentIdRef = useRef("");
  const latestNotificationIdRef = useRef("");

  useEffect(() => {
    selectedTournamentIdRef.current = selectedTournamentId;
  }, [selectedTournamentId]);

  async function loadData(options = {}) {
    if (loadInFlightRef.current && !options.force) {
      return;
    }

    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    loadInFlightRef.current = true;

    if (!options.silent) {
      setLoading(true);
    }

    try {
      const bootstrap = await fetchBootstrap();
      const nextNotifications = getAllNotifications(bootstrap.tournaments);

      if (nextNotifications[0] && latestNotificationIdRef.current && nextNotifications[0].id !== latestNotificationIdRef.current) {
        setToastMessage(nextNotifications[0].message);
      }

      if (nextNotifications[0]) {
        latestNotificationIdRef.current = nextNotifications[0].id;
      }

      setData(bootstrap);

      if (!selectedTournamentIdRef.current && bootstrap.tournaments[0]) {
        setSelectedTournamentId(bootstrap.tournaments[0].id);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      if (!options.silent) {
        setLoading(false);
      }

      loadInFlightRef.current = false;
    }
  }

  useEffect(() => {
    loadData();

    function scheduleRealtimeRefresh() {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        loadData({ force: true, silent: true });
      }, 200);
    }

    const unsubscribe = subscribeToRealtimeUpdates(() => {
      scheduleRealtimeRefresh();
    });

    function handlePopState() {
      setPath(getCurrentPath());
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      unsubscribe();
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (path === "/admin" && !adminPassword) {
      navigateTo("/admin/login");
    }
  }, [path, adminPassword]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const selectedTournament = useMemo(
    () => getSelectedTournament(data.tournaments, selectedTournamentId),
    [data.tournaments, selectedTournamentId],
  );
  const notifications = useMemo(() => getAllNotifications(data.tournaments), [data.tournaments]);

  async function handleLogin(event) {
    event.preventDefault();

    try {
      await loginAdmin(loginForm.password);
      window.localStorage.setItem(ADMIN_PASSWORD_KEY, loginForm.password);
      setAdminPassword(loginForm.password);
      setLoginForm({ password: "" });
      setMessage("Admin login successful.");
      navigateTo("/admin");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(ADMIN_PASSWORD_KEY);
    setAdminPassword("");
    setMessage("Logged out.");
    navigateTo("/admin/login");
  }

  async function handleTournamentSubmit(event) {
    event.preventDefault();
    const tournament = await createTournament(tournamentForm, adminPassword);
    setTournamentForm(initialTournamentForm);
    setSelectedTournamentId(tournament.id);
    setMessage("Tournament created.");
    await loadData({ force: true });
  }

  async function handleTeamSubmit(event) {
    event.preventDefault();

    if (!selectedTournament) {
      return;
    }

    await addTeam(
      selectedTournament.id,
      {
        name: teamForm.name,
        players: teamForm.players.split(",").map((item) => item.trim()).filter(Boolean),
        groupId: teamForm.groupId || null,
      },
      adminPassword,
    );

    setTeamForm(initialTeamForm);
    setMessage("Team added.");
    await loadData({ force: true });
  }

  async function handleGroupSubmit(event) {
    event.preventDefault();

    if (!selectedTournament) {
      return;
    }

    await createGroup(
      selectedTournament.id,
      { name: groupForm.name.trim() },
      adminPassword,
    );

    setGroupForm(initialGroupForm);
    setMessage("Group created.");
    await loadData({ force: true });
  }

  async function handleCreateFixture(event) {
    event.preventDefault();

    if (!selectedTournament) {
      return;
    }

    await createFixture(
      selectedTournament.id,
      {
        stage: fixtureForm.stage.trim(),
        phase: fixtureForm.phase,
        groupId: fixtureForm.phase === "group" ? fixtureForm.groupId || null : null,
        homeTeamId: fixtureForm.homeTeamId,
        awayTeamId: fixtureForm.awayTeamId,
        scheduledAt: new Date(fixtureForm.scheduledAt).toISOString(),
      },
      adminPassword,
    );

    setFixtureForm(initialFixtureForm);
    setMessage("Fixture created.");
    await loadData({ force: true });
  }

  async function handleUpdateFixture(match) {
    const form = fixtureEditorForms[match.id] || createFixtureDraft(match);

    await updateFixture(
      match.id,
      {
        stage: form.stage.trim(),
        phase: form.phase,
        groupId: form.phase === "group" ? form.groupId || null : null,
        homeTeamId: form.homeTeamId,
        awayTeamId: form.awayTeamId,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
      },
      adminPassword,
    );

    setMessage("Fixture updated.");
    await loadData({ force: true });
  }

  async function handleDeleteFixture(match) {
    await deleteFixture(match.id, adminPassword);
    setMessage("Fixture deleted.");
    await loadData({ force: true });
  }

  async function handleGenerateFixtures() {
    if (!selectedTournament) {
      return;
    }

    await generateFixtures(
      selectedTournament.id,
      { format: selectedTournament.format },
      adminPassword,
    );

    setMessage("Fixtures generated.");
    await loadData({ force: true });
  }

  async function handleGenerateWorldCupKnockout() {
    if (!selectedTournament) {
      return;
    }

    await createWorldCupKnockoutFromStandings(selectedTournament.id, adminPassword);
    setMessage("Round of 16 fixtures created from group standings.");
    await loadData({ force: true });
  }

  async function handleResultSubmit(match) {
    const form = getResultForm(match, resultForms);

    await updateMatch(
      match.id,
      {
        homeScore: Number(form.homeScore),
        awayScore: Number(form.awayScore),
        status: form.status,
        goals: parseScorers(form.scorers, selectedTournament.teams),
      },
      adminPassword,
    );

    setMessage("Match updated.");
    await loadData({ force: true });
  }

  const isAdminPath = path === "/admin" || path === "/admin/login";

  if (loading && data.tournaments.length === 0) {
    return <div className="loading-screen">Loading Kick and Chill Hub...</div>;
  }

  return (
    <div className="app-shell">
      {toastMessage ? <div className="toast">{toastMessage}</div> : null}
      {!isAdminPath ? (
        <PublicApp
          data={data}
          selectedTournament={selectedTournament}
          selectedTournamentId={selectedTournamentId}
          setSelectedTournamentId={setSelectedTournamentId}
          notifications={notifications}
          isNotificationsOpen={isNotificationsOpen}
          onToggleNotifications={() => setIsNotificationsOpen((current) => !current)}
        />
      ) : path === "/admin/login" ? (
        <AdminLoginPage
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          onSubmit={handleLogin}
          message={message}
        />
      ) : (
        <AdminDashboard
          data={data}
          selectedTournament={selectedTournament}
          selectedTournamentId={selectedTournamentId}
          setSelectedTournamentId={setSelectedTournamentId}
          notifications={notifications}
          isNotificationsOpen={isNotificationsOpen}
          onToggleNotifications={() => setIsNotificationsOpen((current) => !current)}
          tournamentForm={tournamentForm}
          setTournamentForm={setTournamentForm}
          groupForm={groupForm}
          setGroupForm={setGroupForm}
          teamForm={teamForm}
          setTeamForm={setTeamForm}
          fixtureForm={fixtureForm}
          setFixtureForm={setFixtureForm}
          fixtureEditorForms={fixtureEditorForms}
          setFixtureEditorForms={setFixtureEditorForms}
          resultForms={resultForms}
          setResultForms={setResultForms}
          adminPassword={adminPassword}
          onCreateTournament={handleTournamentSubmit}
          onCreateGroup={handleGroupSubmit}
          onAddTeam={handleTeamSubmit}
          onCreateFixture={handleCreateFixture}
          onGenerateWorldCupKnockout={handleGenerateWorldCupKnockout}
          onUpdateFixture={handleUpdateFixture}
          onDeleteFixture={handleDeleteFixture}
          onGenerateFixtures={handleGenerateFixtures}
          onSaveResult={handleResultSubmit}
          onLogout={handleLogout}
          message={message}
        />
      )}
    </div>
  );
}

export default App;
