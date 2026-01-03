import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import SessionList from './components/SessionList'
import SessionDetail from './components/SessionDetail'

const queryClient = new QueryClient()

interface Session {
  id: string
  project: string
  timestamp: string
  messages: any[]
  messageCount: number
  title?: string
  isAgent?: boolean
  agentSessions?: Session[]
}

interface ProjectGroup {
  name: string
  displayName: string
  sessionCount: number
  lastActivity: string
  sessions: Session[]
}

function AppContent() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await fetch('/api/sessions')
      if (!response.ok) throw new Error('Failed to fetch sessions')
      return response.json() as Promise<{ projects: ProjectGroup[] }>
    },
  })

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    let ws: WebSocket | null = null
    let closeAfterOpen = false
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let retryCount = 0
    let shouldReconnect = true

    const connect = () => {
      ws = new WebSocket(wsUrl)
      closeAfterOpen = false

      ws.onopen = () => {
        if (closeAfterOpen) {
          ws?.close()
          return
        }
        retryCount = 0
      }

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'file-added' || message.type === 'file-changed' || message.type === 'file-deleted') {
          // Refetch session list
          refetch()

          // If a session is selected, also refetch its details
          if (selectedSessionId) {
            queryClient.invalidateQueries({ queryKey: ['session', selectedSessionId] })
          }
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.onclose = () => {
        if (!shouldReconnect) return
        const delayMs = Math.min(1000 * 2 ** retryCount, 10000)
        retryCount += 1
        reconnectTimeout = setTimeout(connect, delayMs)
      }
    }

    connect()

    return () => {
      shouldReconnect = false
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        closeAfterOpen = true
      } else {
        ws?.close()
      }
    }
  }, [refetch, selectedSessionId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-xl">Loading sessions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-red-400 text-xl">Error: {error.message}</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-700 overflow-y-auto">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">Claude Sessions</h1>
          <p className="text-sm text-gray-400 mt-1">
            {data?.projects.length || 0} project{data?.projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <SessionList
          projects={data?.projects || []}
          selectedId={selectedSessionId}
          onSelect={setSelectedSessionId}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {selectedSessionId ? (
          <SessionDetail sessionId={selectedSessionId} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium">No session selected</h3>
              <p className="mt-1 text-sm text-gray-600">
                Select a session from the sidebar to view details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

export default App
