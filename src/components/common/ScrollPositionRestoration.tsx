import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType, type Location } from 'react-router-dom'

const storageKey = 'quickresell:scroll-positions'
const maxSavedPositions = 40

type ScrollPosition = { x: number; y: number }
type SavedPositions = {
  byEntry: Record<string, ScrollPosition>
  byUrl: Record<string, ScrollPosition>
}

const memoryPositions: SavedPositions = { byEntry: {}, byUrl: {} }

function locationUrl(location: Location): string {
  return `${location.pathname}${location.search}${location.hash}`
}

function readPositions(): SavedPositions {
  try {
    const saved = window.sessionStorage.getItem(storageKey)
    if (!saved) return memoryPositions
    const parsed = JSON.parse(saved) as Partial<SavedPositions>
    return {
      byEntry: parsed.byEntry && typeof parsed.byEntry === 'object' ? parsed.byEntry : {},
      byUrl: parsed.byUrl && typeof parsed.byUrl === 'object' ? parsed.byUrl : {},
    }
  } catch {
    return memoryPositions
  }
}

function writePositions(positions: SavedPositions): void {
  const bounded: SavedPositions = {
    byEntry: Object.fromEntries(Object.entries(positions.byEntry).slice(-maxSavedPositions)),
    byUrl: Object.fromEntries(Object.entries(positions.byUrl).slice(-maxSavedPositions)),
  }
  memoryPositions.byEntry = bounded.byEntry
  memoryPositions.byUrl = bounded.byUrl
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(bounded))
  } catch {
    // Keep the in-memory positions when browser storage is unavailable.
  }
}

function getSavedPosition(location: Location): ScrollPosition | undefined {
  const positions = readPositions()
  return positions.byEntry[location.key] ?? positions.byUrl[locationUrl(location)]
}

function savePosition(location: Location): void {
  const positions = readPositions()
  const position = { x: window.scrollX, y: window.scrollY }
  positions.byEntry[location.key] = position
  positions.byUrl[locationUrl(location)] = position
  writePositions(positions)
}

export function ScrollPositionRestoration() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const currentLocation = useRef<Location | null>(null)

  useLayoutEffect(() => {
    const previousLocation = currentLocation.current
    if (previousLocation) savePosition(previousLocation)
    currentLocation.current = location

    let frame = 0
    let timeout = 0
    let resizeObserver: ResizeObserver | undefined
    let mutationObserver: MutationObserver | undefined
    let finished = false
    const target = navigationType === 'PUSH' ? undefined : getSavedPosition(location)

    const cleanup = () => {
      finished = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('wheel', cancelForUserInput)
      window.removeEventListener('touchstart', cancelForUserInput)
      window.removeEventListener('keydown', cancelForScrollKey)
    }

    function cancelForUserInput() {
      cleanup()
    }

    function cancelForScrollKey(event: KeyboardEvent) {
      if (['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(event.key)) {
        cleanup()
      }
    }

    if (!target || (target.x === 0 && target.y === 0)) {
      window.scrollTo(0, 0)
      return cleanup
    }

    const restoreWhenContentIsReady = () => {
      if (finished) return
      frame = 0
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (maxY >= target.y) {
        window.scrollTo(target.x, target.y)
        cleanup()
      }
    }
    const scheduleRestore = () => {
      if (!finished && frame === 0) frame = window.requestAnimationFrame(restoreWhenContentIsReady)
    }

    resizeObserver = new ResizeObserver(scheduleRestore)
    resizeObserver.observe(document.documentElement)
    mutationObserver = new MutationObserver(scheduleRestore)
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('wheel', cancelForUserInput, { passive: true })
    window.addEventListener('touchstart', cancelForUserInput, { passive: true })
    window.addEventListener('keydown', cancelForScrollKey)
    timeout = window.setTimeout(() => {
      if (!finished) {
        window.scrollTo(target.x, target.y)
        cleanup()
      }
    }, 8000)
    scheduleRestore()

    return cleanup
  }, [location, navigationType])

  useEffect(() => {
    let saveTimer = 0
    const saveCurrentPosition = () => {
      if (saveTimer) return
      saveTimer = window.setTimeout(() => {
        saveTimer = 0
        if (currentLocation.current) savePosition(currentLocation.current)
      }, 100)
    }
    const saveImmediately = () => {
      if (currentLocation.current) savePosition(currentLocation.current)
    }
    window.addEventListener('scroll', saveCurrentPosition, { passive: true })
    window.addEventListener('pagehide', saveImmediately)
    return () => {
      window.removeEventListener('scroll', saveCurrentPosition)
      window.removeEventListener('pagehide', saveImmediately)
      window.clearTimeout(saveTimer)
    }
  }, [])

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previousRestoration
    }
  }, [])

  return null
}
