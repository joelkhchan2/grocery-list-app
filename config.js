// Public by design (Supabase anon key). RLS + disabled signups are the guard.
// The two household User UIDs are NOT needed here — they live only in the RLS
// policy (supabase/schema.sql), enforced server-side. The client needs just these two.
export const SUPABASE_URL = "https://otesgvqcxrzpxsjolwqh.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_wjbB-OiSmxAXg-KVd0os3A_uaBWqD0K";

// Household members, for the tiny "who added this" initial on each item.
// Keyed by Supabase auth user id (the same ids as the RLS policy in schema.sql).
export const MEMBERS = {
  "4ec75d05-7398-418c-99cf-aff7ac137602": { initial: "J", color: "#2b4c9b" },  // Joel
  "c704c703-af29-461a-bb3c-651dd91ac5b1": { initial: "G", color: "#cf5a75" },  // Gabrielle
};
