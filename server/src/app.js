import express from "express";
import cors from "cors";
import { createTournamentService } from "./services/tournamentService.js";

export function createApp() {
  const app = express();
  const service = createTournamentService();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/bootstrap", async (_request, response) => {
    const data = await service.getBootstrapData();
    response.json(data);
  });

  app.post("/api/tournaments", async (request, response) => {
    const tournament = await service.createTournament(request.body);
    response.status(201).json(tournament);
  });

  app.post("/api/tournaments/:tournamentId/teams", async (request, response) => {
    const team = await service.addTeam(request.params.tournamentId, request.body);
    response.status(201).json(team);
  });

  app.post("/api/tournaments/:tournamentId/fixtures", async (request, response) => {
    const fixtures = await service.generateFixtures(request.params.tournamentId, request.body);
    response.status(201).json(fixtures);
  });

  app.patch("/api/matches/:matchId", async (request, response) => {
    const match = await service.updateMatchResult(request.params.matchId, request.body);
    response.json(match);
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(error.statusCode || 500).json({
      message: error.message || "Unexpected server error",
    });
  });

  return app;
}
