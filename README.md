# Kick and Chill Hub

Kick and Chill Hub is a minimal full-stack tournament management and live score tracking app for a 5-a-side football center.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Supabase preferred, with seeded in-memory fallback for local MVP use

## Features

- Admin can create tournaments
- Admin can add teams and players
- Admin can generate round-robin or knockout fixtures
- Admin can update scores and record goal scorers
- Users can view tournaments, fixtures, standings, live scores, and top scorers

## Project Structure

- `client/` React app
- `server/` Express API
- `supabase/schema.sql` database schema

## Run Locally

1. Install Node.js 20+ and npm.
2. From the project root, install dependencies:

```bash
npm run install:all
```

3. Start the API:

```bash
npm run dev:server
```

4. In a second terminal, start the frontend:

```bash
npm run dev:client
```

5. Open the local Vite URL shown in your terminal, usually `http://localhost:5173`.

## Supabase Setup

1. Create a Supabase project.
2. Run the SQL in `supabase/schema.sql`.
3. Copy `server/.env.example` to `server/.env`.
4. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

If those env vars are missing, the server falls back to demo data in memory so the MVP still works.

## Important Note

This environment did not have `node` or `npm` available, so the code was scaffolded but not executed here. Once Node is installed locally, run the commands above to verify and iterate.
