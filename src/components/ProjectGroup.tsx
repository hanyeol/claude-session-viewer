import { useState, useEffect } from 'react'
import { format } from 'date-fns'

interface Session {
  id: string
  projectId: string
  projectName?: string
  timestamp: string
  messages: any[]
  messageCount: number
  title?: string
  isAgent?: boolean
  agentSessions?: Session[]
}

interface ProjectGroupProps {
  id: string
  name: string
  path: string
  sessionCount: number
  lastActivity: string
  sessions: Session[]
  selectedId: string | null
  onSelectSession: (id: string) => void
  onNavigateToProject: (projectId: string) => void
  initialExpanded?: boolean
}

export default function ProjectGroup({
  id,
  name,
  path,
  sessionCount,
  lastActivity,
  sessions,
  selectedId,
  onSelectSession,
  onNavigateToProject,
  initialExpanded = false,
}: ProjectGroupProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [isContentVisible, setIsContentVisible] = useState(initialExpanded)

  // Auto-expand when a session in this project is selected
  useEffect(() => {
    if (selectedId) {
      const hasSelectedSession = sessions.some(
        (session) =>
          session.id === selectedId ||
          session.agentSessions?.some((agent) => agent.id === selectedId)
      )
      if (hasSelectedSession) {
        setIsExpanded(true)
      }
    }
  }, [selectedId, sessions])

  const animationDuration = 200

  useEffect(() => {
    let timeoutId: number | undefined

    if (isExpanded) {
      setIsContentVisible(true)
    } else {
      timeoutId = window.setTimeout(() => {
        setIsContentVisible(false)
      }, animationDuration)
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [isExpanded])

  return (
    <div className="border-b border-gray-700">
      {/* Project Header */}
      <div className="sticky top-0 z-10 bg-gray-900 relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left p-4 hover:bg-gray-800 transition-all duration-200"
        >
          <div
            className="flex items-start gap-2 transition-all duration-200"
            style={{
              paddingRight: isExpanded ? '36px' : '0',
              transition: 'padding-right 200ms'
            }}
          >
            <svg
              className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-semibold text-sm break-words">{name}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 ml-6 break-words">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''}
          </div>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigateToProject(id)
          }}
          className={`absolute top-4 right-2 p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-all duration-200 z-10 ${
            isExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
          }`}
          title="Project Dashboard"
          tabIndex={isExpanded ? 0 : -1}
        >
          <svg
            className="w-4 h-4"
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

      {/* Sessions List */}
      <div
        className="transition-all overflow-hidden"
        style={{
          maxHeight: isExpanded ? `${sessions.length * 150}px` : '0',
          transitionDuration: `${animationDuration}ms`
        }}
      >
        <div
          className="bg-gray-900/50 transition-opacity"
          style={{
            opacity: isContentVisible ? 1 : 0,
            transitionDuration: `${animationDuration}ms`
          }}
        >
          {sessions.map((session) => (
            <div key={session.id}>
              {/* Main Session */}
              <button
                onClick={() => onSelectSession(session.id)}
                className={`w-full text-left px-4 py-3 pl-8 hover:bg-gray-700/50 transition-colors border-l-2 ${
                  selectedId === session.id
                    ? 'bg-gray-700 border-blue-500'
                    : 'border-transparent'
                }`}
              >
                {session.title && (
                  <div className="text-sm font-medium text-gray-200 mb-1 truncate">
                    {session.title}
                  </div>
                )}
                <div className="text-xs text-gray-400">
                  {format(new Date(session.timestamp), 'PPpp')}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {session.messageCount} message{session.messageCount !== 1 ? 's' : ''}
                  {session.agentSessions && session.agentSessions.length > 0 && (
                    <span className="ml-2">
                      · {session.agentSessions.length} task{session.agentSessions.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>

              {/* Agent Sessions */}
              {session.agentSessions && session.agentSessions.length > 0 && (
                <div className="bg-gray-900/70">
                  {session.agentSessions.map((agentSession) => (
                    <button
                      key={agentSession.id}
                      onClick={() => onSelectSession(agentSession.id)}
                      className={`w-full text-left px-4 py-2 pl-14 hover:bg-gray-700/50 transition-colors border-l-2 ${
                        selectedId === agentSession.id
                          ? 'bg-gray-700 border-blue-500'
                          : 'border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 text-xs bg-purple-900/50 text-purple-300 rounded">
                          TASK
                        </span>
                        {agentSession.title && (
                          <span className="text-sm font-medium text-gray-300 truncate">
                            {agentSession.title}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {format(new Date(agentSession.timestamp), 'PPpp')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {agentSession.messageCount} message{agentSession.messageCount !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
    </div>
  )
}
