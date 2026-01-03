import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { homedir } from 'os'
import { join } from 'path'
import { readdir, readFile, stat } from 'fs/promises'
import chokidar from 'chokidar'

const CLAUDE_DIR = join(homedir(), '.claude')
const PORT = 3000

const server = Fastify({
  logger: true
})

// Plugins
await server.register(cors, {
  origin: 'http://localhost:5173'
})
await server.register(websocket)

// Types
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

// Helper: Parse JSONL file
async function parseJsonl(filePath: string): Promise<any[]> {
  const content = await readFile(filePath, 'utf-8')
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
}

// Helper: Clean text by removing tags
function cleanText(text: string): string {
  return text
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, ' ')
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, ' ')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Helper: Extract title from session messages
function extractSessionTitle(messages: any[]): string {
  // First, try to find queue-operation / enqueue message
  for (const msg of messages) {
    if (msg.type === 'queue-operation' && msg.operation === 'enqueue' && msg.content) {
      const content = msg.content

      // If content is array, find first non-empty text
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const cleaned = cleanText(item.text)
            if (cleaned) {
              return cleaned.substring(0, 100).trim()
            }
          }
        }
      }
    }
  }

  // Fallback: Find first user message with actual text content
  for (const msg of messages) {
    if (msg.type === 'user' && msg.message?.content) {
      const content = msg.message.content

      // If content is array, find first non-empty text
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const cleaned = cleanText(item.text)
            if (cleaned) {
              return cleaned.substring(0, 100).trim()
            }
          }
        }
      }

      // If content is string
      if (typeof content === 'string') {
        const cleaned = cleanText(content)
        if (cleaned) {
          return cleaned.substring(0, 100).trim()
        }
      }
    }
  }

  return 'Untitled Session'
}

