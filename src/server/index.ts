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

// Remove user's home directory prefix from project directory name
// e.g., "-Users-hanyeol-Projects-hanyeol-claude-session-viewer" → "Projects-hanyeol-claude-session-viewer"
function getProjectDisplayName(projectDirName: string): string {
  const userHomePath = homedir().split('/').filter(Boolean).join('-')
  const prefix = `-${userHomePath}-`

  if (projectDirName.startsWith(prefix)) {
    return projectDirName.slice(prefix.length)
  }

  return projectDirName
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
        const projectName = getProjectDisplayName(projectPath.split('/').pop() || 'unknown')

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

// Types for token statistics
interface TokenUsage {
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  totalTokens: number
}

interface DailyTokenStats {
  date: string
  usage: TokenUsage
  sessionCount: number
}

interface ProjectTokenStats {
  project: string
  displayName: string
  usage: TokenUsage
  sessionCount: number
}

interface ModelTokenStats {
  model: string
  usage: TokenUsage
  messageCount: number
}

interface CacheStats {
  totalCacheCreation: number
  totalCacheRead: number
  ephemeral5mTokens: number
  ephemeral1hTokens: number
  cacheHitRate: number
  estimatedSavings: number
}

interface CostBreakdown {
  inputCost: number
  outputCost: number
  cacheCreationCost: number
  cacheReadCost: number
  totalCost: number
}

interface ToolUsageStats {
  toolName: string
  totalUses: number
  successfulUses: number
  successRate: number
}

interface ProductivityStats {
  toolUsage: ToolUsageStats[]
  totalToolCalls: number
  agentSessions: number
  totalSessions: number
  agentUsageRate: number
}

interface HourlyActivityStats {
  hour: number // 0-23
  sessionCount: number
  messageCount: number
  usage: TokenUsage
}

interface WeekdayActivityStats {
  weekday: number // 0 = Sunday, 6 = Saturday
  weekdayName: string
  sessionCount: number
  messageCount: number
  usage: TokenUsage
}

interface TrendAnalysis {
  byHour: HourlyActivityStats[]
  byWeekday: WeekdayActivityStats[]
}

interface TokenStatistics {
  overview: {
    total: TokenUsage
    totalSessions: number
    totalMessages: number
    dateRange: {
      start: string
      end: string
    }
  }
  daily: DailyTokenStats[]
  byProject: ProjectTokenStats[]
  byModel: ModelTokenStats[]
  cache: CacheStats
  cost: CostBreakdown
  productivity: ProductivityStats
  trends: TrendAnalysis
}

// Claude API Pricing (as of January 2025)
// Prices per 1M tokens
const PRICING = {
  'claude-sonnet-4-5-20250929': {
    input: 3.0,
    output: 15.0,
    cacheCreation: 3.75,
    cacheRead: 0.30
  },
  'claude-sonnet-4-20250514': {
    input: 3.0,
    output: 15.0,
    cacheCreation: 3.75,
    cacheRead: 0.30
  },
  'claude-opus-4-20250514': {
    input: 15.0,
    output: 75.0,
    cacheCreation: 18.75,
    cacheRead: 1.50
  },
  'claude-haiku-4-20250515': {
    input: 0.80,
    output: 4.0,
    cacheCreation: 1.0,
    cacheRead: 0.08
  }
}

// Helper: Calculate cost for token usage
function calculateCost(usage: TokenUsage, model: string): CostBreakdown {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING['claude-sonnet-4-5-20250929']

  return {
    inputCost: (usage.inputTokens / 1_000_000) * pricing.input,
    outputCost: (usage.outputTokens / 1_000_000) * pricing.output,
    cacheCreationCost: (usage.cacheCreationTokens / 1_000_000) * pricing.cacheCreation,
    cacheReadCost: (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead,
    totalCost:
      (usage.inputTokens / 1_000_000) * pricing.input +
      (usage.outputTokens / 1_000_000) * pricing.output +
      (usage.cacheCreationTokens / 1_000_000) * pricing.cacheCreation +
      (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead
  }
}

// Helper: Extract token usage from message
function extractTokenUsage(message: any): { usage: TokenUsage; model: string } | null {
  if (message.type !== 'assistant' || !message.message?.usage) {
    return null
  }

  const usage = message.message.usage
  const model = message.message.model || 'unknown'

  return {
    usage: {
      inputTokens: usage.input_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      totalTokens:
        (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.output_tokens || 0)
    },
    model
  }
}

// Helper: Aggregate token usage
function aggregateTokenUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + usage.inputTokens,
      cacheCreationTokens: acc.cacheCreationTokens + usage.cacheCreationTokens,
      cacheReadTokens: acc.cacheReadTokens + usage.cacheReadTokens,
      outputTokens: acc.outputTokens + usage.outputTokens,
      totalTokens: acc.totalTokens + usage.totalTokens
    }),
    {
      inputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  )
}

