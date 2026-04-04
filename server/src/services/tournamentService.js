import { createClient } from "@supabase/supabase-js";
import { demoData } from "../data/demoData.js";

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cloneDemoState() {
  return {
    tournaments: structuredClone(demoData.tournaments),
    teams: structuredClone(demoData.teams),
    players: structuredClone(demoData.players),
    matches: structuredClone(demoData.matches),
    goals: structuredClone(demoData.goals),
  };
}

function normalizeTournament(item) {
  return {
    id: item.id,
    name: item.name,
    format: item.format,
    venue: item.venue,
    createdAt: item.createdAt || item.created_at,
  };
}

function normalizeTeam(item) {
  return {
    id: item.id,
    tournamentId: item.tournamentId || item.tournament_id,
    name: item.name,
  };
}

function normalizePlayer(item) {
  return {
    id: item.id,
    teamId: item.teamId || item.team_id,
    name: item.name,
  };
}

function normalizeMatch(item) {
  return {
    id: item.id,
    tournamentId: item.tournamentId || item.tournament_id,
    stage: item.stage,
    homeTeamId: item.homeTeamId || item.home_team_id,
    awayTeamId: item.awayTeamId || item.away_team_id,
    homeScore: item.homeScore ?? item.home_score ?? 0,
    awayScore: item.awayScore ?? item.away_score ?? 0,
    status: item.status,
    scheduledAt: item.scheduledAt || item.scheduled_at,
  };
}

function normalizeGoal(item) {
  return {
    id: item.id,
    matchId: item.matchId || item.match_id,
    playerId: item.playerId || item.player_id,
    teamId: item.teamId || item.team_id,
    minute: item.minute,
  };
}

function groupBy(list, getKey) {
  return list.reduce((accumulator, item) => {
    const key = getKey(item);
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(item);
    return accumulator;
  }, {});
}

function createLocalRepository() {
  const state = cloneDemoState();

  return {
    async getAll() {
      return structuredClone(state);
    },
    async createTournament(payload) {
      const tournament = {
        id: `tournament-${crypto.randomUUID()}`,
        name: payload.name,
        format: payload.format,
        venue: payload.venue || "Kick and Chill Hub",
        createdAt: new Date().toISOString(),
      };
      state.tournaments.unshift(tournament);
      return tournament;
    },
    async addTeam(tournamentId, payload) {
      const team = {
        id: `team-${crypto.randomUUID()}`,
        tournamentId,
        name: payload.name,
      };
      state.teams.push(team);

      for (const playerName of payload.players || []) {
        state.players.push({
          id: `player-${crypto.randomUUID()}`,
          teamId: team.id,
          name: playerName,
        });
      }

      return team;
    },
    async createMatches(matches) {
      state.matches.push(...matches);
      return matches;
    },
    async updateMatch(matchId, payload) {
      const match = state.matches.find((entry) => entry.id === matchId);
      if (!match) {
        throw createError("Match not found", 404);
      }

      match.homeScore = payload.homeScore;
      match.awayScore = payload.awayScore;
      match.status = payload.status;

      state.goals = state.goals.filter((goal) => goal.matchId !== matchId);
      for (const goal of payload.goals || []) {
        state.goals.push({
          id: `goal-${crypto.randomUUID()}`,
          matchId,
          playerId: goal.playerId,
          teamId: goal.teamId,
          minute: goal.minute,
        });
      }

      return structuredClone(match);
    },
  };
}

