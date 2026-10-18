import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// The fictional demo (demo.js) installs an in-browser stand-in before this module loads.
const standIn = globalThis.otfDemoBackend;
export const demo = Boolean(standIn);
export const configured = demo || Boolean(url && key);
export const supabase = standIn || (url && key
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null);
