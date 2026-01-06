import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
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

const SIDEBAR_WIDTH_STORAGE_KEY = 'claude-session-viewer-sidebar-width'
const DEFAULT_SIDEBAR_WIDTH = 320
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 600

function AppContent() {
  const navigate = useNavigate()
  const params = useParams()
  const selectedSessionId = params.sessionId || null

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    return stored ? parseInt(stored, 10) : DEFAULT_SIDEBAR_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [isScrollingUp, setIsScrollingUp] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastScrollY = useRef(0)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await fetch('/api/sessions')
      if (!response.ok) throw new Error('Failed to fetch sessions')
      return response.json() as Promise<{ projects: ProjectGroup[] }>
    },
  })

  const handleSelectSession = (id: string) => {
    navigate(`/sessions/${id}`)
  }

  // Handle scroll for header shrinking with direction detection
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop
      const scrollingUp = currentScrollY < lastScrollY.current

      setScrollY(currentScrollY)
      setIsScrollingUp(scrollingUp)
      lastScrollY.current = currentScrollY
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [])

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(newWidth)
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, newWidth.toString())
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (isResizing) {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

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

  // Calculate header size based on scroll
  // When scrolling up, show full header; when scrolling down, use scroll position
  const effectiveScroll = isScrollingUp ? 0 : scrollY
  const headerScale = Math.max(0, 1 - effectiveScroll / 80)
  const headerPadding = 12 + headerScale * 12 // 12px to 24px
  const titleSize = 1.125 + headerScale * 0.375 // 1.125rem (18px) to 1.5rem (24px)
  const subtitleOpacity = headerScale

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div
        className="relative flex flex-col"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div
          ref={sidebarRef}
          className="border-r border-gray-700 h-full flex flex-col"
        >
          {/* Fixed Header */}
          <div
            className="border-b border-gray-700 flex-shrink-0 transition-all duration-200"
            style={{
              padding: `${headerPadding}px`,
            }}
          >
            <h1
              className="font-bold transition-all duration-200"
              style={{
                fontSize: `${titleSize}rem`,
              }}
            >
              Claude Sessions
            </h1>
            <p
              className="text-sm text-gray-400 mt-1 transition-opacity duration-200"
              style={{
                opacity: subtitleOpacity,
                height: subtitleOpacity > 0 ? 'auto' : 0,
                overflow: 'hidden',
              }}
            >
              {isLoading ? 'Loading...' : `${data?.projects.length || 0} project${data?.projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Scrollable Content */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
            {error ? (
              <div className="p-4 text-red-400 text-sm">
                Error loading sessions: {error.message}
              </div>
            ) : (
              <SessionList
                projects={data?.projects || []}
                selectedId={selectedSessionId}
                onSelect={handleSelectSession}
              />
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="absolute top-0 right-0 w-4 h-full cursor-col-resize group z-10"
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizing(true)
          }}
          style={{
            touchAction: 'none',
          }}
        >
          <div className={`w-1 h-full ml-auto transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent group-hover:bg-blue-500'}`} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppContent />} />
          <Route path="/sessions/:sessionId" element={<AppContent />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
