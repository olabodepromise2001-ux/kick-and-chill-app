import { useEffect, useMemo, useRef, useState } from "react";
import { addTeam, createTournament, fetchBootstrap, generateFixtures, loginAdmin, subscribeToRealtimeUpdates, updateMatch } from "./api.js";
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
  groupName: "",
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

function PublicApp({ data, selectedTournament, selectedTournamentId, setSelectedTournamentId }) {
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
  tournamentForm,
  setTournamentForm,
  teamForm,
  setTeamForm,
  resultForms,
  setResultForms,
  adminPassword,
  onCreateTournament,
  onAddTeam,
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

  return (
    <>
      <Header
        title="Kick and Chill Hub Admin"
        subtitle="Protected tournament operations for staff only. Public viewers cannot see these controls."
        actions={[
          <a key="admin-home" href="#admin-home">Dashboard</a>,
          <a key="admin-results" href="#admin-results">Results</a>,
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
                <input
                  placeholder="Optional group letter (A-H)"
                  maxLength="1"
                  value={teamForm.groupName}
                  onChange={(event) => setTeamForm((current) => ({
                    ...current,
                    groupName: event.target.value.toUpperCase(),
                  }))}
                />
              ) : null}
              <button type="submit" disabled={!selectedTournament}>
                Add Team
              </button>
            </form>

            <div className="card form-card">
              <h3>Generate Fixtures</h3>
              <p>Create fixtures using the current tournament format for the selected competition.</p>
              {selectedTournament?.format === "world_cup" ? (
                <p>World Cup mode expects 32 teams and will generate groups first, then auto-build the knockout bracket.</p>
              ) : null}
              <button
                type="button"
                onClick={onGenerateFixtures}
                disabled={
                  !selectedTournament ||
                  selectedTournament.teams.length < 2 ||
                  (selectedTournament.format === "world_cup" && selectedTournament.teams.length !== 32)
                }
              >
                Generate Fixtures
              </button>
            </div>
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
  const [teamForm, setTeamForm] = useState(initialTeamForm);
  const [resultForms, setResultForms] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const refreshTimeoutRef = useRef(null);
  const loadInFlightRef = useRef(false);
  const selectedTournamentIdRef = useRef("");

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

  const selectedTournament = useMemo(
    () => getSelectedTournament(data.tournaments, selectedTournamentId),
    [data.tournaments, selectedTournamentId],
  );

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
    await createTournament(tournamentForm, adminPassword);
    setTournamentForm(initialTournamentForm);
    setMessage("Tournament created.");
    await loadData();
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
        groupName: teamForm.groupName.trim() || null,
      },
      adminPassword,
    );

    setTeamForm(initialTeamForm);
    setMessage("Team added.");
    await loadData();
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
    await loadData();
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
    await loadData();
  }

  const isAdminPath = path === "/admin" || path === "/admin/login";

  if (loading && data.tournaments.length === 0) {
    return <div className="loading-screen">Loading Kick and Chill Hub...</div>;
  }

  return (
    <div className="app-shell">
      {!isAdminPath ? (
        <PublicApp
          data={data}
          selectedTournament={selectedTournament}
          selectedTournamentId={selectedTournamentId}
          setSelectedTournamentId={setSelectedTournamentId}
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
          tournamentForm={tournamentForm}
          setTournamentForm={setTournamentForm}
          teamForm={teamForm}
          setTeamForm={setTeamForm}
          resultForms={resultForms}
          setResultForms={setResultForms}
          adminPassword={adminPassword}
          onCreateTournament={handleTournamentSubmit}
          onAddTeam={handleTeamSubmit}
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
