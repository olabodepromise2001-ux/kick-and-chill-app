# Kick and Chill Hub

Kick and Chill Hub is a minimal full-stack tournament management and live score tracking app for a 5-a-side football center.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Supabase preferred, with seeded in-memory fallback for local MVP use

## Features

- Public users can view tournaments, fixtures, standings, live scores, and top scorers
- Admins use a protected `/admin` area with a dedicated `/admin/login` page
- Logged-in admins can create tournaments, add teams and players, generate fixtures, and update scores with goal scorers
- World Cup tournaments support 8 groups of 4, automatic top-2 qualification, and auto-generated knockout rounds through the final

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

## Admin Access

- Public site: `/`
- Admin login: `/admin/login`
- Protected admin area: `/admin`

Set `ADMIN_PASSWORD` in `server/.env`. If you do not set one, the fallback password is `kickandchilladmin`.

## World Cup Format

- Select `World Cup` when creating a tournament
- Add exactly 32 teams
- Optionally assign group letters `A` to `H` while adding teams
- If group letters are not supplied, teams are assigned to groups automatically during fixture generation
- Group fixtures are generated first
- When all group matches finish, the app automatically creates the Round of 16
- Quarterfinals, semifinals, and the final are generated automatically as knockout matches are completed

## Supabase Setup

1. Create a Supabase project.
2. Run the SQL in `supabase/schema.sql`.
3. Copy `server/.env.example` to `server/.env`.
4. Copy `client/.env.example` to `client/.env`.
5. Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_PASSWORD` in `server/.env`.
6. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `client/.env`.
7. In Supabase, enable Realtime for the `tournaments`, `teams`, `players`, `matches`, and `goals` tables.

If those env vars are missing, the server falls back to demo data in memory so the MVP still works.

## Live Score Updates

- The public app now uses Supabase Realtime subscriptions instead of the old 10-second polling loop.
- Match score, scorer, team, and standings changes are pushed to connected clients instantly.
- The client batches fast bursts of database events into a single refresh so updates stay efficient.

## Important Note

This environment did not have `node` or `npm` available, so the code was scaffolded but not executed here. Once Node is installed locally, run the commands above to verify and iterate.
