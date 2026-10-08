import { create } from 'zustand'

const storageKey = 'quickresell:seen-ids:v1'
const maxSeenIds = 100

function clearLegacyFeedObjectCache(): void {
  try {
    const legacyPrefix = 'quickresell:feed-pages:v1:'
    const legacyKeys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(legacyPrefix)) legacyKeys.push(key)
    }
    legacyKeys.forEach((key) => window.localStorage.removeItem(key))
  } catch (error) {
    console.warn('Could not clear the legacy product feed cache.', error)
  }
}

function readSeenIds(): Set<string> {
  clearLegacyFeedObjectCache()
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
      window.localStorage.removeItem(storageKey)
      return new Set()
    }
    return new Set(parsed
      .filter((id): id is string => typeof id === 'string' && id.length <= 128 && /^[A-Za-z0-9_-]+$/.test(id))
      .slice(-maxSeenIds))
  } catch (error) {
    try {
      window.localStorage.removeItem(storageKey)
    } catch (cleanupError) {
      console.warn('Could not remove corrupted seen product IDs.', cleanupError)
    }
    console.warn('Could not restore seen product IDs.', error)
    return new Set()
  }
}

function persistSeenIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids].slice(-maxSeenIds)))
  } catch (error) {
    console.warn('Could not persist seen product IDs.', error)
  }
}

interface SeenTrackerState {
  seenIds: Set<string>
  markSeen: (id: string) => void
  clearSeen: () => void
}

export const useSeenTracker = create<SeenTrackerState>((set, get) => ({
  seenIds: typeof window === 'undefined' ? new Set() : readSeenIds(),
  markSeen: (id) => {
    if (!id || get().seenIds.has(id)) return
    const next = new Set(get().seenIds)
    next.add(id)
    while (next.size > maxSeenIds) {
      const oldest = next.values().next().value
      if (oldest === undefined) break
      next.delete(oldest)
    }
    set({ seenIds: next })
    persistSeenIds(next)
  },
  clearSeen: () => {
    set({ seenIds: new Set() })
    try {
      window.localStorage.removeItem(storageKey)
    } catch (error) {
      console.warn('Could not clear persisted seen product IDs.', error)
    }
  },
}))
