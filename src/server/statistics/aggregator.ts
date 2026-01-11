import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import type { TokenUsage } from '../types.js'
import { CLAUDE_DIR } from '../constants.js'
import { PRICING, DEFAULT_PRICING_MODEL } from '../claude/config.js'
import { parseJsonl } from '../utils/jsonl.js'
import { extractTokenUsage, calculateCost, createEmptyTokenUsage } from './tokenUsage.js'
import { getProjectName } from '../claude/projects/repository.js'
import { collectAgentDescriptions } from '../claude/sessions/agents.js'
import { shouldSkipSession, isAgentSession, isEmptyFile } from '../claude/sessions/filters.js'

/**
 * Format date to YYYY-MM-DD in local timezone
 */
function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Aggregated statistics data structure
 */
export interface AggregatedData {
  // Maps
  dailyMap: Map<string, { tokenUsage: TokenUsage; sessionIds: Set<string> }>
  projectMap: Map<string, { tokenUsage: TokenUsage; sessionIds: Set<string>; name: string }>
  modelMap: Map<string, { tokenUsage: TokenUsage; messageCount: number }>
  hourlyMap: Map<number, { tokenUsage: TokenUsage; sessionIds: Set<string>; messageCount: number }>
  weekdayMap: Map<number, { tokenUsage: TokenUsage; sessionIds: Set<string>; messageCount: number }>
  toolUsageMap: Map<string, { total: number; successful: number }>

  // Totals
  totalMessages: number
  totalSessions: number
  minDate: Date | null
  maxDate: Date | null

  // Cache stats
  totalCacheCreation: number
  totalCacheRead: number
  ephemeral5mTokens: number
  ephemeral1hTokens: number

  // Usage arrays
  allUsages: TokenUsage[]
  allCosts: number[]

  // Agent stats
  totalAgentSessions: number
}

/**
 * Create empty aggregated data structure
 */
function createEmptyAggregatedData(): AggregatedData {
  const hourlyMap = new Map<number, { tokenUsage: TokenUsage; sessionIds: Set<string>; messageCount: number }>()
  const weekdayMap = new Map<number, { tokenUsage: TokenUsage; sessionIds: Set<string>; messageCount: number }>()

  for (let hour = 0; hour < 24; hour++) {
    hourlyMap.set(hour, {
      tokenUsage: createEmptyTokenUsage(),
      sessionIds: new Set(),
      messageCount: 0
    })
  }

  for (let weekday = 0; weekday < 7; weekday++) {
    weekdayMap.set(weekday, {
      tokenUsage: createEmptyTokenUsage(),
      sessionIds: new Set(),
      messageCount: 0
    })
  }

  return {
    dailyMap: new Map(),
    projectMap: new Map(),
    modelMap: new Map(),
    hourlyMap,
    weekdayMap,
    toolUsageMap: new Map(),
    totalMessages: 0,
    totalSessions: 0,
    minDate: null,
    maxDate: null,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    ephemeral5mTokens: 0,
    ephemeral1hTokens: 0,
    allUsages: [],
    allCosts: [],
    totalAgentSessions: 0
  }
}

/**
 * Process a single message and update aggregated data
 */