function createSupabaseRepository() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  return {
    async getAll() {
      const [tournaments, teams, players, matches, goals] = await Promise.all([
        supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
        supabase.from("teams").select("*"),
        supabase.from("players").select("*"),
        supabase.from("matches").select("*").order("scheduled_at", { ascending: true }),
        supabase.from("goals").select("*").order("minute", { ascending: true }),
      ]);

      for (const result of [tournaments, teams, players, matches, goals]) {
        if (result.error) {
          throw createError(result.error.message, 500);
        }
      }

      return {
        tournaments: tournaments.data.map(normalizeTournament),
        teams: teams.data.map(normalizeTeam),
        players: players.data.map(normalizePlayer),
        matches: matches.data.map(normalizeMatch),
        goals: goals.data.map(normalizeGoal),
      };
    },
    async createTournament(payload) {
      const result = await supabase
        .from("tournaments")
        .insert({
          name: payload.name,
          format: payload.format,
          venue: payload.venue || "Kick and Chill Hub",
        })
        .select()
        .single();

      if (result.error) {
        throw createError(result.error.message, 500);
      }

      return normalizeTournament(result.data);
    },
    async addTeam(tournamentId, payload) {
      const teamInsert = await supabase
        .from("teams")
        .insert({
          tournament_id: tournamentId,
          name: payload.name,
        })
        .select()
        .single();

      if (teamInsert.error) {
        throw createError(teamInsert.error.message, 500);
      }

      if ((payload.players || []).length > 0) {
        const playerInsert = await supabase.from("players").insert(
          payload.players.map((name) => ({
            team_id: teamInsert.data.id,
            name,
          })),
        );

        if (playerInsert.error) {
          throw createError(playerInsert.error.message, 500);
        }
      }

      return normalizeTeam(teamInsert.data);
    },
    async createMatches(matches) {
      const result = await supabase
        .from("matches")
        .insert(
          matches.map((match) => ({
            tournament_id: match.tournamentId,
            stage: match.stage,
            home_team_id: match.homeTeamId,
            away_team_id: match.awayTeamId,
            home_score: match.homeScore,
            away_score: match.awayScore,
            status: match.status,
            scheduled_at: match.scheduledAt,
          })),
        )
        .select();

      if (result.error) {
        throw createError(result.error.message, 500);
      }

      return result.data.map(normalizeMatch);
    },
    async updateMatch(matchId, payload) {
      const matchUpdate = await supabase
        .from("matches")
        .update({
          home_score: payload.homeScore,
          away_score: payload.awayScore,
          status: payload.status,
        })
        .eq("id", matchId)
        .select()
        .single();

      if (matchUpdate.error) {
        throw createError(matchUpdate.error.message, 500);
      }

      const deleteGoals = await supabase.from("goals").delete().eq("match_id", matchId);
      if (deleteGoals.error) {
        throw createError(deleteGoals.error.message, 500);
      }

      if ((payload.goals || []).length > 0) {
        const insertGoals = await supabase.from("goals").insert(
          payload.goals.map((goal) => ({
            match_id: matchId,
            player_id: goal.playerId,
            team_id: goal.teamId,
            minute: goal.minute,
          })),
        );

        if (insertGoals.error) {
          throw createError(insertGoals.error.message, 500);
        }
      }

      return normalizeMatch(matchUpdate.data);
    },
  };
}

function buildRoundRobinMatches(tournamentId, teams) {
  const fixtures = [];
  let round = 1;

  for (let first = 0; first < teams.length; first += 1) {
    for (let second = first + 1; second < teams.length; second += 1) {
      fixtures.push({
        id: `match-${crypto.randomUUID()}`,
        tournamentId,
        stage: `Matchday ${round}`,
        homeTeamId: teams[first].id,
        awayTeamId: teams[second].id,
        homeScore: 0,
        awayScore: 0,
        status: "upcoming",
        scheduledAt: new Date(Date.now() + fixtures.length * 3600000).toISOString(),
      });

      round = round === teams.length - 1 ? 1 : round + 1;
    }
  }

  return fixtures;
}

function buildKnockoutMatches(tournamentId, teams) {
  const stages = { 2: "Final", 4: "Semifinal", 8: "Quarterfinal" };
  const fixtures = [];
  const stage = stages[teams.length] || "Knockout";

  for (let index = 0; index < teams.length; index += 2) {
    fixtures.push({
      id: `match-${crypto.randomUUID()}`,
      tournamentId,
      stage,
      homeTeamId: teams[index].id,
      awayTeamId: teams[index + 1].id,
      homeScore: 0,
      awayScore: 0,
      status: "upcoming",
      scheduledAt: new Date(Date.now() + fixtures.length * 3600000).toISOString(),
    });
  }

  return fixtures;
}

