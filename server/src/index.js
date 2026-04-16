import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const port = process.env.PORT || 4000;
const app = createApp();
const hasSupabaseConfig = Boolean(
  process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
);
const storageMode = hasSupabaseConfig ? "supabase" : "fallback";

app.listen(port, () => {
  console.log(`Kick and Chill Hub API running on http://localhost:${port}`);
  console.log(`Storage mode: ${storageMode}`);
  if (storageMode === "fallback") {
    console.warn("Supabase env vars are missing or empty. Using in-memory fallback demo data.");
  }
});
