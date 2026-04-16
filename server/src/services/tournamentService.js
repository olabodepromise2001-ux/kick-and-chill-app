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
    groups: structuredClone(demoData.groups || []),
    teams: structuredClone(demoData.teams),
    players: structuredClone(demoData.players),
    matches: structuredClone(demoData.matches),
    goals: structuredClone(demoData.goals),
    notifications: structuredClone(demoData.notifications || []),
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
    groupId: item.groupId || item.group_id || null,
    groupName: item.groupName || item.group_name || null,
  };
}

function normalizeGroup(item) {
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
    phase: item.phase || "league",
    groupId: item.groupId || item.group_id || null,
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

function normalizeNotification(item) {
  return {
    id: item.id,
    tournamentId: item.tournamentId || item.tournament_id,
    type: item.type,
    message: item.message,
    createdAt: item.createdAt || item.created_at,
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
    async createGroup(tournamentId, payload) {
      const group = {
        id: `group-${crypto.randomUUID()}`,
        tournamentId,
        name: payload.name,
      };
      state.groups.push(group);
      return group;
    },
    async addTeam(tournamentId, payload) {
      const team = {
        id: `team-${crypto.randomUUID()}`,
        tournamentId,
        name: payload.name,
        groupId: payload.groupId || null,
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
    async createFixture(payload) {
      const fixture = {
        id: `match-${crypto.randomUUID()}`,
        ...payload,
      };
      state.matches.push(fixture);
      return fixture;
    },
    async createNotification(payload) {
      const notification = {
        id: `notification-${crypto.randomUUID()}`,
        tournamentId: payload.tournamentId,
        type: payload.type,
        message: payload.message,
        createdAt: new Date().toISOString(),
      };
      state.notifications.unshift(notification);
      return notification;
    },
    async updateFixture(matchId, payload) {
      const match = state.matches.find((entry) => entry.id === matchId);
      if (!match) {
        throw createError("Fixture not found", 404);
      }

      Object.assign(match, payload);
      return structuredClone(match);
    },
    async deleteFixture(matchId) {
      const matchIndex = state.matches.findIndex((entry) => entry.id === matchId);
      if (matchIndex === -1) {
        throw createError("Fixture not found", 404);
      }

      state.matches.splice(matchIndex, 1);
      state.goals = state.goals.filter((goal) => goal.matchId !== matchId);
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
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  return {
    async getAll() {
      const [tournaments, groups, teams, players, matches, goals, notifications] = await Promise.all([
        supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
        supabase.from("groups").select("*").order("name", { ascending: true }),
        supabase.from("teams").select("*"),
        supabase.from("players").select("*"),
        supabase.from("matches").select("*").order("scheduled_at", { ascending: true }),
        supabase.from("goals").select("*").order("minute", { ascending: true }),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      ]);

      for (const result of [tournaments, groups, teams, players, matches, goals, notifications]) {
        if (result.error) {
          throw createError(result.error.message, 500);
        }
      }

      return {
        tournaments: tournaments.data.map(normalizeTournament),
        groups: groups.data.map(normalizeGroup),
        teams: teams.data.map(normalizeTeam),
        players: players.data.map(normalizePlayer),
        matches: matches.data.map(normalizeMatch),
        goals: goals.data.map(normalizeGoal),
        notifications: notifications.data.map(normalizeNotification),
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
    async createGroup(tournamentId, payload) {
      const result = await supabase
        .from("groups")
        .insert({
          tournament_id: tournamentId,
          name: payload.name,
        })
        .select()
        .single();

      if (result.error) {
        throw createError(result.error.message, 500);
      }

      return normalizeGroup(result.data);
    },
    async addTeam(tournamentId, payload) {
      const teamInsert = await supabase
        .from("teams")
        .insert({
          tournament_id: tournamentId,
          name: payload.name,
          group_id: payload.groupId || null,
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
            group_id: match.groupId || null,
            group_name: match.groupName || null,
          })),
        )
        .select();

      if (result.error) {
        throw createError(result.error.message, 500);
      }

      return result.data.map(normalizeMatch);
    },
    async createFixture(payload) {
      const result = await supabase
        .from("matches")
        .insert({
          tournament_id: payload.tournamentId,
          stage: payload.stage,
          home_team_id: payload.homeTeamId,
          away_team_id: payload.awayTeamId,
          home_score: payload.homeScore,
          away_score: payload.awayScore,
          status: payload.status,
          scheduled_at: payload.scheduledAt,
          phase: payload.phase || "league",
          group_id: payload.groupId || null,
          group_name: payload.groupName || null,
        })
        .select()
        .single();

      if (result.error) {
        throw createError(result.error.message, 500);
      }

      return normalizeMatch(result.data);
    },
    async createNotification(payload) {
      const result = await supabase
        .from("notifications")
        .insert({
          tournament_id: payload.tournamentId,
          type: payload.type,
          message: payload.message,
        })
        .select()
        .single();

      if (result.error) {
        throw createError(result.error.message, 500);
      }

      return normalizeNotification(result.data);
    },
    async updateFixture(matchId, payload) {
      const result = await supabase
        .from("matches")
        .update({
          stage: payload.stage,
          home_team_id: payload.homeTeamId,
          away_team_id: payload.awayTeamId,
          scheduled_at: payload.scheduledAt,
          phase: payload.phase || "league",
          group_id: payload.groupId || null,
          group_name: payload.groupName || null,
        })
        .eq("id", matchId)
        .select()
        .single();

      if (result.error) {
        throw createError(result.error.message, 500);
      }

      return normalizeMatch(result.data);
    },
    async deleteFixture(matchId) {
      const result = await supabase.from("matches").delete().eq("id", matchId);
      if (result.error) {
        throw createError(result.error.message, 500);
      }
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

function describeFixtureMessage(homeTeamName, awayTeamName, scheduledAt) {
  return `📅 New fixture: ${homeTeamName} vs ${awayTeamName} scheduled for ${new Date(scheduledAt).toLocaleString("en-NG")}`;
}

function describeGoalMessage(homeTeamName, awayTeamName, scorers) {
  const scorerText = scorers.length > 0 ? scorers.join(", ") : "goal recorded";
  return `⚽ Goal! ${homeTeamName} vs ${awayTeamName} - ${scorerText}`;
}

async function createFixtureNotifications(repository, fixtures, teams) {
  for (const fixture of fixtures) {
    const homeTeam = teams.find((team) => team.id === fixture.homeTeamId);
    const awayTeam = teams.find((team) => team.id === fixture.awayTeamId);

    await repository.createNotification({
      tournamentId: fixture.tournamentId,
      type: "fixture",
      message: describeFixtureMessage(homeTeam?.name || "Home Team", awayTeam?.name || "Away Team", fixture.scheduledAt),
    });
  }
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
    groupId: extras.groupId || null,
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

function getWorldCupGroups(tournamentId, groups, teams) {
  const tournamentGroups = groups
    .filter((group) => group.tournamentId === tournamentId)
    .sort((left, right) => left.name.localeCompare(right.name));

  return tournamentGroups.map((group) => ({
    ...group,
    teams: teams.filter((team) => team.groupId === group.id),
  }));
}

function buildWorldCupGroupMatches(tournamentId, groups) {
  const fixtures = [];
  let offset = 0;

  for (const group of groups) {
    const groupTeams = group.teams;

    for (let first = 0; first < groupTeams.length; first += 1) {
      for (let second = first + 1; second < groupTeams.length; second += 1) {
        fixtures.push(createMatch(
          tournamentId,
          `Group ${group.name}`,
          groupTeams[first].id,
          groupTeams[second].id,
          offset,
          {
            phase: "group",
            groupId: group.id,
            groupName: group.name,
          },
        ));
        offset += 1;
      }
    }
  }

  return fixtures;
}

function validateWorldCupGroups(groups) {
  if (groups.length !== WORLD_CUP_GROUP_LETTERS.length) {
    throw createError("World Cup format requires groups A to H");
  }

  for (let index = 0; index < WORLD_CUP_GROUP_LETTERS.length; index += 1) {
    const expectedGroup = WORLD_CUP_GROUP_LETTERS[index];
    const group = groups[index];
    if (!group || group.name.toUpperCase() !== expectedGroup || group.teams.length !== 4) {
      throw createError("Each World Cup group must contain exactly 4 teams");
    }
  }
}

function getWorldCupTeamGroup(team, groups) {
  return groups.find((group) => group.id === team.groupId)?.name || null;
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

function calculateStandings(tournament, groups, teams, matches) {
  const tournamentTeams = teams.filter((team) => team.tournamentId === tournament.id);
  const tournamentMatches = matches.filter((match) => match.tournamentId === tournament.id);

  if (tournament.format === "world_cup") {
    return getWorldCupGroups(tournament.id, groups, tournamentTeams).map((group) => ({
      groupId: group.id,
      groupName: group.name,
      rows: calculateTableRows(
        group.teams,
        tournamentMatches.filter((match) => match.phase === "group" && match.groupId === group.id),
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
  const groupedStandings = Object.fromEntries(standings.map((group) => [group.groupName.toUpperCase(), group.rows]));
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
      { phase: "knockout", groupId: null, groupName: null },
    ));
}

function createFixtureRecord(tournament, groups, teams, payload) {
  const homeTeam = teams.find((team) => team.id === payload.homeTeamId);
  const awayTeam = teams.find((team) => team.id === payload.awayTeamId);

  if (!homeTeam || !awayTeam) {
    throw createError("Home and away teams must belong to the selected tournament");
  }

  if (homeTeam.id === awayTeam.id) {
    throw createError("Home and away teams must be different");
  }

  const selectedGroup = payload.groupId
    ? groups.find((group) => group.id === payload.groupId && group.tournamentId === tournament.id)
    : null;

  if (payload.groupId && !selectedGroup) {
    throw createError("Selected group was not found for this tournament");
  }

  if (tournament.format === "world_cup" && payload.phase === "group") {
    if (!selectedGroup) {
      throw createError("World Cup group fixtures must belong to a group");
    }

    if (homeTeam.groupId !== selectedGroup.id || awayTeam.groupId !== selectedGroup.id) {
      throw createError("Group fixtures must use teams from the selected group");
    }
  }

  return {
    tournamentId: tournament.id,
    stage: payload.stage || (payload.phase === "knockout" ? "Knockout" : "Group Match"),
    homeTeamId: payload.homeTeamId,
    awayTeamId: payload.awayTeamId,
    homeScore: payload.homeScore ?? 0,
    awayScore: payload.awayScore ?? 0,
    status: payload.status || "upcoming",
    scheduledAt: payload.scheduledAt || new Date().toISOString(),
    phase: payload.phase || "league",
    groupId: selectedGroup?.id || null,
    groupName: selectedGroup?.name || null,
  };
}

export function createTournamentService() {
  const repository = createSupabaseRepository() || createLocalRepository();
  const storageMode = repository ? (process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ? "supabase" : "fallback") : "fallback";

  return {
    getStorageMode() {
      return storageMode;
    },
    async getBootstrapData() {
      // Bootstrap returns a denormalized shape so the frontend can stay very small.
      const data = await repository.getAll();
      const goalsByMatch = groupBy(data.goals, (goal) => goal.matchId);
      const playersByTeam = groupBy(data.players, (player) => player.teamId);
      const groupsByTournament = groupBy(data.groups || [], (group) => group.tournamentId);
      const notificationsByTournament = groupBy(data.notifications || [], (notification) => notification.tournamentId);
      const teamsByTournament = groupBy(data.teams, (team) => team.tournamentId);
      const matchesByTournament = groupBy(data.matches, (match) => match.tournamentId);

      return {
        tournaments: data.tournaments.map((tournament) => {
          const tournamentGroups = groupsByTournament[tournament.id] || [];
          const tournamentTeams = teamsByTournament[tournament.id] || [];
          const tournamentMatches = matchesByTournament[tournament.id] || [];
          const standings = calculateStandings(tournament, data.groups || [], data.teams, data.matches);

          return {
            ...tournament,
            groups: tournamentGroups,
            teams: tournamentTeams.map((team) => ({
              ...team,
              groupName: tournament.format === "world_cup"
                ? getWorldCupTeamGroup(team, tournamentGroups)
                : team.groupName,
              players: playersByTeam[team.id] || [],
            })),
            matches: tournamentMatches.map((match) => ({
              ...match,
              goals: goalsByMatch[match.id] || [],
            })),
            notifications: notificationsByTournament[tournament.id] || [],
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
    async createGroup(tournamentId, payload) {
      const data = await repository.getAll();
      const tournament = data.tournaments.find((entry) => entry.id === tournamentId);

      if (!tournament) {
        throw createError("Tournament not found", 404);
      }

      if (tournament.format !== "world_cup") {
        throw createError("Groups are only available for World Cup tournaments");
      }

      if (!payload.name) {
        throw createError("Group name is required");
      }

      const existingGroups = (data.groups || [])
        .filter((group) => group.tournamentId === tournamentId)
        .map((group) => group.name.toUpperCase());

      const groupName = payload.name.trim().toUpperCase();

      if (!WORLD_CUP_GROUP_LETTERS.includes(groupName)) {
        throw createError("World Cup groups must be named A to H");
      }

      if (existingGroups.includes(groupName)) {
        throw createError("Group already exists");
      }

      return repository.createGroup(tournamentId, { name: groupName });
    },
    async addTeam(tournamentId, payload) {
      const data = await repository.getAll();
      const tournament = data.tournaments.find((entry) => entry.id === tournamentId);

      if (!tournament) {
        throw createError("Tournament not found", 404);
      }

      if (!payload.name) {
        throw createError("Team name is required");
      }

      if (tournament.format === "world_cup") {
        if (!payload.groupId) {
          throw createError("World Cup teams must belong to a group");
        }

        const group = (data.groups || []).find((entry) => entry.id === payload.groupId && entry.tournamentId === tournamentId);

        if (!group) {
          throw createError("Selected group was not found for this tournament");
        }
      }

      return repository.addTeam(tournamentId, payload);
    },
    async createFixture(tournamentId, payload) {
      const data = await repository.getAll();
      const tournament = data.tournaments.find((entry) => entry.id === tournamentId);
      const groups = (data.groups || []).filter((group) => group.tournamentId === tournamentId);
      const teams = data.teams.filter((team) => team.tournamentId === tournamentId);

      if (!tournament) {
        throw createError("Tournament not found", 404);
      }

      const fixture = createFixtureRecord(tournament, groups, teams, payload);
      const createdFixture = await repository.createFixture(fixture);
      await createFixtureNotifications(repository, [createdFixture], teams);
      return createdFixture;
    },
    async updateFixture(matchId, payload) {
      const data = await repository.getAll();
      const existingMatch = data.matches.find((entry) => entry.id === matchId);

      if (!existingMatch) {
        throw createError("Fixture not found", 404);
      }

      const tournament = data.tournaments.find((entry) => entry.id === existingMatch.tournamentId);
      const groups = (data.groups || []).filter((group) => group.tournamentId === existingMatch.tournamentId);
      const teams = data.teams.filter((team) => team.tournamentId === existingMatch.tournamentId);

      if (!tournament) {
        throw createError("Tournament not found", 404);
      }

      const fixture = createFixtureRecord(tournament, groups, teams, {
        ...existingMatch,
        ...payload,
        homeScore: existingMatch.homeScore,
        awayScore: existingMatch.awayScore,
        status: existingMatch.status,
      });

      const updatedFixture = await repository.updateFixture(matchId, fixture);
      await createFixtureNotifications(repository, [updatedFixture], teams);
      return updatedFixture;
    },
    async deleteFixture(matchId) {
      await repository.deleteFixture(matchId);
      return { success: true };
    },
    async generateFixtures(tournamentId, payload) {
      const data = await repository.getAll();
      const tournament = data.tournaments.find((entry) => entry.id === tournamentId);
      const groups = (data.groups || []).filter((group) => group.tournamentId === tournamentId);
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
        throw createError("World Cup fixtures are admin-managed. Create fixtures manually instead.");
      }

      const fixtures = payload.format === "knockout"
        ? buildKnockoutMatches(tournamentId, teams)
        : buildRoundRobinMatches(tournamentId, teams);

      const createdFixtures = await repository.createMatches(fixtures);
      await createFixtureNotifications(repository, createdFixtures, teams);
      return createdFixtures;
    },
    async createWorldCupKnockoutFromStandings(tournamentId) {
      const data = await repository.getAll();
      const tournament = data.tournaments.find((entry) => entry.id === tournamentId);

      if (!tournament) {
        throw createError("Tournament not found", 404);
      }

      if (tournament.format !== "world_cup") {
        throw createError("This helper is only available for World Cup tournaments");
      }

      const tournamentMatches = data.matches.filter((match) => match.tournamentId === tournamentId);
      const existingKnockout = tournamentMatches.filter((match) => match.phase === "knockout");

      if (existingKnockout.length > 0) {
        throw createError("Knockout fixtures already exist for this tournament");
      }

      const groupStandings = calculateStandings(tournament, data.groups || [], data.teams, data.matches);

      if (groupStandings.some((group) => group.rows.length < 2)) {
        throw createError("Each group must have at least two teams");
      }

      const groupFixtures = tournamentMatches.filter((match) => match.phase === "group");
      if (groupFixtures.length === 0 || !groupFixtures.every((match) => match.status === "finished")) {
        throw createError("Finish all group fixtures before generating knockout fixtures from standings");
      }

      const fixtures = buildWorldCupRoundOf16(tournamentId, groupStandings, tournamentMatches.length);
      const createdFixtures = await repository.createMatches(fixtures);
      const teams = data.teams.filter((team) => team.tournamentId === tournamentId);
      await createFixtureNotifications(repository, createdFixtures, teams);
      return createdFixtures;
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
      const tournament = existingData.tournaments.find((entry) => entry.id === existingMatch.tournamentId);
      const teams = existingData.teams.filter((team) => team.tournamentId === existingMatch.tournamentId);
      const players = existingData.players;
      const homeTeam = teams.find((team) => team.id === existingMatch.homeTeamId);
      const awayTeam = teams.find((team) => team.id === existingMatch.awayTeamId);
      const scorerNames = (payload.goals || []).map((goal) => {
        const player = players.find((entry) => entry.id === goal.playerId);
        return player ? `${player.name} ${goal.minute}'` : `Unknown ${goal.minute}'`;
      });

      if (tournament && (payload.goals || []).length > 0) {
        await repository.createNotification({
          tournamentId: tournament.id,
          type: "goal",
          message: describeGoalMessage(homeTeam?.name || "Home Team", awayTeam?.name || "Away Team", scorerNames),
        });
      }

      return updatedMatch;
    },
  };
}