function calculateStandings(tournamentId, teams, matches) {
  // The same standings helper powers both demo mode and Supabase-backed mode.
  const table = teams
    .filter((team) => team.tournamentId === tournamentId)
    .map((team) => ({
      teamId: team.id,
      teamName: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    }));

  const rowMap = Object.fromEntries(table.map((row) => [row.teamId, row]));

  for (const match of matches.filter((entry) => entry.tournamentId === tournamentId && entry.status !== "upcoming")) {
    const home = rowMap[match.homeTeamId];
    const away = rowMap[match.awayTeamId];

    if (!home || !away) {
      continue;
    }

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
    } else if (match.homeScore < match.awayScore) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return table
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((left, right) =>
      right.points - left.points ||
      right.goalDifference - left.goalDifference ||
      right.goalsFor - left.goalsFor ||
      left.teamName.localeCompare(right.teamName),
    );
}

function calculateTopScorers(tournamentId, teams, players, goals) {
  const teamIds = new Set(teams.filter((team) => team.tournamentId === tournamentId).map((team) => team.id));
  const playerMap = Object.fromEntries(players.map((player) => [player.id, player]));
  const teamMap = Object.fromEntries(teams.map((team) => [team.id, team]));
  const totals = {};

  for (const goal of goals) {
    if (!teamIds.has(goal.teamId)) {
      continue;
    }

    totals[goal.playerId] = (totals[goal.playerId] || 0) + 1;
  }

  return Object.entries(totals)
    .map(([playerId, goalCount]) => ({
      playerId,
      playerName: playerMap[playerId]?.name || "Unknown Player",
      teamName: teamMap[playerMap[playerId]?.teamId]?.name || "Unknown Team",
      goals: goalCount,
    }))
    .sort((left, right) => right.goals - left.goals || left.playerName.localeCompare(right.playerName));
}

export function createTournamentService() {
  const repository = createSupabaseRepository() || createLocalRepository();

  return {
    async getBootstrapData() {
      // Bootstrap returns a denormalized shape so the frontend can stay very small.
      const data = await repository.getAll();
      const goalsByMatch = groupBy(data.goals, (goal) => goal.matchId);
      const playersByTeam = groupBy(data.players, (player) => player.teamId);
      const teamsByTournament = groupBy(data.teams, (team) => team.tournamentId);
      const matchesByTournament = groupBy(data.matches, (match) => match.tournamentId);

      return {
        tournaments: data.tournaments.map((tournament) => ({
          ...tournament,
          teams: (teamsByTournament[tournament.id] || []).map((team) => ({
            ...team,
            players: playersByTeam[team.id] || [],
          })),
          matches: (matchesByTournament[tournament.id] || []).map((match) => ({
            ...match,
            goals: goalsByMatch[match.id] || [],
          })),
          standings: calculateStandings(tournament.id, data.teams, data.matches),
          topScorers: calculateTopScorers(tournament.id, data.teams, data.players, data.goals),
        })),
      };
    },
    async createTournament(payload) {
      if (!payload.name || !payload.format) {
        throw createError("Tournament name and format are required");
      }

      return repository.createTournament(payload);
    },
    async addTeam(tournamentId, payload) {
      if (!payload.name) {
        throw createError("Team name is required");
      }

      return repository.addTeam(tournamentId, payload);
    },
    async generateFixtures(tournamentId, payload) {
      const data = await repository.getAll();
      const teams = data.teams.filter((team) => team.tournamentId === tournamentId);

      if (teams.length < 2) {
        throw createError("At least two teams are required to generate fixtures");
      }

      if (payload.format === "knockout" && teams.length % 2 !== 0) {
        throw createError("Knockout format requires an even number of teams");
      }

      const fixtures = payload.format === "knockout"
        ? buildKnockoutMatches(tournamentId, teams)
        : buildRoundRobinMatches(tournamentId, teams);

      return repository.createMatches(fixtures);
    },
    async updateMatchResult(matchId, payload) {
      if (payload.homeScore === undefined || payload.awayScore === undefined || !payload.status) {
        throw createError("homeScore, awayScore and status are required");
      }

      return repository.updateMatch(matchId, payload);
    },
  };
}
