import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/auth'

export function createChatSupabaseClient() {
  const session = typeof window === 'undefined' ? null : getSession()

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON!,
    {
      global: {
        headers: session?.session
          ? { 'x-session-token': session.session }
          : {},
      },
    }
  )
}
