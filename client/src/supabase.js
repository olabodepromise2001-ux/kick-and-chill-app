import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient = null;

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

export function subscribeToRealtimeUpdates(onChange) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return () => {};
  }

  const channel = supabase.channel("kick-and-chill-live-updates");
  const tables = ["tournaments", "teams", "players", "matches", "goals"];

  for (const table of tables) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
      },
      onChange,
    );
  }

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
