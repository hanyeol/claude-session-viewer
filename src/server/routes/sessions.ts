import type { FastifyInstance } from 'fastify'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { CLAUDE_DIR } from '../constants.js'
import { parseJsonl } from '../utils/jsonl.js'
import { getAllProjectsWithSessions } from '../claude/projects/service.js'
import { getProjectName, getProjectPath } from '../claude/projects/repository.js'
import { loadAgentSessionsFromFiles } from '../claude/sessions/service.js'
import {
  collectAgentDescriptions,
  injectAgentIdsIntoMessages,
  findAgentTitleFromParentMessages
} from '../claude/sessions/agents.js'
import { isAgentSession } from '../claude/sessions/filters.js'
import { extractSessionTitle } from '../claude/sessions/title.js'
import { executeClaudeCli } from '../claude/cli.js'

/**
 * Session routes
 */
export async function registerSessionRoutes(server: FastifyInstance) {
  // API: Get all sessions grouped by project
  server.get('/api/sessions', async (request, reply) => {
    try {
      const projectsDir = join(CLAUDE_DIR, 'projects')
      const projectGroups = await getAllProjectsWithSessions(projectsDir)
      return { projects: projectGroups }
    } catch (error) {
      console.error('Error reading sessions:', error)
      return { projects: [] }
    }
  })

  // API: Get session by ID
  server.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    try {
      const { id } = request.params
      const projectsDir = join(CLAUDE_DIR, 'projects')
      const projects = await readdir(projectsDir)

      const isAgent = isAgentSession(id)

      for (const project of projects) {
        const projectPath = join(projectsDir, project)
        const sessionFile = join(projectPath, `${id}.jsonl`)

        try {
          const messages = await parseJsonl(sessionFile)
          const fileStat = await stat(sessionFile)
          const projectName = project
          let title = extractSessionTitle(messages)

          // For agent sessions, find description from parent
          if (isAgent) {
            const agentId = id.replace('agent-', '')
            const files = await readdir(projectPath)
            for (const file of files) {
              if (!file.startsWith('agent-') && file.endsWith('.jsonl')) {
                try {
                  const parentMessages = await parseJsonl(join(projectPath, file))
                  const description = findAgentTitleFromParentMessages(parentMessages, agentId)
                  if (description) {
                    title = description
                    break
                  }
                } catch {
                  continue
                }
              }
            }
          }

          // Attach agent sessions for main sessions
          let agentSessions
          if (!isAgent) {
            const agentDescriptions = collectAgentDescriptions(messages)
            if (agentDescriptions.size > 0) {
              agentSessions = await loadAgentSessionsFromFiles(projectPath, project, agentDescriptions)
            }
          }

          const messagesWithAgentIds = injectAgentIdsIntoMessages(messages)

          return {
            session: {
              id,
              projectId: projectName,
              projectName: getProjectName(projectName),
              timestamp: fileStat.mtime.toISOString(),
              messages: messagesWithAgentIds,
              messageCount: messages.length,
              title,
              isAgent,
              agentSessions
            }
          }
        } catch {
          continue
        }
      }

      return reply.code(404).send({ error: 'Session not found' })
    } catch (error) {
      console.error('Error reading session:', error)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  // API: Send message to session (execute Claude CLI)
  server.post<{
    Params: { id: string }
    Body: { prompt: string }
  }>('/api/sessions/:id/messages', async (request, reply) => {
    try {
      const { id } = request.params
      const { prompt } = request.body

      if (!prompt || typeof prompt !== 'string') {
        return reply.code(400).send({ error: 'Prompt is required' })
      }

      const projectsDir = join(CLAUDE_DIR, 'projects')
      const projects = await readdir(projectsDir)

      // Find the project containing this session
      for (const project of projects) {
        const projectPath = join(projectsDir, project)
        const sessionFile = join(projectPath, `${id}.jsonl`)

        try {
          await stat(sessionFile)

          // Found the session, execute Claude CLI in the project directory
          const realProjectPath = getProjectPath(project)

          const result = await executeClaudeCli({
            cwd: realProjectPath,
            prompt,
            sessionId: id,
            outputFormat: 'json'
          })

          if (!result.success) {
            return reply.code(500).send({
              error: 'Failed to execute Claude CLI',
              details: result.error
            })
          }

          return {
            success: true,
            output: result.output
          }
        } catch {
          continue
        }
      }

      return reply.code(404).send({ error: 'Session not found' })
    } catch (error) {
      console.error('Error sending message:', error)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })
}
