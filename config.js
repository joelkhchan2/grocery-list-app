// Public by design (Supabase anon key). RLS + disabled signups are the guard.
// The two household User UIDs are NOT needed here — they live only in the RLS
// policy (supabase/schema.sql), enforced server-side. The client needs just these two.
export const SUPABASE_URL = "https://otesgvqcxrzpxsjolwqh.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_wjbB-OiSmxAXg-KVd0os3A_uaBWqD0K";
