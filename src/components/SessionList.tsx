import ProjectGroup from './ProjectGroup'

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

interface SessionListProps {
  projects: ProjectGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function SessionList({ projects, selectedId, onSelect }: SessionListProps) {
  return (
    <div>
      {projects.map((project) => (
        <ProjectGroup
          key={project.name}
          name={project.name}
          displayName={project.displayName}
          sessionCount={project.sessionCount}
          lastActivity={project.lastActivity}
          sessions={project.sessions}
          selectedId={selectedId}
          onSelectSession={onSelect}
        />
      ))}
    </div>
  )
}
