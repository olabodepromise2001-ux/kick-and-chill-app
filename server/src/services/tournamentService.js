import { createClient } from "@supabase/supabase-js";
import { demoData } from "../data/demoData.js";

const WORLD_CUP_GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const WORLD_CUP_KNOCKOUT_ORDER = ["Round of 16", "Quarterfinal", "Semifinal", "Final"];

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
    groupName: item.groupName || item.group_name || null,
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
    phase: item.phase || "league",
    groupName: item.groupName || item.group_name || null,
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
        groupName: payload.groupName || null,
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
          group_name: payload.groupName || null,
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
            phase: match.phase || "league",
            group_name: match.groupName || null,
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

function createMatch(tournamentId, stage, homeTeamId, awayTeamId, offset, extras = {}) {
  return {
    id: `match-${crypto.randomUUID()}`,
    tournamentId,
    stage,
    homeTeamId,
    awayTeamId,
    homeScore: 0,
    awayScore: 0,
    status: "upcoming",
    scheduledAt: new Date(Date.now() + offset * 3600000).toISOString(),
    phase: extras.phase || "league",
    groupName: extras.groupName || null,
  };
}

function buildRoundRobinMatches(tournamentId, teams) {
  const fixtures = [];
  let round = 1;

  for (let first = 0; first < teams.length; first += 1) {
    for (let second = first + 1; second < teams.length; second += 1) {
      fixtures.push(createMatch(
        tournamentId,
        `Matchday ${round}`,
        teams[first].id,
        teams[second].id,
        fixtures.length,
        { phase: "league" },
      ));

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
    fixtures.push(createMatch(
      tournamentId,
      stage,
      teams[index].id,
      teams[index + 1].id,
      fixtures.length,
      { phase: "knockout" },
    ));
  }

  return fixtures;
}

function getWorldCupGroupMap(teams) {
  const explicitGroups = teams.filter((team) => team.groupName);

  if (explicitGroups.length === teams.length) {
    return explicitGroups.reduce((accumulator, team) => {
      const key = team.groupName.toUpperCase();
      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push(team);
      return accumulator;
    }, {});
  }

  const orderedTeams = [...teams].sort((left, right) => left.name.localeCompare(right.name));
  const groupSize = 4;
  const groups = {};

  orderedTeams.forEach((team, index) => {
    const groupLetter = WORLD_CUP_GROUP_LETTERS[Math.floor(index / groupSize)];
    if (!groups[groupLetter]) {
      groups[groupLetter] = [];
    }

    groups[groupLetter].push({
      ...team,
      groupName: groupLetter,
    });
  });

  return groups;
}

function buildWorldCupGroupMatches(tournamentId, teams) {
  const fixtures = [];
  const groupMap = getWorldCupGroupMap(teams);
  let offset = 0;

  for (const groupLetter of Object.keys(groupMap).sort()) {
    const groupTeams = groupMap[groupLetter];

    for (let first = 0; first < groupTeams.length; first += 1) {
      for (let second = first + 1; second < groupTeams.length; second += 1) {
        fixtures.push(createMatch(
          tournamentId,
          `Group ${groupLetter}`,
          groupTeams[first].id,
          groupTeams[second].id,
          offset,
          {
            phase: "group",
            groupName: groupLetter,
          },
        ));
        offset += 1;
      }
    }
  }

  return fixtures;
}

function validateWorldCupGroupMap(groupMap) {
  const groupLetters = Object.keys(groupMap).sort();

  if (groupLetters.length !== WORLD_CUP_GROUP_LETTERS.length) {
    throw createError("World Cup format requires groups A to H");
  }

  for (const expectedGroup of WORLD_CUP_GROUP_LETTERS) {
    if (!groupMap[expectedGroup] || groupMap[expectedGroup].length !== 4) {
      throw createError("Each World Cup group must contain exactly 4 teams");
    }
  }
}

function getWorldCupTeamGroup(team, groupMap) {
  for (const [groupLetter, groupTeams] of Object.entries(groupMap)) {
    if (groupTeams.some((groupTeam) => groupTeam.id === team.id)) {
      return groupLetter;
    }
  }

  return null;
}

function calculateTableRows(teams, matches) {
  const table = teams.map((team) => ({
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

  for (const match of matches.filter((entry) => entry.status !== "upcoming")) {
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

function calculateStandings(tournament, teams, matches) {
  const tournamentTeams = teams.filter((team) => team.tournamentId === tournament.id);
  const tournamentMatches = matches.filter((match) => match.tournamentId === tournament.id);

  if (tournament.format === "world_cup") {
    const groupMap = getWorldCupGroupMap(tournamentTeams);

    return Object.keys(groupMap)
      .sort()
      .map((groupLetter) => ({
        groupName: groupLetter,
        rows: calculateTableRows(
          groupMap[groupLetter],
          tournamentMatches.filter((match) => match.phase === "group" && match.groupName === groupLetter),
        ),
      }));
  }

  return calculateTableRows(
    tournamentTeams,
    tournamentMatches.filter((match) => match.phase !== "knockout"),
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

function hasDecisiveWinner(match) {
  return match.status === "finished" && match.homeScore !== match.awayScore;
}

function getWinningTeamId(match) {
  if (!hasDecisiveWinner(match)) {
    return null;
  }

  return match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId;
}

function buildWorldCupRoundOf16(tournamentId, standings, existingMatchesCount) {
  const groupedStandings = Object.fromEntries(standings.map((group) => [group.groupName, group.rows]));
  const requiredGroups = WORLD_CUP_GROUP_LETTERS;

  for (const groupLetter of requiredGroups) {
    if (!groupedStandings[groupLetter] || groupedStandings[groupLetter].length < 2) {
      return [];
    }
  }

  const pairings = [
    [groupedStandings.A[0], groupedStandings.B[1]],
    [groupedStandings.C[0], groupedStandings.D[1]],
    [groupedStandings.E[0], groupedStandings.F[1]],
    [groupedStandings.G[0], groupedStandings.H[1]],
    [groupedStandings.B[0], groupedStandings.A[1]],
    [groupedStandings.D[0], groupedStandings.C[1]],
    [groupedStandings.F[0], groupedStandings.E[1]],
    [groupedStandings.H[0], groupedStandings.G[1]],
  ];

  return pairings.map(([home, away], index) =>
    createMatch(
      tournamentId,
      "Round of 16",
      home.teamId,
      away.teamId,
      existingMatchesCount + index,
      { phase: "knockout" },
    ));
}

function buildNextKnockoutRound(tournamentId, matches, currentStage, nextStage) {
  const stageMatches = matches
    .filter((match) => match.stage === currentStage)
    .sort((left, right) => new Date(left.scheduledAt) - new Date(right.scheduledAt));

  if (stageMatches.length === 0 || !stageMatches.every(hasDecisiveWinner)) {
    return [];
  }

  const winnerIds = stageMatches.map(getWinningTeamId);

  if (winnerIds.some((winnerId) => !winnerId)) {
    return [];
  }

  const fixtures = [];
  for (let index = 0; index < winnerIds.length; index += 2) {
    fixtures.push(createMatch(
      tournamentId,
      nextStage,
      winnerIds[index],
      winnerIds[index + 1],
      matches.length + fixtures.length,
      { phase: "knockout" },
    ));
  }

  return fixtures;
}

function determineWorldCupAutoFixtures(tournament, teams, matches) {
  const tournamentMatches = matches.filter((match) => match.tournamentId === tournament.id);
  const knockoutMatches = tournamentMatches.filter((match) => match.phase === "knockout");
  const groupMatches = tournamentMatches.filter((match) => match.phase === "group");

  if (groupMatches.length > 0 && knockoutMatches.length === 0) {
    if (!groupMatches.every((match) => match.status === "finished")) {
      return [];
    }

    const groupStandings = calculateStandings(tournament, teams, matches);
    return buildWorldCupRoundOf16(tournament.id, groupStandings, tournamentMatches.length);
  }

  for (let index = 0; index < WORLD_CUP_KNOCKOUT_ORDER.length - 1; index += 1) {
    const currentStage = WORLD_CUP_KNOCKOUT_ORDER[index];
    const nextStage = WORLD_CUP_KNOCKOUT_ORDER[index + 1];
    const existingNextStage = knockoutMatches.filter((match) => match.stage === nextStage);

    if (existingNextStage.length > 0) {
      continue;
    }

    const nextFixtures = buildNextKnockoutRound(tournament.id, tournamentMatches, currentStage, nextStage);

    if (nextFixtures.length > 0) {
      return nextFixtures;
    }
  }

  return [];
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
        tournaments: data.tournaments.map((tournament) => {
          const tournamentTeams = teamsByTournament[tournament.id] || [];
          const tournamentMatches = matchesByTournament[tournament.id] || [];
          const standings = calculateStandings(tournament, data.teams, data.matches);
          const worldCupGroupMap = tournament.format === "world_cup" ? getWorldCupGroupMap(tournamentTeams) : null;

          return {
            ...tournament,
            teams: tournamentTeams.map((team) => ({
              ...team,
              groupName: tournament.format === "world_cup"
                ? getWorldCupTeamGroup(team, worldCupGroupMap || {})
                : team.groupName,
              players: playersByTeam[team.id] || [],
            })),
            matches: tournamentMatches.map((match) => ({
              ...match,
              goals: goalsByMatch[match.id] || [],
            })),
            standings: tournament.format === "world_cup" ? [] : standings,
            groupStandings: tournament.format === "world_cup" ? standings : [],
            topScorers: calculateTopScorers(tournament.id, data.teams, data.players, data.goals),
          };
        }),
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
      const tournament = data.tournaments.find((entry) => entry.id === tournamentId);
      const teams = data.teams.filter((team) => team.tournamentId === tournamentId);
      const existingMatches = data.matches.filter((match) => match.tournamentId === tournamentId);

      if (!tournament) {
        throw createError("Tournament not found", 404);
      }

      if (existingMatches.length > 0) {
        throw createError("Fixtures already exist for this tournament");
      }

      if (teams.length < 2) {
        throw createError("At least two teams are required to generate fixtures");
      }

      if (payload.format === "knockout" && teams.length % 2 !== 0) {
        throw createError("Knockout format requires an even number of teams");
      }

      if (payload.format === "world_cup" && teams.length !== 32) {
        throw createError("World Cup format requires exactly 32 teams");
      }

      if (payload.format === "world_cup") {
        validateWorldCupGroupMap(getWorldCupGroupMap(teams));
      }

      const fixtures = payload.format === "knockout"
        ? buildKnockoutMatches(tournamentId, teams)
        : payload.format === "world_cup"
          ? buildWorldCupGroupMatches(tournamentId, teams)
          : buildRoundRobinMatches(tournamentId, teams);

      return repository.createMatches(fixtures);
    },
    async updateMatchResult(matchId, payload) {
      if (payload.homeScore === undefined || payload.awayScore === undefined || !payload.status) {
        throw createError("homeScore, awayScore and status are required");
      }

      const existingData = await repository.getAll();
      const existingMatch = existingData.matches.find((entry) => entry.id === matchId);

      if (!existingMatch) {
        throw createError("Match not found", 404);
      }

      if (existingMatch.phase === "knockout" && payload.status === "finished" && payload.homeScore === payload.awayScore) {
        throw createError("Knockout matches must have a winner");
      }

      const updatedMatch = await repository.updateMatch(matchId, payload);
      const data = await repository.getAll();
      const tournament = data.tournaments.find((entry) => entry.id === updatedMatch.tournamentId);

      if (!tournament) {
        return updatedMatch;
      }

      if (tournament.format === "world_cup") {
        const autoFixtures = determineWorldCupAutoFixtures(tournament, data.teams, data.matches);

        if (autoFixtures.length > 0) {
          await repository.createMatches(autoFixtures);
        }
      }

      return updatedMatch;
    },
  };
}
