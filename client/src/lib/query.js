import { useEffect, useMemo, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getState, getVersion, now, subscribe } from './store'

// ---------------------------------------------------------------------------
// Bridging the store into React.
//
// `useDb()` gives components a live snapshot: whenever a service writes, the
// store version bumps, subscribers re-render, and a new snapshot object arrives.
// `useLiveQuery` additionally folds the version into the React Query cache key,
// which is the stand-in for "Realtime events invalidate queries" in
// Architecture.md §9.
// ---------------------------------------------------------------------------

export function useStoreVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

export function useDb() {
  const version = useStoreVersion()
  return useMemo(() => getState(), [version])
}

export function useLiveQuery(key, queryFn, options = {}) {
  const version = useStoreVersion()
  const queryKey = Array.isArray(key) ? [...key, version] : [key, version]
  return useQuery({ queryKey, queryFn, staleTime: 30_000, ...options })
}

/** Re-renders on an interval — the heartbeat behind countdowns and clocks. */
export function useTick(intervalMs = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!intervalMs) return undefined
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
}

/** The simulated campus clock (honours the demo time-warp offset). */
export function useNow(intervalMs = 1000) {
  const version = useStoreVersion()
  useTick(intervalMs)
  return useMemo(() => now(), [version, Math.floor(Date.now() / intervalMs)])
}

export function useClockOffset() {
  const db = useDb()
  return db.clockOffsetMs || 0
}
