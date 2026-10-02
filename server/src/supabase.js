import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

let supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co'
supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'

export const db = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})
