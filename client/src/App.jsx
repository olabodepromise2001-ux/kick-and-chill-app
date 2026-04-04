import { useEffect, useState } from "react";
import { addTeam, createTournament, fetchBootstrap, generateFixtures, updateMatch } from "./api.js";

const navItems = ["Home", "Tournaments", "Fixtures", "Standings", "Top Scorers"];

const initialTournamentForm = {
  name: "",
  format: "round_robin",
  venue: "",
};

const initialTeamForm = {
  name: "",
  players: "",
};

const initialResultForm = {
  homeScore: 0,
  awayScore: 0,
  status: "finished",
  scorers: "",
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

function App() {
  const [data, setData] = useState({ tournaments: [] });
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [tournamentForm, setTournamentForm] = useState(initialTournamentForm);
  const [teamForm, setTeamForm] = useState(initialTeamForm);
  const [resultForms, setResultForms] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);

    try {
      const bootstrap = await fetchBootstrap();
      setData(bootstrap);

      if (!selectedTournamentId && bootstrap.tournaments[0]) {
        setSelectedTournamentId(bootstrap.tournaments[0].id);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Simple polling keeps the public score view fresh without adding websockets to the MVP.
    loadData();
    const intervalId = window.setInterval(loadData, 10000);
    return () => window.clearInterval(intervalId);
  }, []);

  const selectedTournament = getSelectedTournament(data.tournaments, selectedTournamentId);

  async function handleTournamentSubmit(event) {
    event.preventDefault();
    await createTournament(tournamentForm);
    setTournamentForm(initialTournamentForm);
    setMessage("Tournament created.");
    await loadData();
  }

  async function handleTeamSubmit(event) {
    event.preventDefault();

    if (!selectedTournament) {
      return;
    }

    await addTeam(selectedTournament.id, {
      name: teamForm.name,
      players: teamForm.players.split(",").map((item) => item.trim()).filter(Boolean),
    });

    setTeamForm(initialTeamForm);
    setMessage("Team added.");
    await loadData();
  }

  async function handleGenerateFixtures() {
    if (!selectedTournament) {
      return;
    }

    await generateFixtures(selectedTournament.id, {
      format: selectedTournament.format,
    });

    setMessage("Fixtures generated.");
    await loadData();
  }

  async function handleResultSubmit(match) {
    const form = getResultForm(match, resultForms);

    await updateMatch(match.id, {
      homeScore: Number(form.homeScore),
      awayScore: Number(form.awayScore),
      status: form.status,
      goals: parseScorers(form.scorers, selectedTournament.teams),
    });

    setMessage("Match updated.");
    await loadData();
  }

  function setResultValue(matchId, field, value) {
    setResultForms((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] || initialResultForm),
        [field]: value,
      },
    }));
  }

  if (loading && data.tournaments.length === 0) {
    return <div className="loading-screen">Loading Kick and Chill Hub...</div>;
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">5-a-side football center</p>
          <h1>Kick and Chill Hub</h1>
          <p className="hero-copy">
            Tournament control, fixtures, standings, and live score tracking in one mobile-friendly local dashboard.
          </p>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}>
              {item}
            </a>
          ))}
        </nav>
      </header>

      {message ? <div className="toast">{message}</div> : null}

      <main className="layout">
        <section className="panel home-panel" id="home">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>{selectedTournament?.name || "No tournament selected"}</h2>
            </div>

            <select
              value={selectedTournament?.id || ""}
              onChange={(event) => setSelectedTournamentId(event.target.value)}
            >
              {data.tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </div>

          {selectedTournament ? (
            <div className="hero-stats">
              <article>
                <span>Format</span>
                <strong>{selectedTournament.format.replace("_", " ")}</strong>
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
            <form className="card form-card" onSubmit={handleTournamentSubmit}>
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
              </select>
              <input
                placeholder="Venue"
                value={tournamentForm.venue}
                onChange={(event) => setTournamentForm((current) => ({ ...current, venue: event.target.value }))}
              />
              <button type="submit">Create</button>
            </form>

            <form className="card form-card" onSubmit={handleTeamSubmit}>
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
              <button type="submit" disabled={!selectedTournament}>
                Add Team
              </button>
            </form>

            <div className="card form-card">
              <h3>Generate Fixtures</h3>
              <p>
                Create fixtures using the current tournament format. Round robin schedules every pairing, knockout creates
                the opening bracket.
              </p>
              <button
                type="button"
                onClick={handleGenerateFixtures}
                disabled={!selectedTournament || selectedTournament.teams.length < 2}
              >
                Generate Fixtures
              </button>
            </div>
          </div>
        </section>

        <section className="panel" id="tournaments">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tournaments</p>
              <h2>Available Competitions</h2>
            </div>
          </div>

          <div className="list-grid">
            {data.tournaments.map((tournament) => (
              <article className={`card tournament-card ${selectedTournament?.id === tournament.id ? "active" : ""}`} key={tournament.id}>
                <div className="badge-row">
                  <span className="status-badge">{tournament.format.replace("_", " ")}</span>
                  <span>{tournament.venue}</span>
                </div>
                <h3>{tournament.name}</h3>
                <p>{tournament.teams.length} teams</p>
                <button type="button" onClick={() => setSelectedTournamentId(tournament.id)}>
                  View
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" id="fixtures">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Fixtures and Scores</p>
              <h2>Match Center</h2>
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
                    <span>{match.stage}</span>
                  </div>
                  <h3>{homeTeam?.name} vs {awayTeam?.name}</h3>
                  <p className="fixture-score">{match.homeScore} : {match.awayScore}</p>
                  <p>{formatDate(match.scheduledAt)}</p>

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
                    <button type="button" onClick={() => handleResultSubmit(match)}>
                      Save Result
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel" id="standings">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Standings</p>
              <h2>League Table</h2>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {(selectedTournament?.standings || []).map((row) => (
                  <tr key={row.teamId}>
                    <td>{row.teamName}</td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goalsFor}</td>
                    <td>{row.goalsAgainst}</td>
                    <td>{row.goalDifference}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" id="top-scorers">
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
      </main>
    </div>
  );
}

export default App;