function processMessage(
  message: any,
  sessionId: string,
  projectId: string,
  data: AggregatedData,
  toolUseIdMap: Map<string, string> // Maps tool_use_id to tool name
): void {
  // Process tool_result first (before extractTokenUsage check) since user messages don't have usage
  if (message.type === 'user' && message.message?.content) {
    const content = Array.isArray(message.message.content)
      ? message.message.content
      : [{ type: 'text', text: message.message.content }]

    for (const item of content) {
      if (item.type === 'tool_result') {
        const toolUseId = item.tool_use_id
        const toolName = toolUseIdMap.get(toolUseId)

        // Count as successful if:
        // 1. We can find the tool name from toolUseIdMap
        // 2. Either is_error is false/undefined, OR there's no error field at all
        if (toolName) {
          const isError = item.is_error === true
          if (!isError) {
            const stats = data.toolUsageMap.get(toolName)
            if (stats) {
              stats.successful++
            }
          }
        }
      }
    }
  }

  const result = extractTokenUsage(message)
  if (!result) return

  const { usage, model } = result
  const messageDate = new Date(message.timestamp)

  // Update min/max dates
  if (!data.minDate || messageDate < data.minDate) {
    data.minDate = messageDate
  }
  if (!data.maxDate || messageDate > data.maxDate) {
    data.maxDate = messageDate
  }

  data.totalMessages++

  const pricing = PRICING[model] || PRICING[DEFAULT_PRICING_MODEL]
  data.allUsages.push(usage)
  const costBreakdown = calculateCost(usage, pricing)
  data.allCosts.push(costBreakdown.totalCost)

  // Update daily map
  const dateKey = formatDateLocal(messageDate)
  if (!data.dailyMap.has(dateKey)) {
    data.dailyMap.set(dateKey, {
      tokenUsage: createEmptyTokenUsage(),
      sessionIds: new Set()
    })
  }
  const dailyData = data.dailyMap.get(dateKey)!
  dailyData.tokenUsage.inputTokens += usage.inputTokens
  dailyData.tokenUsage.cacheCreationTokens += usage.cacheCreationTokens
  dailyData.tokenUsage.cacheReadTokens += usage.cacheReadTokens
  dailyData.tokenUsage.outputTokens += usage.outputTokens
  dailyData.tokenUsage.totalTokens += usage.totalTokens
  dailyData.sessionIds.add(sessionId)

  // Update hourly map
  const hour = messageDate.getHours()
  const hourData = data.hourlyMap.get(hour)!
  hourData.tokenUsage.inputTokens += usage.inputTokens
  hourData.tokenUsage.cacheCreationTokens += usage.cacheCreationTokens
  hourData.tokenUsage.cacheReadTokens += usage.cacheReadTokens
  hourData.tokenUsage.outputTokens += usage.outputTokens
  hourData.tokenUsage.totalTokens += usage.totalTokens
  hourData.sessionIds.add(sessionId)
  hourData.messageCount++

  // Update weekday map
  const weekday = messageDate.getDay()
  const weekdayData = data.weekdayMap.get(weekday)!
  weekdayData.tokenUsage.inputTokens += usage.inputTokens
  weekdayData.tokenUsage.cacheCreationTokens += usage.cacheCreationTokens
  weekdayData.tokenUsage.cacheReadTokens += usage.cacheReadTokens
  weekdayData.tokenUsage.outputTokens += usage.outputTokens
  weekdayData.tokenUsage.totalTokens += usage.totalTokens
  weekdayData.sessionIds.add(sessionId)
  weekdayData.messageCount++

  // Update project map
  if (!data.projectMap.has(projectId)) {
    data.projectMap.set(projectId, {
      tokenUsage: createEmptyTokenUsage(),
      sessionIds: new Set(),
      name: getProjectName(projectId)
    })
  }
  const projectData = data.projectMap.get(projectId)!
  projectData.tokenUsage.inputTokens += usage.inputTokens
  projectData.tokenUsage.cacheCreationTokens += usage.cacheCreationTokens
  projectData.tokenUsage.cacheReadTokens += usage.cacheReadTokens
  projectData.tokenUsage.outputTokens += usage.outputTokens
  projectData.tokenUsage.totalTokens += usage.totalTokens

  // Update model map
  if (!data.modelMap.has(model)) {
    data.modelMap.set(model, {
      tokenUsage: createEmptyTokenUsage(),
      messageCount: 0
    })
  }
  const modelData = data.modelMap.get(model)!
  modelData.tokenUsage.inputTokens += usage.inputTokens
  modelData.tokenUsage.cacheCreationTokens += usage.cacheCreationTokens
  modelData.tokenUsage.cacheReadTokens += usage.cacheReadTokens
  modelData.tokenUsage.outputTokens += usage.outputTokens
  modelData.tokenUsage.totalTokens += usage.totalTokens
  modelData.messageCount++

  // Update cache stats
  data.totalCacheCreation += usage.cacheCreationTokens
  data.totalCacheRead += usage.cacheReadTokens

  const cacheCreation = message.message?.usage?.cache_creation
  if (cacheCreation) {
    data.ephemeral5mTokens += cacheCreation.ephemeral_5m_input_tokens || 0
    data.ephemeral1hTokens += cacheCreation.ephemeral_1h_input_tokens || 0
  }

  // Process tool_use in assistant messages
  if (message.message?.role === 'assistant' && message.message?.content) {
    const content = Array.isArray(message.message.content)
      ? message.message.content
      : [{ type: 'text', text: message.message.content }]

    for (const item of content) {
      if (item.type === 'tool_use') {
        const toolName = item.name
        const toolUseId = item.id

        // Track tool_use_id to tool name mapping
        if (toolUseId && toolName) {
          toolUseIdMap.set(toolUseId, toolName)

          // Increment total uses
          if (!data.toolUsageMap.has(toolName)) {
            data.toolUsageMap.set(toolName, { total: 0, successful: 0 })
          }
          data.toolUsageMap.get(toolName)!.total++
        }
      }
    }
  }
}

