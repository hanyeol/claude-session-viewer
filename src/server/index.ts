import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import { existsSync } from 'fs'
import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import chokidar from 'chokidar'
import getPort from 'get-port'

const CLAUDE_DIR = join(homedir(), '.claude')
const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST_DIR = resolve(SERVER_DIR, '../client')
const DEFAULT_PORT = 9090

const server = Fastify({
  logger: true
})

// Plugins
await server.register(websocket)

if (existsSync(CLIENT_DIST_DIR)) {
  await server.register(fastifyStatic, {
    root: CLIENT_DIST_DIR
  })

  server.setNotFoundHandler((request, reply) => {
    const url = request.raw.url || ''
    if (url.startsWith('/api') || url.startsWith('/ws')) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    reply.sendFile('index.html')
  })
}

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

function extractFirstText(content: any): string | null {
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'text' && item.text) {
        const cleaned = cleanText(item.text)
        if (cleaned) {
          return cleaned
        }
      }
    }
    return null
  }

  if (typeof content === 'string') {
    const cleaned = cleanText(content)
    return cleaned || null
  }

  return null
}

// Helper: Extract title from session messages
function extractSessionTitle(messages: any[]): string {
  // First, try to find queue-operation / enqueue message
  for (const msg of messages) {
    if (msg.type === 'queue-operation' && msg.operation === 'enqueue' && msg.content) {
      const firstText = extractFirstText(msg.content)
      if (firstText) {
        return firstText.substring(0, 100).trim()
      }
    }
  }

  // Fallback: Find first user message with actual text content
  for (const msg of messages) {
    if (msg.type === 'user' && msg.message?.content) {
      const firstText = extractFirstText(msg.message.content)
      if (firstText) {
        return firstText.substring(0, 100).trim()
      }
    }
  }

  return 'Untitled Session'
}

function getProjectNameFromPath(projectPath: string): string {
  return projectPath.split('/').pop()?.replace(/-Users-hanyeol-Projects-/, '') || 'unknown'
}

function getProjectDisplayName(projectName: string): string {
  return projectName.replace(/-Users-hanyeol-Projects-/, '')
}

function collectAgentDescriptions(messages: any[]): Map<string, string> {
  const agentDescriptions = new Map<string, string>()
  const toolUseDescriptions = new Map<string, string>()
  const toolResultAgentIds = new Map<string, string>()

  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
      for (const item of msg.message.content) {
        if (item.type === 'tool_use' && item.name === 'Task' && item.input?.description) {
          toolUseDescriptions.set(item.id, item.input.description)
        }
      }
    }

    const agentId = msg.agentId || msg.toolUseResult?.agentId
    if (agentId && msg.message?.content && Array.isArray(msg.message.content)) {
      for (const item of msg.message.content) {
        if (item.type === 'tool_result' && item.tool_use_id) {
          toolResultAgentIds.set(item.tool_use_id, agentId)
        }
      }
    }
  }

  for (const [toolUseId, description] of toolUseDescriptions.entries()) {
    const agentId = toolResultAgentIds.get(toolUseId)
    if (agentId) {
      agentDescriptions.set(`agent-${agentId}`, description)
    }
  }

  return agentDescriptions
}

function attachAgentSessionsFromMap(
  session: Session,
  agentDescriptions: Map<string, string>,
  agentSessionsMap: Map<string, Session>
): void {
  if (agentDescriptions.size === 0) return

  session.agentSessions = []
  for (const [agentSessionId, description] of agentDescriptions) {
    const agentSession = agentSessionsMap.get(agentSessionId)
    if (agentSession) {
      agentSession.title = description
      session.agentSessions.push(agentSession)
    }
  }
  session.agentSessions.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

async function loadAgentSessionsFromFiles(
  projectPath: string,
  projectName: string,
  agentDescriptions: Map<string, string>
): Promise<Session[]> {
  const agentSessions: Session[] = []

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

  agentSessions.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  return agentSessions
}

function findAgentTitleFromParentMessages(messages: any[], agentId: string): string | null {
  const agentDescriptions = collectAgentDescriptions(messages)
  const description = agentDescriptions.get(`agent-${agentId}`)
  return description || null
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
        const projectName = getProjectNameFromPath(projectPath)

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
    const agentDescriptions = collectAgentDescriptions(session.messages)
    attachAgentSessionsFromMap(session, agentDescriptions, agentSessionsMap)
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

          const displayName = getProjectDisplayName(project)

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

// Helper: Inject agentId into Task tool_use content
function injectAgentIdsIntoMessages(messages: any[]): any[] {
  // First pass: collect tool_use_id to agentId mapping
  const toolUseToAgentId = new Map<string, string>()

  for (const msg of messages) {
    const agentId = msg.agentId || msg.toolUseResult?.agentId
    if (agentId && msg.message?.content && Array.isArray(msg.message.content)) {
      for (const item of msg.message.content) {
        if (item.type === 'tool_result' && item.tool_use_id) {
          toolUseToAgentId.set(item.tool_use_id, agentId)
        }
      }
    }
  }

  // Second pass: inject agentId into Task tool_use content
  return messages.map((msg) => {
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      const updatedContent = msg.message.content.map((item: any) => {
        if (item.type === 'tool_use' && item.name === 'Task' && item.id) {
          const agentId = toolUseToAgentId.get(item.id)
          if (agentId) {
            return { ...item, agentId }
          }
        }
        return item
      })

      return {
        ...msg,
        message: {
          ...msg.message,
          content: updatedContent
        }
      }
    }

    return msg
  })
}

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
        const projectName = getProjectDisplayName(project)
        let title = extractSessionTitle(messages)

        // For agent sessions, try to find the description from parent session
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

        // If this is a main session (not agent), attach agent sessions
        let agentSessions: Session[] | undefined
        if (!isAgent) {
          const agentDescriptions = collectAgentDescriptions(messages)
          if (agentDescriptions.size > 0) {
            agentSessions = await loadAgentSessionsFromFiles(projectPath, projectName, agentDescriptions)
          }
        }

        // Inject agentId into tool_result content
        const messagesWithAgentIds = injectAgentIdsIntoMessages(messages)

        return {
          session: {
            id,
            project: projectName,
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

// WebSocket: Watch for file changes
server.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket) => {
    const projectsDir = join(CLAUDE_DIR, 'projects')

    const watcher = chokidar.watch(projectsDir, {
      ignoreInitial: true,
      persistent: true
    })

    watcher.on('add', (path) => {
      socket.send(JSON.stringify({ type: 'file-added', path }))
    })

    watcher.on('change', (path) => {
      socket.send(JSON.stringify({ type: 'file-changed', path }))
    })

    watcher.on('unlink', (path) => {
      socket.send(JSON.stringify({ type: 'file-deleted', path }))
    })

    socket.on('close', () => {
      watcher.close()
    })

    socket.on('error', (err: Error) => {
      console.error('WebSocket error:', err)
    })
  })
})

// Start server
const start = async () => {
  try {
    const envPort = process.env.PORT ? Number(process.env.PORT) : undefined
    const port = Number.isFinite(envPort) ? envPort : await getPort({ port: DEFAULT_PORT })

    await server.listen({ port })

    if (port !== DEFAULT_PORT) {
      console.log(`Port ${DEFAULT_PORT} is in use, using port ${port} instead`)
    }

    const url = `http://localhost:${port}`
    console.log(`Server running on \x1b[36m${url}\x1b[0m`)
    console.log(`Watching Claude directory: \x1b[36m${CLAUDE_DIR}\x1b[0m`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
