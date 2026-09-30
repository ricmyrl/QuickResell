import { useEffect, useState } from 'react'

export function useCountdown(endsAt: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  const remaining = Math.max(0, new Date(endsAt).getTime() - now)
  const totalSeconds = Math.floor(remaining / 1000)
  return {
    remaining,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: remaining === 0,
  }
}
