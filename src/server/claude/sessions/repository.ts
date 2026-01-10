import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { parseJsonl } from '../../utils/jsonl.js'

/**
 * Session file system operations
 * Handles reading session files (not projects)
 */

export interface SessionFile {
  filename: string
  size: number
  path: string
}

/**
 * Read a session file and return parsed messages with metadata
 */
export async function readSessionFile(filePath: string): Promise<{
  messages: any[]
  timestamp: string
}> {
  const messages = await parseJsonl(filePath)
  const fileStat = await stat(filePath)
  return {
    messages,
    timestamp: fileStat.mtime.toISOString()
  }
}

/**
 * List all session files in a project directory
 */
export async function listSessionFiles(projectPath: string): Promise<SessionFile[]> {
  const files = await readdir(projectPath)
  const sessionFiles: SessionFile[] = []

  for (const file of files) {
    if (file.endsWith('.jsonl')) {
      const filePath = join(projectPath, file)
      const fileStat = await stat(filePath)
      sessionFiles.push({
        filename: file,
        size: fileStat.size,
        path: filePath
      })
    }
  }

  return sessionFiles
}
