import { stat } from 'fs/promises'
import { join } from 'path'
import type { ProjectGroup } from '../../types.js'
import { listProjects, getProjectDisplayName } from './repository.js'
import { getProjectSessions, sortSessionsByTimestamp } from '../sessions/service.js'

/**
 * Project service
 * Orchestrates project and session loading
 */

/**
 * Sort project groups by last activity (most recent first)
 */
export function sortProjectsByActivity(projects: ProjectGroup[]): ProjectGroup[] {
  return projects.sort((a, b) =>
    new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  )
}

/**
 * Load all projects with their sessions
 */
export async function getAllProjectsWithSessions(projectsDir: string): Promise<ProjectGroup[]> {
  const projects = await listProjects(projectsDir)
  const projectGroups: ProjectGroup[] = []

  for (const project of projects) {
    const projectPath = join(projectsDir, project)
    const projectStat = await stat(projectPath)

    if (projectStat.isDirectory()) {
      const sessions = await getProjectSessions(projectPath)

      if (sessions.length > 0) {
        sortSessionsByTimestamp(sessions)
        const displayName = getProjectDisplayName(project)

        projectGroups.push({
          name: project,
          displayName,
          sessionCount: sessions.length,
          lastActivity: sessions[0].timestamp,
          sessions
        })
      }
    }
  }

  sortProjectsByActivity(projectGroups)

  return projectGroups
}