/**
 * Aggregate statistics for all projects
 */
export async function aggregateAllProjects(cutoffDate: Date): Promise<AggregatedData> {
  const data = createEmptyAggregatedData()
  const projectsDir = join(CLAUDE_DIR, 'projects')
  const projects = await readdir(projectsDir)

  for (const project of projects) {
    const projectPath = join(projectsDir, project)
    const projectStat = await stat(projectPath)

    if (!projectStat.isDirectory()) continue

    const files = await readdir(projectPath)
    const name = getProjectName(project)

    if (!data.projectMap.has(project)) {
      data.projectMap.set(project, {
        tokenUsage: createEmptyTokenUsage(),
        sessionIds: new Set(),
        name
      })
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue

      const filePath = join(projectPath, file)
      const sessionId = file.replace('.jsonl', '')

      if (isAgentSession(sessionId)) continue

      const fileStat = await stat(filePath)
      if (isEmptyFile(fileStat.size)) continue

      const messages = await parseJsonl(filePath)
      if (shouldSkipSession(messages)) continue
      const agentDescriptions = collectAgentDescriptions(messages)
      const isAgent = agentDescriptions.size > 0

      if (isAgent) {
        data.totalAgentSessions++
      }

      const projectData = data.projectMap.get(project)!
      projectData.sessionIds.add(sessionId)
      data.totalSessions++

      // Track tool_use_id to tool name mapping for this session
      const toolUseIdMap = new Map<string, string>()

      for (const message of messages) {
        const messageDate = new Date(message.timestamp)
        if (messageDate < cutoffDate) continue

        processMessage(message, sessionId, project, data, toolUseIdMap)
      }
    }
  }

  return data
}

/**
 * Aggregate statistics for a single project
 */
export async function aggregateProject(projectId: string, cutoffDate: Date): Promise<AggregatedData> {
  const data = createEmptyAggregatedData()
  const projectsDir = join(CLAUDE_DIR, 'projects')
  const projectPath = join(projectsDir, projectId)

  const files = await readdir(projectPath)
  const name = getProjectName(projectId)

  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue

    const filePath = join(projectPath, file)
    const sessionId = file.replace('.jsonl', '')

    if (isAgentSession(sessionId)) continue

    const fileStat = await stat(filePath)
    if (isEmptyFile(fileStat.size)) continue

    const messages = await parseJsonl(filePath)
    if (shouldSkipSession(messages)) continue
    const agentDescriptions = collectAgentDescriptions(messages)
    const isAgent = agentDescriptions.size > 0

    if (isAgent) {
      data.totalAgentSessions++
    }

    data.totalSessions++

    // Track tool_use_id to tool name mapping for this session
    const toolUseIdMap = new Map<string, string>()

    for (const message of messages) {
      const messageDate = new Date(message.timestamp)
      if (messageDate < cutoffDate) continue

      processMessage(message, sessionId, projectId, data, toolUseIdMap)
    }
  }

  return data
}
