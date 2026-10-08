import { useEffect, useRef } from 'react'
import { useSeenTracker } from '../stores/useSeenTracker'

const requiredVisibleMs = 1_500

export function useTrackVisibility(itemId: string) {
  const elementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return

    let visibleTimer: number | null = null
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (visibleTimer === null) {
          visibleTimer = window.setTimeout(() => {
            useSeenTracker.getState().markSeen(itemId)
            visibleTimer = null
          }, requiredVisibleMs)
        }
      } else if (visibleTimer !== null) {
        window.clearTimeout(visibleTimer)
        visibleTimer = null
      }
    }, { threshold: [0, 0.5] })

    observer.observe(element)
    return () => {
      observer.disconnect()
      if (visibleTimer !== null) window.clearTimeout(visibleTimer)
    }
  }, [itemId])

  return elementRef
}
