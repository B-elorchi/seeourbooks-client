import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// Create a QueryClient with caching configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache data for 10 minutes even when component unmounts
      gcTime: 10 * 60 * 1000,
      // Refetch on window focus to get latest updates
      refetchOnWindowFocus: true,
      // Retry failed requests 3 times
      retry: 3,
      // Refetch every 3 seconds when data is stale (for polling)
      refetchInterval: 3000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
