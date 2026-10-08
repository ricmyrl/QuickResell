type FeedType = 'auctions' | 'store'

interface CachedPage<T> {
  version: 1
  cachedAt: number
  items: T[]
  nextCursor: string | null
}

const cachePrefix = 'quickresell:feed-pages:v1'
const cacheTtlMs = 3 * 60 * 1000
const maxPagesPerFeed = 16
const maxCachedPages = 40

function pageKey(feed: FeedType, scope: string, cursor: string | null): string {
  return `${cachePrefix}:${feed}:${encodeURIComponent(scope)}:${encodeURIComponent(cursor ?? 'first')}`
}

export function getCachedFeedPage<T>(
  feed: FeedType,
  scope: string,
  cursor: string | null,
): { items: T[]; nextCursor: string | null } | null {
  try {
    const key = pageKey(feed, scope, cursor)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const cached: unknown = JSON.parse(raw)
    if (
      typeof cached !== 'object' || cached === null ||
      !('version' in cached) || cached.version !== 1 ||
      !('cachedAt' in cached) || typeof cached.cachedAt !== 'number' ||
      !('items' in cached) || !Array.isArray(cached.items) ||
      !('nextCursor' in cached) || (typeof cached.nextCursor !== 'string' && cached.nextCursor !== null)
    ) {
      window.localStorage.removeItem(key)
      return null
    }

    if (Date.now() - cached.cachedAt > cacheTtlMs) {
      window.localStorage.removeItem(key)
      return null
    }

    return { items: cached.items as T[], nextCursor: cached.nextCursor }
  } catch (error) {
    console.warn('Could not read cached marketplace feed page.', { feed, error })
    return null
  }
}

export function setCachedFeedPage<T>(
  feed: FeedType,
  scope: string,
  cursor: string | null,
  page: { items: T[]; nextCursor: string | null },
): void {
  try {
    const key = pageKey(feed, scope, cursor)
    const cached: CachedPage<T> = {
      version: 1,
      cachedAt: Date.now(),
      items: page.items,
      nextCursor: page.nextCursor,
    }
    window.localStorage.setItem(key, JSON.stringify(cached))

    const prefix = `${cachePrefix}:`
    let cachedKeys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storedKey = window.localStorage.key(index)
      if (storedKey?.startsWith(prefix)) cachedKeys.push(storedKey)
    }
    const scopePrefix = `${cachePrefix}:${feed}:${encodeURIComponent(scope)}:`
    const scopeKeys = cachedKeys.filter((storedKey) => storedKey.startsWith(scopePrefix))
    if (scopeKeys.length > maxPagesPerFeed) {
      const oldestKeys = scopeKeys
        .filter((storedKey) => storedKey !== key)
        .slice(0, scopeKeys.length - maxPagesPerFeed)
      oldestKeys.forEach((storedKey) => window.localStorage.removeItem(storedKey))
      cachedKeys = cachedKeys.filter((storedKey) => !oldestKeys.includes(storedKey))
    }
    if (cachedKeys.length > maxCachedPages) {
      cachedKeys
        .filter((storedKey) => storedKey !== key)
        .slice(0, cachedKeys.length - maxCachedPages)
        .forEach((storedKey) => window.localStorage.removeItem(storedKey))
    }
  } catch (error) {
    console.warn('Could not cache marketplace feed page.', { feed, error })
  }
}
