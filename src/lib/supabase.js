import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = 'https://cxjenbyrvozienagshzy.supabase.co'
const supabaseAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4amVuYnlydm96aWVuYWdzaHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NzQ1NDAsImV4cCI6MjA4OTQ1MDU0MH0.Nn5-50Omv-Jj_UP1yvoIpje78Us7XK72FddgVHny_EI'

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
