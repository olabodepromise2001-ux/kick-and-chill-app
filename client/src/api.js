const API_BASE_URL = "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  return response.json();
}

export function fetchBootstrap() {
  return request("/bootstrap");
}

export function createTournament(payload) {
  return request("/tournaments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addTeam(tournamentId, payload) {
  return request(`/tournaments/${tournamentId}/teams`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateFixtures(tournamentId, payload) {
  return request(`/tournaments/${tournamentId}/fixtures`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMatch(matchId, payload) {
  return request(`/matches/${matchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