// API: Get token statistics
server.get<{ Querystring: { days?: string } }>('/api/statistics/tokens', async (request, reply) => {
  try {
    const projectsDir = join(CLAUDE_DIR, 'projects')
    const projects = await readdir(projectsDir)

    // Parse days parameter (default to 30)
    const daysParam = request.query.days || '30'
    const cutoffDate = new Date()

    if (daysParam !== 'all') {
      const days = parseInt(daysParam, 10)
      cutoffDate.setDate(cutoffDate.getDate() - days)
      cutoffDate.setHours(0, 0, 0, 0)
    } else {
      // For 'all', set to a very old date to include everything
      cutoffDate.setFullYear(2000, 0, 1)
    }

    // Data structures for aggregation
    const dailyMap = new Map<string, { usage: TokenUsage; sessionIds: Set<string> }>()
    const projectMap = new Map<string, { usage: TokenUsage; sessionIds: Set<string>; displayName: string }>()
    const modelMap = new Map<string, { usage: TokenUsage; messageCount: number }>()

    let totalMessages = 0
    let totalSessions = 0
    let minDate: Date | null = null
    let maxDate: Date | null = null

    let totalCacheCreation = 0
    let totalCacheRead = 0
    let ephemeral5mTokens = 0
    let ephemeral1hTokens = 0

    const allUsages: TokenUsage[] = []
    const allCosts: CostBreakdown[] = []

    // Productivity metrics
    const toolUsageMap = new Map<string, { total: number; successful: number }>()
    let totalAgentSessions = 0

    // Trend analysis data structures
    const hourlyMap = new Map<number, { usage: TokenUsage; sessionIds: Set<string>; messageCount: number }>()
    const weekdayMap = new Map<number, { usage: TokenUsage; sessionIds: Set<string>; messageCount: number }>()

    // Initialize hourly map (0-23)
    for (let hour = 0; hour < 24; hour++) {
      hourlyMap.set(hour, {
        usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0 },
        sessionIds: new Set(),
        messageCount: 0
      })
    }

    // Initialize weekday map (0-6, Sunday-Saturday)
    for (let weekday = 0; weekday < 7; weekday++) {
      weekdayMap.set(weekday, {
        usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0 },
        sessionIds: new Set(),
        messageCount: 0
      })
    }

    // Process all projects
    for (const project of projects) {
      const projectPath = join(projectsDir, project)
      const projectStat = await stat(projectPath)

      if (!projectStat.isDirectory()) continue

      const files = await readdir(projectPath)
      const displayName = getProjectDisplayName(project)

      // Initialize project entry
      if (!projectMap.has(project)) {
        projectMap.set(project, {
          usage: {
            inputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            outputTokens: 0,
            totalTokens: 0
          },
          sessionIds: new Set(),
          displayName
        })
      }

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue

        const filePath = join(projectPath, file)
        const fileStat = await stat(filePath)

        // Skip empty files
        if (fileStat.size === 0) continue

        // Skip agent sessions (they're counted in parent sessions)
        const sessionId = file.replace('.jsonl', '')
        if (sessionId.startsWith('agent-')) continue

        try {
          const messages = await parseJsonl(filePath)

          // Skip sessions with only 1 assistant message
          if (messages.length === 1 && messages[0].type === 'assistant') {
            continue
          }

          totalSessions++
          const projectData = projectMap.get(project)!
          projectData.sessionIds.add(sessionId)

          // Check if this session has agent sessions
          const agentDescriptions = collectAgentDescriptions(messages)
          if (agentDescriptions.size > 0) {
            totalAgentSessions++
          }

          // Process each message
          for (const message of messages) {
            const tokenData = extractTokenUsage(message)
            if (!tokenData) continue

            // Aggregate by date
            const messageDate = new Date(message.timestamp)

            // Skip messages older than cutoff date
            if (messageDate < cutoffDate) continue

            totalMessages++
            const { usage, model } = tokenData

            // Aggregate overall
            allUsages.push(usage)
            allCosts.push(calculateCost(usage, model))

            const dateKey = messageDate.toISOString().split('T')[0] // YYYY-MM-DD

            if (!minDate || messageDate < minDate) minDate = messageDate
            if (!maxDate || messageDate > maxDate) maxDate = messageDate

            if (!dailyMap.has(dateKey)) {
              dailyMap.set(dateKey, {
                usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0 },
                sessionIds: new Set()
              })
            }
            const dailyData = dailyMap.get(dateKey)!
            dailyData.usage.inputTokens += usage.inputTokens
            dailyData.usage.cacheCreationTokens += usage.cacheCreationTokens
            dailyData.usage.cacheReadTokens += usage.cacheReadTokens
            dailyData.usage.outputTokens += usage.outputTokens
            dailyData.usage.totalTokens += usage.totalTokens
            dailyData.sessionIds.add(sessionId)

            // Aggregate by hour of day
            const hour = messageDate.getHours()
            const hourData = hourlyMap.get(hour)!
            hourData.usage.inputTokens += usage.inputTokens
            hourData.usage.cacheCreationTokens += usage.cacheCreationTokens
            hourData.usage.cacheReadTokens += usage.cacheReadTokens
            hourData.usage.outputTokens += usage.outputTokens
            hourData.usage.totalTokens += usage.totalTokens
            hourData.sessionIds.add(sessionId)
            hourData.messageCount++

            // Aggregate by day of week
            const weekday = messageDate.getDay()
            const weekdayData = weekdayMap.get(weekday)!
            weekdayData.usage.inputTokens += usage.inputTokens
            weekdayData.usage.cacheCreationTokens += usage.cacheCreationTokens
            weekdayData.usage.cacheReadTokens += usage.cacheReadTokens
            weekdayData.usage.outputTokens += usage.outputTokens
            weekdayData.usage.totalTokens += usage.totalTokens
            weekdayData.sessionIds.add(sessionId)
            weekdayData.messageCount++

            // Aggregate by project
            projectData.usage.inputTokens += usage.inputTokens
            projectData.usage.cacheCreationTokens += usage.cacheCreationTokens
            projectData.usage.cacheReadTokens += usage.cacheReadTokens
            projectData.usage.outputTokens += usage.outputTokens
            projectData.usage.totalTokens += usage.totalTokens

            // Aggregate by model
            if (!modelMap.has(model)) {
              modelMap.set(model, {
                usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0 },
                messageCount: 0
              })
            }
            const modelData = modelMap.get(model)!
            modelData.usage.inputTokens += usage.inputTokens
            modelData.usage.cacheCreationTokens += usage.cacheCreationTokens
            modelData.usage.cacheReadTokens += usage.cacheReadTokens
            modelData.usage.outputTokens += usage.outputTokens
            modelData.usage.totalTokens += usage.totalTokens
            modelData.messageCount++

            // Cache stats
            totalCacheCreation += usage.cacheCreationTokens
            totalCacheRead += usage.cacheReadTokens

            const cacheCreation = message.message?.usage?.cache_creation
            if (cacheCreation) {
              ephemeral5mTokens += cacheCreation.ephemeral_5m_input_tokens || 0
              ephemeral1hTokens += cacheCreation.ephemeral_1h_input_tokens || 0
            }
          }

          // Track tool usage for all messages
          const toolUseIds = new Set<string>()
          const successfulToolUseIds = new Set<string>()

          // First pass: collect all tool_use instances
          for (const message of messages) {
            // Skip messages older than cutoff date
            const messageDate = new Date(message.timestamp)
            if (messageDate < cutoffDate) continue

            if (message.type === 'assistant' && message.message?.content && Array.isArray(message.message.content)) {
              for (const item of message.message.content) {
                if (item.type === 'tool_use' && item.name && item.id) {
                  const toolName = item.name
                  if (!toolUsageMap.has(toolName)) {
                    toolUsageMap.set(toolName, { total: 0, successful: 0 })
                  }
                  // Only count each tool_use_id once
                  if (!toolUseIds.has(item.id)) {
                    toolUseIds.add(item.id)
                    const toolStats = toolUsageMap.get(toolName)!
                    toolStats.total++
                  }
                }
              }
            }
          }

          // Second pass: find successful tool results
          for (const message of messages) {
            // Skip messages older than cutoff date
            const messageDate = new Date(message.timestamp)
            if (messageDate < cutoffDate) continue

            if (message.message?.content && Array.isArray(message.message.content)) {
              for (const item of message.message.content) {
                if (item.type === 'tool_result' && !item.is_error && item.tool_use_id) {
                  // Only count each successful tool_result once
                  if (!successfulToolUseIds.has(item.tool_use_id)) {
                    successfulToolUseIds.add(item.tool_use_id)
                    // Find the corresponding tool_use to get the tool name
                    let found = false
                    for (const msg of messages) {
                      if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
                        for (const toolUseItem of msg.message.content) {
                          if (toolUseItem.type === 'tool_use' && toolUseItem.id === item.tool_use_id && toolUseItem.name) {
                            const toolName = toolUseItem.name
                            const toolStats = toolUsageMap.get(toolName)
                            if (toolStats) {
                              toolStats.successful++
                            }
                            found = true
                            break
                          }
                        }
                        if (found) break
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error processing ${file}:`, error)
        }
      }
    }

    // Calculate overall totals
    const totalUsage = aggregateTokenUsage(allUsages)
    const totalCost = allCosts.reduce(
      (acc, cost) => ({
        inputCost: acc.inputCost + cost.inputCost,
        outputCost: acc.outputCost + cost.outputCost,
        cacheCreationCost: acc.cacheCreationCost + cost.cacheCreationCost,
        cacheReadCost: acc.cacheReadCost + cost.cacheReadCost,
        totalCost: acc.totalCost + cost.totalCost
      }),
      { inputCost: 0, outputCost: 0, cacheCreationCost: 0, cacheReadCost: 0, totalCost: 0 }
    )

    // Calculate cache efficiency
    const totalPotentialInput = totalUsage.inputTokens + totalCacheCreation + totalCacheRead
    const cacheHitRate = totalPotentialInput > 0 ? (totalCacheRead / totalPotentialInput) * 100 : 0

    // Estimate savings (cache read is ~10x cheaper than regular input for Sonnet)
    const savedCost = (totalCacheRead / 1_000_000) * (PRICING['claude-sonnet-4-5-20250929'].input - PRICING['claude-sonnet-4-5-20250929'].cacheRead)

    // Convert maps to arrays
    const daily: DailyTokenStats[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        usage: data.usage,
        sessionCount: data.sessionIds.size
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const byProject: ProjectTokenStats[] = Array.from(projectMap.entries())
      .map(([project, data]) => ({
        project,
        displayName: data.displayName,
        usage: data.usage,
        sessionCount: data.sessionIds.size
      }))
      .sort((a, b) => b.usage.totalTokens - a.usage.totalTokens)

    const byModel: ModelTokenStats[] = Array.from(modelMap.entries())
      .map(([model, data]) => ({
        model,
        usage: data.usage,
        messageCount: data.messageCount
      }))
      .sort((a, b) => b.usage.totalTokens - a.usage.totalTokens)

    // Calculate productivity metrics
    const toolUsage: ToolUsageStats[] = Array.from(toolUsageMap.entries())
      .map(([toolName, stats]) => ({
        toolName,
        totalUses: stats.total,
        successfulUses: stats.successful,
        successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
      }))
      .sort((a, b) => b.totalUses - a.totalUses)

    // Debug: log tools with success rate > 100%
    const problematicTools = toolUsage.filter(t => t.successRate > 100)
    if (problematicTools.length > 0) {
      console.log('⚠️  Tools with success rate > 100%:', JSON.stringify(problematicTools, null, 2))
    }

    const totalToolCalls = Array.from(toolUsageMap.values()).reduce((sum, stats) => sum + stats.total, 0)
    const agentUsageRate = totalSessions > 0 ? (totalAgentSessions / totalSessions) * 100 : 0

    // Convert trend maps to arrays
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const byHour: HourlyActivityStats[] = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({
        hour,
        sessionCount: data.sessionIds.size,
        messageCount: data.messageCount,
        usage: data.usage
      }))
      .sort((a, b) => a.hour - b.hour)

    const byWeekday: WeekdayActivityStats[] = Array.from(weekdayMap.entries())
      .map(([weekday, data]) => ({
        weekday,
        weekdayName: weekdayNames[weekday],
        sessionCount: data.sessionIds.size,
        messageCount: data.messageCount,
        usage: data.usage
      }))
      .sort((a, b) => a.weekday - b.weekday)

    const statistics: TokenStatistics = {
      overview: {
        total: totalUsage,
        totalSessions,
        totalMessages,
        dateRange: {
          start: minDate?.toISOString() || new Date().toISOString(),
          end: maxDate?.toISOString() || new Date().toISOString()
        }
      },
      daily,
      byProject,
      byModel,
      cache: {
        totalCacheCreation,
        totalCacheRead,
        ephemeral5mTokens,
        ephemeral1hTokens,
        cacheHitRate,
        estimatedSavings: savedCost
      },
      cost: totalCost,
      productivity: {
        toolUsage,
        totalToolCalls,
        agentSessions: totalAgentSessions,
        totalSessions,
        agentUsageRate
      },
      trends: {
        byHour,
        byWeekday
      }
    }

    console.log('Token statistics summary:', {
      totalSessions,
      totalMessages,
      dailyEntries: daily.length,
      projectEntries: byProject.length,
      modelEntries: byModel.length,
      sampleDaily: daily[0]
    })

    return statistics
  } catch (error) {
    console.error('Error calculating token statistics:', error)
    return reply.code(500).send({ error: 'Internal server error' })
  }
})

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
  const toolUseToAgentId = new Map<string, string>()

  for (const msg of messages) {
    const agentId = msg.agentId || msg.toolUseResult?.agentId
    const content = msg.message?.content
    if (!agentId || !Array.isArray(content)) continue

    for (const item of content) {
      if (item.type === 'tool_result' && item.tool_use_id) {
        toolUseToAgentId.set(item.tool_use_id, agentId)
      }
    }
  }

  return messages.map((msg) => {
    const content = msg.message?.content
    if (!Array.isArray(content)) return msg

    const updatedContent = content.map((item: any) => {
      if (item.type !== 'tool_use' || item.name !== 'Task' || !item.id) return item
      const agentId = toolUseToAgentId.get(item.id)
      return agentId ? { ...item, agentId } : item
    })

    return {
      ...msg,
      message: {
        ...msg.message,
        content: updatedContent
      }
    }
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
