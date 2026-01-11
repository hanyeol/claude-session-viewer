import { readdir, stat } from 'fs/promises'
import { readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/**
 * Project file system operations
 * Handles reading project directories from ~/.claude/projects
 */

/**
 * Encode path segment for Claude project naming
 * Replaces special characters (space, dot, slash, etc.) with dashes
 * e.g., "/Users/hanyeol/Projects" → "-Users-hanyeol-Projects"
 */
function encodeProjectPath(path: string): string {
  return path.replace(/[ .@#$%^&*()+=\[\]{}|\\:;"'<>?,\/]/g, '-')
}

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
 * Remove user's home directory prefix from project id
 * e.g., "-Users-hanyeol-Projects-foo" → "Projects-foo"
 */
export function getProjectName(projectId: string): string {
  const encodedHome = encodeProjectPath(homedir())
  const prefix = `${encodedHome}-`

  if (projectId.startsWith(prefix)) {
    return projectId.slice(prefix.length)
  }

  return projectId
}

/**
 * Convert project directory name to absolute file system path
 * e.g., "-Users-hanyeol-Projects-foo" → "/Users/hanyeol/Projects/foo"
 *
 * Algorithm:
 * 1. Start with root directory (/)
 * 2. Iteratively traverse directories, matching encoded names with remaining text
 * 3. Backtrack if no match found at current level
 */
export function getProjectPath(projectId: string): string {
  // Remove leading dash if present
  let remaining = projectId
  if (remaining.startsWith('-')) {
    remaining = remaining.slice(1)
  }

  // If nothing remains, return root
  if (!remaining) {
    return '/'
  }

  // Iteratively find the path using a stack-based approach
  const stack: Array<{ path: string; remaining: string; dirIndex: number }> = [
    { path: '/', remaining, dirIndex: 0 }
  ]

  while (stack.length > 0) {
    const current = stack[stack.length - 1]

    if (!current.remaining) {
      // Found complete match
      return current.path
    }

    try {
      const entries = readdirSync(current.path, { withFileTypes: true })
      const directories = entries.filter((e) => e.isDirectory())

      // Try to find a matching directory starting from dirIndex
      let found = false
      for (let i = current.dirIndex; i < directories.length; i++) {
        const dirName = directories[i].name
        const encoded = encodeProjectPath(dirName)

        if (current.remaining.startsWith(encoded)) {
          // Match found, update current state and push new state
          current.dirIndex = i + 1 // For backtracking

          const nextPath = join(current.path, dirName)
          let nextRemaining = current.remaining.slice(encoded.length)

          // Remove dash separator if present
          if (nextRemaining.startsWith('-')) {
            nextRemaining = nextRemaining.slice(1)
          }

          stack.push({ path: nextPath, remaining: nextRemaining, dirIndex: 0 })
          found = true
          break
        }
      }

      if (!found) {
        // No match found at this level, backtrack
        stack.pop()
      }
    } catch (err) {
      console.log(err)
      // Directory not readable or doesn't exist, backtrack
      stack.pop()
    }
  }

  // No match found, return root as fallback
  return '/'
}
