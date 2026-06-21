import { createClient } from '@supabase/supabase-js'

// Public, browser-safe values (the publishable key is RLS-gated). When unset,
// the app stays in local-first IndexedDB mode and never touches Supabase.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCloud = () => Boolean(url && key)
export const supabase = isCloud() ? createClient(url, key) : null
