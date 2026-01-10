import type { FastifyInstance } from 'fastify'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import type {
  TokenStatistics,
  TokenUsage,
  DailyTokenStats,
  ProjectTokenStats,
  ModelTokenStats,
  ToolUsageStats,
  HourlyActivityStats,
  WeekdayActivityStats
} from '../types.js'
import { CLAUDE_DIR } from '../constants.js'
import { PRICING, DEFAULT_PRICING_MODEL, WEEKDAY_NAMES } from '../claude/config.js'
import { parseJsonl } from '../utils/jsonl.js'
import { extractTokenUsage, aggregateTokenUsage, calculateCost, createEmptyTokenUsage } from '../utils/tokenStats.js'
import { getProjectDisplayName } from '../claude/projects/repository.js'
import { collectAgentDescriptions } from '../claude/sessions/agents.js'
import { shouldSkipSession, isAgentSession, isEmptyFile } from '../claude/sessions/filters.js'

/**
 * Statistics routes
 */
export async function registerStatisticsRoutes(server: FastifyInstance) {
  server.get<{ Querystring: { days?: string } }>('/api/statistics/tokens', async (request, reply) => {
    try {
      const projectsDir = join(CLAUDE_DIR, 'projects')
      const projects = await readdir(projectsDir)

      const daysParam = request.query.days || '30'
      const cutoffDate = new Date()

      if (daysParam !== 'all') {
        const days = parseInt(daysParam, 10)
        cutoffDate.setDate(cutoffDate.getDate() - days)
        cutoffDate.setHours(0, 0, 0, 0)
      } else {
        cutoffDate.setFullYear(2000, 0, 1)
      }

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
      const allCosts = []

      const toolUsageMap = new Map<string, { total: number; successful: number }>()
      let totalAgentSessions = 0

      const hourlyMap = new Map<number, { usage: TokenUsage; sessionIds: Set<string>; messageCount: number }>()
      const weekdayMap = new Map<number, { usage: TokenUsage; sessionIds: Set<string>; messageCount: number }>()

      for (let hour = 0; hour < 24; hour++) {
        hourlyMap.set(hour, {
          usage: createEmptyTokenUsage(),
          sessionIds: new Set(),
          messageCount: 0
        })
      }

      for (let weekday = 0; weekday < 7; weekday++) {
        weekdayMap.set(weekday, {
          usage: createEmptyTokenUsage(),
          sessionIds: new Set(),
          messageCount: 0
        })
      }

      for (const project of projects) {
        const projectPath = join(projectsDir, project)
        const projectStat = await stat(projectPath)

        if (!projectStat.isDirectory()) continue

        const files = await readdir(projectPath)
        const displayName = getProjectDisplayName(project)

        if (!projectMap.has(project)) {
          projectMap.set(project, {
            usage: createEmptyTokenUsage(),
            sessionIds: new Set(),
            displayName
          })
        }

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue

          const filePath = join(projectPath, file)
          const fileStat = await stat(filePath)

          if (isEmptyFile(fileStat.size)) continue

          const sessionId = file.replace('.jsonl', '')
          if (isAgentSession(sessionId)) continue

          try {
            const messages = await parseJsonl(filePath)

            if (shouldSkipSession(messages)) continue

            totalSessions++
            const projectData = projectMap.get(project)!
            projectData.sessionIds.add(sessionId)

            const agentDescriptions = collectAgentDescriptions(messages)
            if (agentDescriptions.size > 0) {
              totalAgentSessions++
            }

            for (const message of messages) {
              const tokenData = extractTokenUsage(message)
              if (!tokenData) continue

              const messageDate = new Date(message.timestamp)

              if (messageDate < cutoffDate) continue

              totalMessages++
              const { usage, model } = tokenData

              const pricing = PRICING[model] || PRICING[DEFAULT_PRICING_MODEL]
              allUsages.push(usage)
              allCosts.push(calculateCost(usage, pricing))

              const dateKey = messageDate.toISOString().split('T')[0]

              if (!minDate || messageDate < minDate) minDate = messageDate
              if (!maxDate || messageDate > maxDate) maxDate = messageDate

              if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, {
                  usage: createEmptyTokenUsage(),
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

              const hour = messageDate.getHours()
              const hourData = hourlyMap.get(hour)!
              hourData.usage.inputTokens += usage.inputTokens
              hourData.usage.cacheCreationTokens += usage.cacheCreationTokens
              hourData.usage.cacheReadTokens += usage.cacheReadTokens
              hourData.usage.outputTokens += usage.outputTokens
              hourData.usage.totalTokens += usage.totalTokens
              hourData.sessionIds.add(sessionId)
              hourData.messageCount++

              const weekday = messageDate.getDay()
              const weekdayData = weekdayMap.get(weekday)!
              weekdayData.usage.inputTokens += usage.inputTokens
              weekdayData.usage.cacheCreationTokens += usage.cacheCreationTokens
              weekdayData.usage.cacheReadTokens += usage.cacheReadTokens
              weekdayData.usage.outputTokens += usage.outputTokens
              weekdayData.usage.totalTokens += usage.totalTokens
              weekdayData.sessionIds.add(sessionId)
              weekdayData.messageCount++

              projectData.usage.inputTokens += usage.inputTokens
              projectData.usage.cacheCreationTokens += usage.cacheCreationTokens
              projectData.usage.cacheReadTokens += usage.cacheReadTokens
              projectData.usage.outputTokens += usage.outputTokens
              projectData.usage.totalTokens += usage.totalTokens

              if (!modelMap.has(model)) {
                modelMap.set(model, {
                  usage: createEmptyTokenUsage(),
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

              totalCacheCreation += usage.cacheCreationTokens
              totalCacheRead += usage.cacheReadTokens

              const cacheCreation = message.message?.usage?.cache_creation
              if (cacheCreation) {
                ephemeral5mTokens += cacheCreation.ephemeral_5m_input_tokens || 0
                ephemeral1hTokens += cacheCreation.ephemeral_1h_input_tokens || 0
              }
            }

            const toolUseIds = new Set<string>()
            const successfulToolUseIds = new Set<string>()

            for (const message of messages) {
              const messageDate = new Date(message.timestamp)
              if (messageDate < cutoffDate) continue

              if (message.type === 'assistant' && message.message?.content && Array.isArray(message.message.content)) {
                for (const item of message.message.content) {
                  if (item.type === 'tool_use' && item.name && item.id) {
                    const toolName = item.name
                    if (!toolUsageMap.has(toolName)) {
                      toolUsageMap.set(toolName, { total: 0, successful: 0 })
                    }
                    if (!toolUseIds.has(item.id)) {
                      toolUseIds.add(item.id)
                      toolUsageMap.get(toolName)!.total++
                    }
                  }
                }
              }
            }

            for (const message of messages) {
              const messageDate = new Date(message.timestamp)
              if (messageDate < cutoffDate) continue

              if (message.message?.content && Array.isArray(message.message.content)) {
                for (const item of message.message.content) {
                  if (item.type === 'tool_result' && !item.is_error && item.tool_use_id) {
                    if (!successfulToolUseIds.has(item.tool_use_id)) {
                      successfulToolUseIds.add(item.tool_use_id)
                      let found = false
                      for (const msg of messages) {
                        if (found) break
                        if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
                          for (const toolUseItem of msg.message.content) {
                            if (toolUseItem.type === 'tool_use' && toolUseItem.id === item.tool_use_id && toolUseItem.name) {
                              const toolStats = toolUsageMap.get(toolUseItem.name)
                              if (toolStats) {
                                toolStats.successful++
                                found = true
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
          } catch (error) {
            console.error(`Error processing ${file}:`, error)
          }
        }
      }

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

      const totalPotentialInput = totalUsage.inputTokens + totalCacheCreation + totalCacheRead
      const cacheHitRate = totalPotentialInput > 0 ? (totalCacheRead / totalPotentialInput) * 100 : 0

      const defaultPricing = PRICING[DEFAULT_PRICING_MODEL]
      const savedCost = (totalCacheRead / 1_000_000) * (defaultPricing.input - defaultPricing.cacheRead)

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

      const toolUsage: ToolUsageStats[] = Array.from(toolUsageMap.entries())
        .map(([toolName, stats]) => ({
          toolName,
          totalUses: stats.total,
          successfulUses: stats.successful,
          successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
        }))
        .sort((a, b) => b.totalUses - a.totalUses)

      const totalToolCalls = Array.from(toolUsageMap.values()).reduce((sum, stats) => sum + stats.total, 0)
      const agentUsageRate = totalSessions > 0 ? (totalAgentSessions / totalSessions) * 100 : 0

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
          weekdayName: WEEKDAY_NAMES[weekday],
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

      return statistics
    } catch (error) {
      console.error('Error calculating token statistics:', error)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })
}
