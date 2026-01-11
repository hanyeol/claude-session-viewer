import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SessionToc from './SessionToc'

interface Session {
  id: string
  projectId: string
  projectName?: string
  timestamp: string
  messages?: any[]
  messageCount: number
  title?: string
  isAgent?: boolean
  agentSessions?: Session[]
}

interface SessionDetailProps {
  sessionId: string
  sessionInfo?: Session | null
}

const TOC_WIDTH = 256 // 16rem / 64 * 4
const MIN_CONTENT_WIDTH = 640 // Minimum width for readable content
const CONTENT_MAX_WIDTH = 896 // Tailwind max-w-4xl
const TOC_MIN_AVAILABLE_WIDTH = CONTENT_MAX_WIDTH + TOC_WIDTH

export default function SessionDetail({ sessionId, sessionInfo }: SessionDetailProps) {
  const navigate = useNavigate()
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [showToc, setShowToc] = useState(true)
  const [messagesContainerEl, setMessagesContainerEl] = useState<HTMLDivElement | null>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const isManualNavigatingRef = useRef(false)
  const activeMessageIdRef = useRef<string | null>(null)
  const manualNavTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateActiveMessageRef = useRef<(() => void) | null>(null)
  const manualTargetIdRef = useRef<string | null>(null)
  const bottomLockRef = useRef(false)
  const pendingScrollYRef = useRef(0)
  const animatedScrollYRef = useRef(0)
  const scrollRafRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const projectRef = useRef<HTMLDivElement>(null)
  const metadataRef = useRef<HTMLDivElement>(null)
  const projectBadgeRef = useRef<HTMLButtonElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
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
    pendingScrollYRef.current = 0
    animatedScrollYRef.current = 0
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    lastScrollY.current = 0
    setActiveMessageId(null)
    activeMessageIdRef.current = null
    bottomLockRef.current = false
    const messagesContainer = messagesContainerRef.current
    if (messagesContainer) {
      messagesContainer.scrollTop = 0
    }
  }, [sessionId])

  const updateHeaderStyles = (scale: number) => {
    const header = headerRef.current
    if (!header) return

    const headerPaddingVertical = 14 + scale * 8
    const titleSize = 1.25 + scale * 0.25
    const projectOpacity = scale
    const metadataOpacity = scale
    const projectBadgeOpacity = Math.max(0, 1 - projectOpacity)

    header.style.padding = `${headerPaddingVertical}px 24px`
    if (titleRef.current) {
      titleRef.current.style.fontSize = `${titleSize}rem`
    }
    if (projectRef.current) {
      projectRef.current.style.opacity = `${projectOpacity}`
      projectRef.current.style.height = projectOpacity > 0 ? 'auto' : '0'
    }
    if (metadataRef.current) {
      metadataRef.current.style.opacity = `${metadataOpacity}`
      metadataRef.current.style.height = metadataOpacity > 0 ? 'auto' : '0'
      metadataRef.current.style.marginTop = metadataOpacity > 0 ? '1rem' : '0'
    }
    if (projectBadgeRef.current) {
      projectBadgeRef.current.style.opacity = `${projectBadgeOpacity}`
      projectBadgeRef.current.style.pointerEvents = projectBadgeOpacity > 0 ? 'auto' : 'none'
      projectBadgeRef.current.style.position = projectBadgeOpacity > 0 ? 'static' : 'absolute'
    }
  }

  // Handle scroll for header shrinking with direction detection
  useEffect(() => {
    const messagesContainer = messagesContainerEl
    if (!messagesContainer) return

    const tick = () => {
      const targetScrollY = pendingScrollYRef.current
      const currentScrollY = animatedScrollYRef.current
      const easedScrollY = currentScrollY + (targetScrollY - currentScrollY) * 0.2
      const distanceFromBottom =
        messagesContainer.scrollHeight - (easedScrollY + messagesContainer.clientHeight)
      const shouldLock = distanceFromBottom <= 5
      const scrollingUp = easedScrollY < lastScrollY.current

      let nextBottomLocked = bottomLockRef.current
      if (nextBottomLocked) {
        if (distanceFromBottom > 40) {
          nextBottomLocked = false
        }
      } else if (shouldLock) {
        nextBottomLocked = true
      }
      bottomLockRef.current = nextBottomLocked

      const effectiveScroll = scrollingUp ? 0 : nextBottomLocked ? 80 : easedScrollY
      const shrinkScale = Math.max(0, 1 - effectiveScroll / 80)
      updateHeaderStyles(shrinkScale)

      animatedScrollYRef.current = easedScrollY
      lastScrollY.current = easedScrollY

      if (Math.abs(targetScrollY - easedScrollY) > 0.5) {
        scrollRafRef.current = requestAnimationFrame(tick)
      } else {
        animatedScrollYRef.current = targetScrollY
        lastScrollY.current = targetScrollY
        scrollRafRef.current = null
        if (nextBottomLocked) {
          updateActiveMessageRef.current?.()
        }
      }
    }

    const handleScroll = () => {
      pendingScrollYRef.current = messagesContainer.scrollTop
      if (scrollRafRef.current !== null) return
      scrollRafRef.current = requestAnimationFrame(tick)
    }

    messagesContainer.addEventListener('scroll', handleScroll)
    return () => {
      messagesContainer.removeEventListener('scroll', handleScroll)
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [sessionId, messagesContainerEl])

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

  // Track active message based on visibility
  useEffect(() => {
    if (!data?.session?.messages) return

    const messagesContainer = messagesContainerRef.current
    if (!messagesContainer) return

    const visibleIds = new Set<string>()
    let rafId: number | null = null

    const updateActiveFromAll = () => {
      // Don't update active message if user is manually navigating
      if (isManualNavigatingRef.current) return

      // Create array of all messages with their positions
      const messagesArray: Array<{ id: string; element: HTMLDivElement; rect: DOMRect }> = []
      messageRefs.current.forEach((element, id) => {
        const rect = element.getBoundingClientRect()
        messagesArray.push({ id, element, rect })
      })

      // Sort by position
      messagesArray.sort((a, b) => a.rect.top - b.rect.top)

      const containerRect = messagesContainer.getBoundingClientRect()
      const containerTop = containerRect.top
      const containerBottom = containerRect.bottom

      let targetId: string | null = null

      // Pick the first fully visible message, otherwise the first partially visible
      for (const msg of messagesArray) {
        const isFullyVisible = msg.rect.top >= containerTop && msg.rect.bottom <= containerBottom
        const isPartiallyVisible = msg.rect.bottom > containerTop && msg.rect.top < containerBottom

        if (isFullyVisible) {
          targetId = msg.id
          break
        } else if (isPartiallyVisible && !targetId) {
          targetId = msg.id
        }
      }

      if (targetId && targetId !== activeMessageIdRef.current) {
        setActiveMessageId(targetId)
      }
    }

    const updateActiveFromVisible = () => {
      const manualTargetId = manualTargetIdRef.current
      if (isManualNavigatingRef.current && manualTargetId) {
        const targetElement = messageRefs.current.get(manualTargetId)
        if (targetElement) {
          const containerRect = messagesContainer.getBoundingClientRect()
          const targetRect = targetElement.getBoundingClientRect()
          const nearTop = targetRect.top >= containerRect.top && targetRect.top <= containerRect.top + 5

          if (!nearTop) {
            return
          }
        }
        isManualNavigatingRef.current = false
        manualTargetIdRef.current = null
      }

      if (bottomLockRef.current) {
        const lastIndex = data.session.messages.length - 1
        const lastId = lastIndex >= 0 ? `message-${lastIndex}` : null
        if (lastId && lastId !== activeMessageIdRef.current) {
          setActiveMessageId(lastId)
        }
        return
      }

      if (visibleIds.size === 0) {
        updateActiveFromAll()
        return
      }

      const containerRect = messagesContainer.getBoundingClientRect()
      const containerTop = containerRect.top
      const containerBottom = containerRect.bottom
      let targetId: string | null = null

      const visibleElements = Array.from(visibleIds)
        .map((id) => {
          const element = messageRefs.current.get(id)
          if (!element) return null
          return { id, rect: element.getBoundingClientRect() }
        })
        .filter((item): item is { id: string; rect: DOMRect } => Boolean(item))

      if (visibleElements.length === 0) {
        updateActiveFromAll()
        return
      }

      visibleElements.sort((a, b) => a.rect.top - b.rect.top)
      for (const msg of visibleElements) {
        const isFullyVisible = msg.rect.top >= containerTop && msg.rect.bottom <= containerBottom
        const isPartiallyVisible = msg.rect.bottom > containerTop && msg.rect.top < containerBottom

        if (isFullyVisible) {
          targetId = msg.id
          break
        } else if (isPartiallyVisible && !targetId) {
          targetId = msg.id
        }
      }

      if (targetId && targetId !== activeMessageIdRef.current) {
        setActiveMessageId(targetId)
      }
    }

    const scheduleUpdate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateActiveFromVisible()
      })
    }

    updateActiveMessageRef.current = updateActiveFromVisible

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId
          if (!id) continue
          if (entry.isIntersecting) {
            visibleIds.add(id)
          } else {
            visibleIds.delete(id)
          }
        }
        scheduleUpdate()
      },
      { root: messagesContainer, threshold: [0, 0.1, 0.5, 1] }
    )

    messageRefs.current.forEach((element) => observer.observe(element))
    scheduleUpdate()

    return () => {
      observer.disconnect()
      updateActiveMessageRef.current = null
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [data?.session?.messages, messagesContainerEl])

  useEffect(() => {
    activeMessageIdRef.current = activeMessageId
  }, [activeMessageId])

  useEffect(() => {
    updateHeaderStyles(1)
  }, [data?.session?.id])

  const handleMessagesContainerRef = useCallback((el: HTMLDivElement | null) => {
    messagesContainerRef.current = el
    setMessagesContainerEl((prev) => (prev === el ? prev : el))
  }, [])

  // Handle navigation from TOC
  const handleNavigate = (id: string, isUserClick: boolean = false) => {
    // Immediately update active message
    setActiveMessageId(id)

    // Only scroll content if this was a manual click
    if (isUserClick) {
      // Set manual navigation flag
      isManualNavigatingRef.current = true
      manualTargetIdRef.current = id
      if (manualNavTimeoutRef.current) {
        clearTimeout(manualNavTimeoutRef.current)
        manualNavTimeoutRef.current = null
      }

      const element = messageRefs.current.get(id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      // Reset flag after scrolling completes
      manualNavTimeoutRef.current = setTimeout(() => {
        isManualNavigatingRef.current = false
        manualTargetIdRef.current = null
        manualNavTimeoutRef.current = null
        updateActiveMessageRef.current?.()
      }, 1500)
    }
  }

  useEffect(() => {
    return () => {
      if (manualNavTimeoutRef.current) {
        clearTimeout(manualNavTimeoutRef.current)
      }
    }
  }, [])

  // Show loading state only if we don't have any data yet (neither from API nor from session list)
  if (isLoading && !data && !sessionInfo) {
    return (
      <div className="h-full flex min-w-0">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0" style={{ minWidth: `${MIN_CONTENT_WIDTH}px` }}>
          {/* Header Skeleton */}
          <div className="border-b border-gray-700 bg-gray-800 flex-shrink-0 p-6">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-700 rounded w-3/4 mb-3"></div>
              <div className="h-5 bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="flex items-center gap-3">
                <div className="h-4 bg-gray-700 rounded w-32"></div>
                <div className="h-4 bg-gray-700 rounded w-4"></div>
                <div className="h-4 bg-gray-700 rounded w-24"></div>
              </div>
            </div>
          </div>

          {/* Messages Skeleton */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-5 bg-gray-700 rounded w-16"></div>
                    <div className="h-4 bg-gray-700 rounded w-8"></div>
                    <div className="h-4 bg-gray-700 rounded w-16"></div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-700 rounded w-full"></div>
                      <div className="h-4 bg-gray-700 rounded w-5/6"></div>
                      <div className="h-4 bg-gray-700 rounded w-4/5"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TOC Skeleton */}
        {showToc && (
          <div style={{ width: `${TOC_WIDTH}px`, flexShrink: 0 }} className="border-l border-gray-700 bg-gray-800/30 p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-5 bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-700 rounded w-5/6"></div>
              <div className="h-4 bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-700 rounded w-4/5"></div>
              <div className="h-4 bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-700 rounded w-3/4"></div>
            </div>
          </div>
        )}
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

  // Use session data from API or fall back to basic session info from list
  const session = data?.session || sessionInfo

  // Calculate header size and visibility based on scroll
  // When scrolling up, show full header; when scrolling down, use scroll position
  return (
    <div ref={containerRef} className="h-full flex min-w-0">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ minWidth: `${MIN_CONTENT_WIDTH}px` }}>
      {/* Header */}
      <div
        ref={headerRef}
        className="border-b border-gray-700 bg-gray-800 flex-shrink-0 transition-all duration-200"
        style={{
          padding: '22px 24px',
        }}
      >
        <div className="flex items-center gap-2">
          {session?.isAgent && (
            <span className="px-2 py-1 text-xs bg-purple-900/50 text-purple-300 rounded font-semibold">
              TASK
            </span>
          )}
          <h2
            ref={titleRef}
            className="font-bold truncate flex-1 transition-all duration-200"
            style={{
              fontSize: '1.5rem',
            }}
          >
            {session?.title || 'Untitled Session'}
          </h2>
          {/* Project badge - shown when scrolled */}
          <button
            ref={projectBadgeRef}
            onClick={() => session?.projectId && navigate(`/projects/${session.projectId}`)}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded transition-all duration-200 hover:bg-gray-600 hover:text-white"
            style={{ opacity: 0 }}
          >
            {session?.projectName || session?.projectId}
          </button>
          {/* Project Dashboard button */}
          <button
            onClick={() => session?.projectId && navigate(`/projects/${session.projectId}`)}
            className="flex items-center justify-center p-2 rounded-lg transition-colors flex-shrink-0 bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
            title="Project Dashboard"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </button>
        </div>
        <div
          ref={projectRef}
          onClick={() => session?.projectId && navigate(`/projects/${session.projectId}`)}
          className="text-xl text-gray-300 transition-all duration-200 hover:text-white hover:underline cursor-pointer"
          style={{
            opacity: 1,
            height: 'auto',
            overflow: 'hidden',
            marginTop: '-2px',
          }}
        >
          {session?.projectName || session?.projectId}
        </div>
        <div
          ref={metadataRef}
          className="flex items-center gap-3 text-sm text-gray-400 transition-all duration-200"
          style={{
            opacity: 1,
            height: 'auto',
            overflow: 'hidden',
            marginTop: '1rem',
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
      <div
        ref={handleMessagesContainerRef}
        className="flex-1 overflow-y-auto p-6"
      >
        {isLoading && !session?.messages ? (
          // Show skeleton only when messages are not available
          <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border-l-2 border-gray-700 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 bg-gray-700 rounded w-16"></div>
                  <div className="h-4 bg-gray-700 rounded w-8"></div>
                  <div className="h-4 bg-gray-700 rounded w-16"></div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-full"></div>
                    <div className="h-4 bg-gray-700 rounded w-5/6"></div>
                    <div className="h-4 bg-gray-700 rounded w-4/5"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="max-w-4xl mx-auto space-y-6">
          {session?.messages?.map((message: any, index: number) => {
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
              className="border-l-2 border-gray-700 pl-4"
              style={{ scrollMarginTop: '24px' }}>
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
        )}
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
