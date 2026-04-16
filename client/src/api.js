const API_BASE_URL = "http://localhost:4000/api";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
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

export function loginAdmin(password) {
  return request("/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

function getAdminHeaders(password) {
  return {
    "x-admin-password": password,
  };
}

export function createTournament(payload, password) {
  return request("/tournaments", {
    method: "POST",
    headers: getAdminHeaders(password),
    body: JSON.stringify(payload),
  });
}

export function addTeam(tournamentId, payload, password) {
  return request(`/tournaments/${tournamentId}/teams`, {
    method: "POST",
    headers: getAdminHeaders(password),
    body: JSON.stringify(payload),
  });
}

export function generateFixtures(tournamentId, payload, password) {
  return request(`/tournaments/${tournamentId}/fixtures`, {
    method: "POST",
    headers: getAdminHeaders(password),
    body: JSON.stringify(payload),
  });
}

export function updateMatch(matchId, payload, password) {
  return request(`/matches/${matchId}`, {
    method: "PATCH",
    headers: getAdminHeaders(password),
    body: JSON.stringify(payload),
  });
}

export { subscribeToRealtimeUpdates } from "./supabase.js";
