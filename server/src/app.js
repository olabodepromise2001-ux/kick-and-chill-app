import express from "express";
import cors from "cors";
import { createTournamentService } from "./services/tournamentService.js";

function requireAdmin(request, _response, next) {
  const configuredPassword = process.env.ADMIN_PASSWORD || "kickandchilladmin";
  const providedPassword = request.headers["x-admin-password"];

  if (providedPassword !== configuredPassword) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    return next(error);
  }

  return next();
}

export function createApp() {
  const app = express();
  const service = createTournamentService();

  app.use(cors());
  app.use(express.json());
  app.use((_request, response, next) => {
    response.setHeader("x-storage-mode", service.getStorageMode());
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      storageMode: service.getStorageMode(),
    });
  });

  app.get("/api/bootstrap", async (_request, response) => {
    const data = await service.getBootstrapData();
    response.json(data);
  });

  app.post("/api/admin/login", (request, response, next) => {
    const configuredPassword = process.env.ADMIN_PASSWORD || "kickandchilladmin";

    if (request.body.password !== configuredPassword) {
      const error = new Error("Invalid admin password");
      error.statusCode = 401;
      return next(error);
    }

    return response.json({ success: true });
  });

  app.post("/api/tournaments", requireAdmin, async (request, response) => {
    const tournament = await service.createTournament(request.body);
    response.status(201).json(tournament);
  });

  app.post("/api/tournaments/:tournamentId/groups", requireAdmin, async (request, response) => {
    const group = await service.createGroup(request.params.tournamentId, request.body);
    response.status(201).json(group);
  });

  app.post("/api/tournaments/:tournamentId/fixtures", requireAdmin, async (request, response) => {
    const fixture = await service.createFixture(request.params.tournamentId, request.body);
    response.status(201).json(fixture);
  });

  app.post("/api/tournaments/:tournamentId/teams", requireAdmin, async (request, response) => {
    const team = await service.addTeam(request.params.tournamentId, request.body);
    response.status(201).json(team);
  });

  app.post("/api/tournaments/:tournamentId/fixtures/generate", requireAdmin, async (request, response) => {
    const fixtures = await service.generateFixtures(request.params.tournamentId, request.body);
    response.status(201).json(fixtures);
  });

  app.post("/api/tournaments/:tournamentId/world-cup/knockout-from-standings", requireAdmin, async (request, response) => {
    const fixtures = await service.createWorldCupKnockoutFromStandings(request.params.tournamentId);
    response.status(201).json(fixtures);
  });

  app.patch("/api/matches/:matchId/fixture", requireAdmin, async (request, response) => {
    const fixture = await service.updateFixture(request.params.matchId, request.body);
    response.json(fixture);
  });

  app.patch("/api/matches/:matchId", requireAdmin, async (request, response) => {
    const match = await service.updateMatchResult(request.params.matchId, request.body);
    response.json(match);
  });

  app.delete("/api/matches/:matchId", requireAdmin, async (request, response) => {
    const result = await service.deleteFixture(request.params.matchId);
    response.json(result);
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(error.statusCode || 500).json({
      message: error.message || "Unexpected server error",
    });
  });

  return app;
}
