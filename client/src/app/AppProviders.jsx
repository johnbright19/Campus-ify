import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './ToastProvider'
import { AuthProvider } from './AuthProvider'
import { startWorkers, stopWorkers } from '../services/workers'

// ---------------------------------------------------------------------------
// React Query plays the role Architecture.md assigns it: "React Query for server
// data; Realtime events invalidate queries." Because our live queries fold the
// store version into their key, a realtime bump becomes a refetch for free.
// ---------------------------------------------------------------------------

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
    },
  },
})

export function AppProviders({ children }) {
  useEffect(() => {
    startWorkers()
    return () => stopWorkers()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
