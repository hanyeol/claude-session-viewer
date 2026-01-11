import { join } from 'path'
import type { Session } from '../../types.js'
import { listSessionFiles, readSessionFile } from './repository.js'
import { shouldSkipSession, isAgentSession, isEmptyFile } from './filters.js'
import { extractSessionTitle } from './title.js'
import { collectAgentDescriptions, attachAgentSessionsToParent } from './agents.js'
import { getProjectName } from '../projects/repository.js'

/**
 * Session service
 * Orchestrates session loading, filtering, and organization
 */

/**
 * Sort sessions by timestamp (most recent first)
 */
export function sortSessionsByTimestamp(sessions: Session[]): Session[] {
  return sessions.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

/**
 * Load all sessions from a project directory
 */
export async function getProjectSessions(projectPath: string): Promise<Session[]> {
  const sessionFiles = await listSessionFiles(projectPath)
  const allSessions: Session[] = []
  const agentSessionsMap = new Map<string, Session>()

  const projectId = projectPath.split('/').pop() || 'unknown'
  const projectName = getProjectName(projectId)

  // First pass: load all sessions
  for (const { filename, size, path } of sessionFiles) {
    if (isEmptyFile(size)) continue

    const sessionId = filename.replace('.jsonl', '')

    try {
      const { messages, timestamp } = await readSessionFile(path)

      if (shouldSkipSession(messages)) continue

      const session: Session = {
        id: sessionId,
        projectId,
        projectName,
        timestamp,
        messages,
        messageCount: messages.length,
        title: extractSessionTitle(messages),
        isAgent: isAgentSession(sessionId)
      }

      if (session.isAgent) {
        agentSessionsMap.set(sessionId, session)
      } else {
        allSessions.push(session)
      }
    } catch (error) {
      console.error(`Error parsing ${filename}:`, error)
    }
  }

  // Second pass: attach agent sessions to parents
  for (const session of allSessions) {
    const agentDescriptions = collectAgentDescriptions(session.messages)
    attachAgentSessionsToParent(session, agentDescriptions, agentSessionsMap)
  }

  return allSessions
}

/**
 * Load agent sessions from files
 */
export async function loadAgentSessionsFromFiles(
  projectPath: string,
  projectId: string,
  agentDescriptions: Map<string, string>
): Promise<Session[]> {
  const agentSessions: Session[] = []
  const projectName = getProjectName(projectId)

  for (const [agentSessionId, description] of agentDescriptions) {
    const agentFile = join(projectPath, `${agentSessionId}.jsonl`)
    try {
      const { messages, timestamp } = await readSessionFile(agentFile)
      agentSessions.push({
        id: agentSessionId,
        projectId,
        projectName,
        timestamp,
        messages,
        messageCount: messages.length,
        title: description,
        isAgent: true
      })
    } catch {
      // Skip if file not found
    }
  }

  agentSessions.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return agentSessions
}
