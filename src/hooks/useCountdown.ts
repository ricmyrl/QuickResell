import { useSyncExternalStore } from 'react'

let currentTime = Date.now()
let intervalId: number | null = null
const subscribers = new Set<() => void>()

function subscribe(listener: () => void) {
  subscribers.add(listener)
  if (intervalId === null) {
    intervalId = window.setInterval(() => {
      currentTime = Date.now()
      subscribers.forEach((subscriber) => subscriber())
    }, 1000)
  }

  return () => {
    subscribers.delete(listener)
    if (subscribers.size === 0 && intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }
}

function getSnapshot() {
  return currentTime
}

export function useCountdown(endsAt: string) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
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
