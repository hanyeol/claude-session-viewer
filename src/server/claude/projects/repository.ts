import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

/**
 * Project file system operations
 * Handles reading project directories from ~/.claude/projects
 */

/**
 * List all project directories
 */
export async function listProjects(projectsDir: string): Promise<string[]> {
  const entries = await readdir(projectsDir)
  const projects: string[] = []

  for (const entry of entries) {
    const entryPath = join(projectsDir, entry)
    const entryStat = await stat(entryPath)
    if (entryStat.isDirectory()) {
      projects.push(entry)
    }
  }

  return projects
}

/**
 * Get project path from project name
 */
export function getProjectPath(projectsDir: string, projectName: string): string {
  return join(projectsDir, projectName)
}

/**
 * Remove user's home directory prefix from project directory name
 * e.g., "-Users-hanyeol-Projects-foo" → "Projects-foo"
 */
export function getProjectDisplayName(projectDirName: string): string {
  const userHomePath = homedir().split('/').filter(Boolean).join('-')
  const prefix = `-${userHomePath}-`

  if (projectDirName.startsWith(prefix)) {
    return projectDirName.slice(prefix.length)
  }

  return projectDirName
}