// Helper: Get all sessions from a project directory
async function getProjectSessions(projectPath: string): Promise<Session[]> {
  const files = await readdir(projectPath)
  const allSessions: Session[] = []
  const agentSessionsMap = new Map<string, Session>()

  // First pass: collect all sessions
  for (const file of files) {
    if (file.endsWith('.jsonl')) {
      const filePath = join(projectPath, file)
      const fileStat = await stat(filePath)

      // Skip empty files
      if (fileStat.size === 0) continue

      try {
        const messages = await parseJsonl(filePath)

        // Filter: Skip sessions with only 1 message that is assistant-only
        if (messages.length === 1 && messages[0].type === 'assistant') {
          continue
        }

        // Extract project name from path
        const projectName = projectPath.split('/').pop()?.replace(/-Users-hanyeol-Projects-/, '') || 'unknown'

        // Extract session title
        const title = extractSessionTitle(messages)

        const sessionId = file.replace('.jsonl', '')
        const isAgent = sessionId.startsWith('agent-')

        const session: Session = {
          id: sessionId,
          project: projectName,
          timestamp: fileStat.mtime.toISOString(),
          messages,
          messageCount: messages.length,
          title,
          isAgent
        }

        if (isAgent) {
          agentSessionsMap.set(sessionId, session)
        } else {
          allSessions.push(session)
        }
      } catch (error) {
        console.error(`Error parsing ${file}:`, error)
      }
    }
  }

  // Second pass: attach agent sessions to their parent sessions
  for (const session of allSessions) {
    const agentDescriptions = new Map<string, string>()

    // Find all agentId references and their descriptions
    for (const msg of session.messages) {
      // Check if this is an assistant message with Task tool use
      if (msg.type === 'assistant' && msg.message?.content) {
        const content = msg.message.content
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'tool_use' && item.name === 'Task' && item.input?.description) {
              // Find the corresponding tool_result to get the agentId
              const toolUseId = item.id

              // Search for tool_result with matching tool_use_id
              for (const resultMsg of session.messages) {
                const agentId = resultMsg.agentId || resultMsg.toolUseResult?.agentId
                if (agentId && resultMsg.message?.content) {
                  const resultContent = resultMsg.message.content
                  if (Array.isArray(resultContent)) {
                    for (const resultItem of resultContent) {
                      if (resultItem.type === 'tool_result' && resultItem.tool_use_id === toolUseId) {
                        const agentSessionId = `agent-${agentId}`
                        agentDescriptions.set(agentSessionId, item.input.description)
                        break
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Attach referenced agent sessions
    if (agentDescriptions.size > 0) {
      session.agentSessions = []
      for (const [agentSessionId, description] of agentDescriptions) {
        const agentSession = agentSessionsMap.get(agentSessionId)
        if (agentSession) {
          // Override agent session title with the description from Task tool
          agentSession.title = description
          session.agentSessions.push(agentSession)
        }
      }
      // Sort agent sessions by timestamp
      session.agentSessions.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    }
  }

  return allSessions
}

// API: Get all sessions grouped by project
server.get('/api/sessions', async (request, reply) => {
  try {
    const projectsDir = join(CLAUDE_DIR, 'projects')
    const projects = await readdir(projectsDir)

    const projectGroups: ProjectGroup[] = []

    for (const project of projects) {
      const projectPath = join(projectsDir, project)
      const projectStat = await stat(projectPath)

      if (projectStat.isDirectory()) {
        const sessions = await getProjectSessions(projectPath)

        if (sessions.length > 0) {
          // Sort sessions by timestamp descending
          sessions.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )

          const displayName = project.replace(/-Users-hanyeol-Projects-/, '')

          projectGroups.push({
            name: project,
            displayName,
            sessionCount: sessions.length,
            lastActivity: sessions[0].timestamp, // Most recent session
            sessions
          })
        }
      }
    }

    // Sort project groups by last activity descending
    projectGroups.sort((a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    )

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

    const isAgent = id.startsWith('agent-')

    for (const project of projects) {
      const projectPath = join(projectsDir, project)
      const sessionFile = join(projectPath, `${id}.jsonl`)

      try {
        const messages = await parseJsonl(sessionFile)
        const fileStat = await stat(sessionFile)
        const projectName = project.replace(/-Users-hanyeol-Projects-/, '')
        let title = extractSessionTitle(messages)

        // For agent sessions, try to find the description from parent session
        if (isAgent) {
          const agentId = id.replace('agent-', '')

          // Search all sessions in this project for the Task tool use
          const files = await readdir(projectPath)
          for (const file of files) {
            if (!file.startsWith('agent-') && file.endsWith('.jsonl')) {
              try {
                const parentMessages = await parseJsonl(join(projectPath, file))

                // Look for Task tool use with this agentId
                for (const msg of parentMessages) {
                  if (msg.type === 'assistant' && msg.message?.content) {
                    const content = msg.message.content
                    if (Array.isArray(content)) {
                      for (const item of content) {
                        if (item.type === 'tool_use' && item.name === 'Task' && item.input?.description) {
                          const toolUseId = item.id

                          // Find matching tool_result with this agentId
                          for (const resultMsg of parentMessages) {
                            const resultAgentId = resultMsg.agentId || resultMsg.toolUseResult?.agentId
                            if (resultAgentId === agentId && resultMsg.message?.content) {
                              const resultContent = resultMsg.message.content
                              if (Array.isArray(resultContent)) {
                                for (const resultItem of resultContent) {
                                  if (resultItem.type === 'tool_result' && resultItem.tool_use_id === toolUseId) {
                                    title = item.input.description
                                    break
                                  }
                                }
                              }
                            }
                            if (title !== extractSessionTitle(messages)) break
                          }
                        }
                        if (title !== extractSessionTitle(messages)) break
                      }
                    }
                    if (title !== extractSessionTitle(messages)) break
                  }
                  if (title !== extractSessionTitle(messages)) break
                }
              } catch {
                continue
              }
              if (title !== extractSessionTitle(messages)) break
            }
          }
        }

        // If this is a main session (not agent), attach agent sessions
        let agentSessions: Session[] | undefined
        if (!isAgent) {
          const agentDescriptions = new Map<string, string>()

          // Find all agentId references and their descriptions
          for (const msg of messages) {
            if (msg.type === 'assistant' && msg.message?.content) {
              const content = msg.message.content
              if (Array.isArray(content)) {
                for (const item of content) {
                  if (item.type === 'tool_use' && item.name === 'Task' && item.input?.description) {
                    const toolUseId = item.id

                    // Search for tool_result with matching tool_use_id
                    for (const resultMsg of messages) {
                      const agentId = resultMsg.agentId || resultMsg.toolUseResult?.agentId
                      if (agentId && resultMsg.message?.content) {
                        const resultContent = resultMsg.message.content
                        if (Array.isArray(resultContent)) {
                          for (const resultItem of resultContent) {
                            if (resultItem.type === 'tool_result' && resultItem.tool_use_id === toolUseId) {
                              const agentSessionId = `agent-${agentId}`
                              agentDescriptions.set(agentSessionId, item.input.description)
                              break
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          // Load agent sessions
          if (agentDescriptions.size > 0) {
            agentSessions = []
            for (const [agentSessionId, description] of agentDescriptions) {
              const agentFile = join(projectPath, `${agentSessionId}.jsonl`)
              try {
                const agentMessages = await parseJsonl(agentFile)
                const agentFileStat = await stat(agentFile)
                agentSessions.push({
                  id: agentSessionId,
                  project: projectName,
                  timestamp: agentFileStat.mtime.toISOString(),
                  messages: agentMessages,
                  messageCount: agentMessages.length,
                  title: description,
                  isAgent: true
                })
              } catch {
                // Skip if agent file not found
              }
            }
            // Sort agent sessions by timestamp
            agentSessions.sort((a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            )
          }
        }

        return {
          session: {
            id,
            project: projectName,
            timestamp: fileStat.mtime.toISOString(),
            messages,
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

// WebSocket: Watch for file changes
server.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const projectsDir = join(CLAUDE_DIR, 'projects')

    const watcher = chokidar.watch(projectsDir, {
      ignoreInitial: true,
      persistent: true
    })

    watcher.on('add', (path) => {
      socket.send(JSON.stringify({ type: 'file_added', path }))
    })

    watcher.on('change', (path) => {
      socket.send(JSON.stringify({ type: 'file_changed', path }))
    })

    socket.on('close', () => {
      watcher.close()
    })
  })
})

// Start server
const start = async () => {
  try {
    await server.listen({ port: PORT })
    console.log(`Server running on http://localhost:${PORT}`)
    console.log(`Watching Claude directory: ${CLAUDE_DIR}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
