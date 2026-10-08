import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { MarketplaceListing } from '../types'
import { getStoreListings } from '../services/cartApi'
import { useSeenTracker } from '../stores/useSeenTracker'

const storePageSize = 12

interface StorePage {
  items: MarketplaceListing[]
  nextCursor: string | null
}

export function useStoreFeed(session: Session | null, scope: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [feedCycle, setFeedCycle] = useState(() => ({
    version: 0,
    seenIds: [...useSeenTracker.getState().seenIds].slice(-100).sort(),
  }))
  const queryKey = useMemo(() => [
    'store-feed',
    scope,
    feedCycle.version,
    feedCycle.seenIds.join(','),
  ] as const, [scope, feedCycle])
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => getStoreListings(session, pageParam, storePageSize, feedCycle.seenIds, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 0,
    gcTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
  const listings = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return
    await fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const refresh = useCallback(() => {
    const seenIds = [...useSeenTracker.getState().seenIds].slice(-100).sort()
    setFeedCycle((current) => ({ version: current.version + 1, seenIds }))
  }, [])

  const updateListings = useCallback((
    update: (listing: MarketplaceListing) => MarketplaceListing | null,
  ) => {
    queryClient.setQueryData<InfiniteData<StorePage, string | null>>(queryKey, (current) => {
      if (!current) return current
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: page.items.flatMap((listing) => {
            const updated = update(listing)
            return updated ? [updated] : []
          }),
        })),
      }
    })
  }, [queryClient, queryKey])

  return {
    listings,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : '',
    hasMore: Boolean(hasNextPage),
    loadingMore: isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError && query.error instanceof Error ? query.error.message : '',
    loadMore,
    refresh,
    refreshing: query.isLoading && feedCycle.version > 0,
    updateListings,
  }
}
