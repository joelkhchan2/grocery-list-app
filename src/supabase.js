import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";
let _client;
export function getClient() {
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } });
  return _client;
}
