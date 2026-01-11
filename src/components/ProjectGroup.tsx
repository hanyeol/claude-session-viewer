import { useState, useEffect } from 'react'
import { format } from 'date-fns'

interface Session {
  id: string
  projectId: string
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
  sessionCount: number
  lastActivity: string
  sessions: Session[]
  selectedId: string | null
  onSelectSession: (id: string) => void
  initialExpanded?: boolean
}

export default function ProjectGroup({
  name,
  sessionCount,
  lastActivity,
  sessions,
  selectedId,
  onSelectSession,
  initialExpanded = false,
}: ProjectGroupProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

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

  return (
    <div className="border-b border-gray-700">
      {/* Project Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="sticky top-0 z-10 w-full text-left p-4 bg-gray-900 hover:bg-gray-800 transition-colors flex items-center justify-between"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-semibold text-sm truncate">{name}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 ml-6">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''} · Last activity{' '}
            {format(new Date(lastActivity), 'PPp')}
          </div>
        </div>
      </button>

      {/* Sessions List */}
      {isExpanded && (
        <div className="bg-gray-900/50">
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
      )}
    </div>
  )
}
