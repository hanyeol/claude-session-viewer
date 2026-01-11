import ProjectGroup from './ProjectGroup'

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

interface ProjectGroup {
  id: string
  name: string
  sessionCount: number
  lastActivity: string
  sessions: Session[]
}

interface SessionListProps {
  projects: ProjectGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNavigateToProject: (projectId: string) => void
}

export default function SessionList({ projects, selectedId, onSelect, onNavigateToProject }: SessionListProps) {
  // Determine which project should be initially expanded based on selected session
  const getInitialExpanded = (project: ProjectGroup) => {
    if (!selectedId) return false

    return project.sessions.some(
      (session) =>
        session.id === selectedId ||
        session.agentSessions?.some((agent) => agent.id === selectedId)
    )
  }

  return (
    <div>
      {projects.map((project) => (
        <ProjectGroup
          key={project.id}
          id={project.id}
          name={project.name}
          sessionCount={project.sessionCount}
          lastActivity={project.lastActivity}
          sessions={project.sessions}
          selectedId={selectedId}
          onSelectSession={onSelect}
          onNavigateToProject={onNavigateToProject}
          initialExpanded={getInitialExpanded(project)}
        />
      ))}
    </div>
  )
}
