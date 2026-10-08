import type { Session } from '@supabase/supabase-js'

export async function resolveSession(session?: Session | null): Promise<Session | null> {
  if (session !== undefined) return session
  const { supabase } = await import('./supabase')
  return (await supabase?.auth.getSession())?.data.session ?? null
}
