import { createClient } from '@supabase/supabase-js'

// V25.5 Universal Master Key (Admin Client) for background Cron jobs
// This client bypasses RLS and does NOT require browser cookies/session.
export const createAdminSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_key'
  
  return createClient(supabaseUrl, supabaseKey)
}

// Keep legacy export for any existing system scripts if necessary
export const createServerSupabase = createAdminSupabase
