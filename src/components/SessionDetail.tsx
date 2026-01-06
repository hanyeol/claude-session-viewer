import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SessionToc from './SessionToc'

interface SessionDetailProps {
  sessionId: string
}

const TOC_WIDTH = 256 // 16rem / 64 * 4
const MIN_CONTENT_WIDTH = 640 // Minimum width for readable content
const CONTENT_MAX_WIDTH = 896 // Tailwind max-w-4xl
const TOC_MIN_AVAILABLE_WIDTH = CONTENT_MAX_WIDTH + TOC_WIDTH

export default function SessionDetail({ sessionId }: SessionDetailProps) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [showToc, setShowToc] = useState(true)
  const [scrollY, setScrollY] = useState(0)
  const [isScrollingUp, setIsScrollingUp] = useState(false)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const isManualNavigatingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastScrollY = useRef(0)
  const { data, isLoading, error } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}`)
      if (!response.ok) throw new Error('Failed to fetch session')
      return response.json()
    },
  })

  // Reset scroll position when session changes
  useEffect(() => {
    setScrollY(0)
    lastScrollY.current = 0
    setIsScrollingUp(false)
    const messagesContainer = messagesContainerRef.current
    if (messagesContainer) {
      messagesContainer.scrollTop = 0
    }
  }, [sessionId])

  // Handle scroll for header shrinking with direction detection
  useEffect(() => {
    const messagesContainer = messagesContainerRef.current
    if (!messagesContainer) return

    const handleScroll = () => {
      const currentScrollY = messagesContainer.scrollTop
      const scrollingUp = currentScrollY < lastScrollY.current

      setScrollY(currentScrollY)
      setIsScrollingUp(scrollingUp)
      lastScrollY.current = currentScrollY
    }

    messagesContainer.addEventListener('scroll', handleScroll)
    return () => messagesContainer.removeEventListener('scroll', handleScroll)
  }, [sessionId, data])

  // ResizeObserver to toggle TOC visibility based on available width
  useEffect(() => {
    if (!containerRef.current) return

    const target = containerRef.current.parentElement ?? containerRef.current
    const updateTocVisibility = (width: number) => {
      setShowToc(width >= TOC_MIN_AVAILABLE_WIDTH)
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateTocVisibility(entry.contentRect.width)
      }
    })

    const initialWidth = target.getBoundingClientRect().width
    updateTocVisibility(initialWidth)
    resizeObserver.observe(target)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Intersection Observer to track active message
  useEffect(() => {
    if (!data?.session?.messages) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Don't update active message if user is manually navigating
        if (isManualNavigatingRef.current) return

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-message-id')
            if (id) {
              setActiveMessageId(id)
            }
          }
        })
      },
      {
        rootMargin: '-50% 0px -50% 0px',
        threshold: 0
      }
    )

    messageRefs.current.forEach((element) => {
      observer.observe(element)
    })

    return () => {
      observer.disconnect()
    }
  }, [data?.session?.messages])

  // Handle navigation from TOC
  const handleNavigate = (id: string) => {
    // Immediately update active message
    setActiveMessageId(id)

    // Set manual navigation flag
    isManualNavigatingRef.current = true

    const element = messageRefs.current.get(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    // Reset flag after scrolling completes
    setTimeout(() => {
      isManualNavigatingRef.current = false
    }, 1500)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading session...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">Error: {error.message}</div>
      </div>
    )
  }

  const session = data?.session

  // Calculate header size and visibility based on scroll
  // When scrolling up, show full header; when scrolling down, use scroll position
  const effectiveScroll = isScrollingUp ? 0 : scrollY

  // Single stage (0-80px): Everything shrinks together
  const shrinkScale = Math.max(0, 1 - effectiveScroll / 80)

  const metadataOpacity = shrinkScale
  const projectOpacity = shrinkScale
  const headerPaddingVertical = 14 + shrinkScale * 8 // 14px to 22px
  const titleSize = 1.25 + shrinkScale * 0.25 // 1.25rem to 1.5rem (20px to 24px)

  // Calculate metadata height for smooth collapse
  const metadataHeight = metadataOpacity > 0 ? 'auto' : 0
  // Show project badge when project name is hidden
  const projectBadgeOpacity = Math.max(0, 1 - projectOpacity)

  return (
    <div ref={containerRef} className="h-full flex min-w-0">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ minWidth: `${MIN_CONTENT_WIDTH}px` }}>
      {/* Header */}
      <div
        className="border-b border-gray-700 bg-gray-800 flex-shrink-0 transition-all duration-200"
        style={{
          padding: `${headerPaddingVertical}px 24px`,
        }}
      >
        <div className="flex items-center gap-2">
          {session?.isAgent && (
            <span className="px-2 py-1 text-xs bg-purple-900/50 text-purple-300 rounded font-semibold">
              TASK
            </span>
          )}
          <h2
            className="font-bold truncate flex-1 transition-all duration-200"
            style={{
              fontSize: `${titleSize}rem`,
            }}
          >
            {session?.title || 'Untitled Session'}
          </h2>
          {/* Project badge - shown when scrolled */}
          {projectBadgeOpacity > 0 && (
            <span
              className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded transition-opacity duration-200"
              style={{
                opacity: projectBadgeOpacity,
              }}
            >
              {session?.project}
            </span>
          )}
        </div>
        <div
          className="text-xl text-gray-300 transition-all duration-200"
          style={{
            opacity: projectOpacity,
            height: projectOpacity > 0 ? 'auto' : 0,
            overflow: 'hidden',
            marginTop: '-2px',
          }}
        >
          {session?.project}
        </div>
        <div
          className="flex items-center gap-3 text-sm text-gray-400 transition-all duration-200"
          style={{
            opacity: metadataOpacity,
            height: metadataHeight,
            overflow: 'hidden',
            marginTop: metadataOpacity > 0 ? '1rem' : 0,
          }}
        >
          <span>
            {session?.timestamp && format(new Date(session.timestamp), 'PPpp')}
          </span>
          <span>•</span>
          <span>
            {session?.messageCount || 0} message{session?.messageCount !== 1 ? 's' : ''}
          </span>
          {session?.agentSessions && session.agentSessions.length > 0 && (
            <>
              <span>•</span>
              <span>
                {session.agentSessions.length} task{session.agentSessions.length !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Messages Timeline */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {session?.messages.map((message: any, index: number) => {
            const messageId = `message-${index}`
            return (
            <div
              key={index}
              ref={(el) => {
                if (el) {
                  messageRefs.current.set(messageId, el)
                } else {
                  messageRefs.current.delete(messageId)
                }
              }}
              data-message-id={messageId}
              className="border-l-2 border-gray-700 pl-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      message.type === 'user'
                        ? 'bg-blue-900 text-blue-200'
                        : message.type === 'assistant'
                        ? 'bg-green-900 text-green-200'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {message.type || 'system'}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">
                    #{index + 1}
                  </span>
                  {message.timestamp && (
                    <span className="text-xs text-gray-500">
                      {format(new Date(message.timestamp), 'HH:mm:ss')}
                    </span>
                  )}
                </div>
              </div>

              {/* Message Content */}
              <div className="bg-gray-800 rounded-lg p-4 text-sm">
                {message.message?.content && Array.isArray(message.message.content) ? (
                  <div className="space-y-2">
                    {message.message.content.map((content: any, idx: number) => (
                      <div key={idx}>
                        {content.type === 'text' && (
                          <p className="whitespace-pre-wrap">{content.text}</p>
                        )}
                        {content.type === 'tool_use' && (
                          <div className="bg-gray-900 p-3 rounded border border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-yellow-400 font-mono text-xs">
                                🔧 {content.name}
                              </div>
                              {content.name === 'Task' && content.agentId && (
                                <Link
                                  to={`/sessions/agent-${content.agentId}`}
                                  className="px-2 py-1 text-xs bg-purple-700 hover:bg-purple-600 text-purple-100 rounded transition-colors"
                                >
                                  View Task →
                                </Link>
                              )}
                            </div>
                            <pre className="text-xs overflow-x-auto text-gray-400">
                              {JSON.stringify(content.input, null, 2)}
                            </pre>
                          </div>
                        )}
                        {content.type === 'tool_result' && (
                          <div className="bg-gray-900 p-3 rounded border border-gray-700">
                            <div className="text-green-400 font-mono text-xs mb-2">
                              ✓ Tool Result
                            </div>
                            <pre className="text-xs overflow-x-auto text-gray-400">
                              {typeof content.content === 'string'
                                ? content.content
                                : JSON.stringify(content.content, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="text-xs overflow-x-auto text-gray-400">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )})}
        </div>
      </div>
      </div>

      {/* Table of Contents */}
      {showToc && session?.messages && session.messages.length > 0 && (
        <div style={{ width: `${TOC_WIDTH}px`, flexShrink: 0 }}>
          <SessionToc
            messages={session.messages}
            activeId={activeMessageId}
            onNavigate={handleNavigate}
          />
        </div>
      )}
    </div>
  )
}
