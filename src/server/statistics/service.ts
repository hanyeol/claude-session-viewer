import type {
  UsageStatistics,
  ProjectUsageStats,
  ModelUsageStats,
  ToolUsageStats,
  HourlyActivityStats,
  WeekdayActivityStats
} from '../types.js'
import { PRICING, DEFAULT_PRICING_MODEL, WEEKDAY_NAMES } from '../claude/config.js'
import { aggregateTokenUsage, calculateCost } from './tokenUsage.js'
import { fillMissingDates } from './utils.js'
import { aggregateAllProjects, aggregateProject } from './aggregator.js'

/**
 * Calculate cutoff date based on days parameter
 */
function calculateCutoffDate(days: string | number): Date {
  const cutoffDate = new Date()

  if (days === 'all') {
    cutoffDate.setFullYear(2000, 0, 1)
  } else {
    const daysNum = typeof days === 'string' ? parseInt(days, 10) : days
    cutoffDate.setDate(cutoffDate.getDate() - daysNum)
    cutoffDate.setHours(0, 0, 0, 0)
  }

  return cutoffDate
}

/**
 * Get overall usage statistics across all projects
 */
export async function getOverallStatistics(days: string | number = 7): Promise<UsageStatistics> {
  const daysParam = days.toString()
  const cutoffDate = calculateCutoffDate(days)
  const data = await aggregateAllProjects(cutoffDate)

  // Calculate totals
  const totalUsage = aggregateTokenUsage(data.allUsages)
  const defaultPricing = PRICING[DEFAULT_PRICING_MODEL]
  const costBreakdown = calculateCost(totalUsage, defaultPricing)
  const savedCost = (data.totalCacheRead / 1_000_000) * (defaultPricing.input - defaultPricing.cacheRead)

  // Determine date range first (this drives all other date-based statistics)
  const startDate = daysParam === 'all' && data.minDate
    ? data.minDate
    : cutoffDate
  const endDate = new Date()

  // Fill daily stats based on the determined date range
  const daily = fillMissingDates(data.dailyMap, startDate, endDate)

  // Build project stats
  const byProject: ProjectUsageStats[] = Array.from(data.projectMap.entries())
    .map(([project, projectData]) => ({
      id: project,
      name: projectData.name,
      tokenUsage: projectData.tokenUsage,
      sessionCount: projectData.sessionIds.size
    }))
    .sort((a, b) => b.tokenUsage.totalTokens - a.tokenUsage.totalTokens)

  // Build model stats
  const byModel: ModelUsageStats[] = Array.from(data.modelMap.entries())
    .map(([model, modelData]) => ({
      model,
      tokenUsage: modelData.tokenUsage,
      messageCount: modelData.messageCount
    }))
    .sort((a, b) => b.tokenUsage.totalTokens - a.tokenUsage.totalTokens)

  // Build tool usage stats
  const toolUsage: ToolUsageStats[] = Array.from(data.toolUsageMap.entries())
    .map(([toolName, stats]) => ({
      toolName,
      totalUses: stats.total,
      successfulUses: stats.successful,
      successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
    }))
    .sort((a, b) => b.totalUses - a.totalUses)

  const totalToolCalls = Array.from(data.toolUsageMap.values()).reduce((sum, stats) => sum + stats.total, 0)
  const agentUsageRate = data.totalSessions > 0 ? (data.totalAgentSessions / data.totalSessions) * 100 : 0

  // Build hourly stats
  const byHour: HourlyActivityStats[] = Array.from(data.hourlyMap.entries())
    .map(([hour, hourData]) => ({
      hour,
      sessionCount: hourData.sessionIds.size,
      messageCount: hourData.messageCount,
      tokenUsage: hourData.tokenUsage
    }))
    .sort((a, b) => a.hour - b.hour)

  // Build weekday stats
  const byWeekday: WeekdayActivityStats[] = Array.from(data.weekdayMap.entries())
    .map(([weekday, weekdayData]) => ({
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      sessionCount: weekdayData.sessionIds.size,
      messageCount: weekdayData.messageCount,
      tokenUsage: weekdayData.tokenUsage
    }))
    .sort((a, b) => a.weekday - b.weekday)

  const statistics: UsageStatistics = {
    overview: {
      tokenUsage: totalUsage,
      sessionCount: data.totalSessions,
      messageCount: data.totalMessages,
      dateRange: {
        start: startDate?.toISOString() || endDate.toISOString(),
        end: endDate.toISOString()
      }
    },
    daily,
    byProject,
    byModel,
    cache: {
      totalCacheCreation: data.totalCacheCreation,
      totalCacheRead: data.totalCacheRead,
      ephemeral5mTokens: data.ephemeral5mTokens,
      ephemeral1hTokens: data.ephemeral1hTokens,
      cacheHitRate: (data.totalCacheCreation + data.totalCacheRead) > 0
        ? (data.totalCacheRead / (data.totalCacheCreation + data.totalCacheRead)) * 100
        : 0,
      estimatedSavings: savedCost
    },
    cost: costBreakdown,
    productivity: {
      toolUsage,
      totalToolCalls,
      agentSessions: data.totalAgentSessions,
      totalSessions: data.totalSessions,
      agentUsageRate
    },
    trends: {
      byHour,
      byWeekday
    }
  }

  return statistics
}

/**
 * Get usage statistics for a specific project
 */
export async function getProjectStatistics(projectId: string, days: string | number = 7): Promise<UsageStatistics> {
  const daysParam = days.toString()
  const cutoffDate = calculateCutoffDate(days)
  const data = await aggregateProject(projectId, cutoffDate)

  // Calculate totals
  const totalUsage = aggregateTokenUsage(data.allUsages)
  const defaultPricing = PRICING[DEFAULT_PRICING_MODEL]
  const costBreakdown = calculateCost(totalUsage, defaultPricing)
  const savedCost = (data.totalCacheRead / 1_000_000) * (defaultPricing.input - defaultPricing.cacheRead)

  // Determine date range first (this drives all other date-based statistics)
  const startDate = daysParam === 'all' && data.minDate
    ? data.minDate
    : cutoffDate
  const endDate = new Date()

  // Fill daily stats based on the determined date range
  const daily = fillMissingDates(data.dailyMap, startDate, endDate)

  // Build project stats (single project)
  const projectData = data.projectMap.get(projectId)
  const byProject: ProjectUsageStats[] = projectData ? [{
    id: projectId,
    name: projectData.name,
    tokenUsage: totalUsage,
    sessionCount: data.totalSessions
  }] : []

  // Build model stats
  const byModel: ModelUsageStats[] = Array.from(data.modelMap.entries())
    .map(([model, modelData]) => ({
      model,
      tokenUsage: modelData.tokenUsage,
      messageCount: modelData.messageCount
    }))
    .sort((a, b) => b.tokenUsage.totalTokens - a.tokenUsage.totalTokens)

  // Build tool usage stats
  const toolUsage: ToolUsageStats[] = Array.from(data.toolUsageMap.entries())
    .map(([toolName, stats]) => ({
      toolName,
      totalUses: stats.total,
      successfulUses: stats.successful,
      successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
    }))
    .sort((a, b) => b.totalUses - a.totalUses)

  const totalToolCalls = Array.from(data.toolUsageMap.values()).reduce((sum, stats) => sum + stats.total, 0)
  const agentUsageRate = data.totalSessions > 0 ? (data.totalAgentSessions / data.totalSessions) * 100 : 0

  // Build hourly stats
  const byHour: HourlyActivityStats[] = Array.from(data.hourlyMap.entries())
    .map(([hour, hourData]) => ({
      hour,
      sessionCount: hourData.sessionIds.size,
      messageCount: hourData.messageCount,
      tokenUsage: hourData.tokenUsage
    }))
    .sort((a, b) => a.hour - b.hour)

  // Build weekday stats
  const byWeekday: WeekdayActivityStats[] = Array.from(data.weekdayMap.entries())
    .map(([weekday, weekdayData]) => ({
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      sessionCount: weekdayData.sessionIds.size,
      messageCount: weekdayData.messageCount,
      tokenUsage: weekdayData.tokenUsage
    }))
    .sort((a, b) => a.weekday - b.weekday)

  const statistics: UsageStatistics = {
    overview: {
      tokenUsage: totalUsage,
      sessionCount: data.totalSessions,
      messageCount: data.totalMessages,
      dateRange: {
        start: startDate?.toISOString() || endDate.toISOString(),
        end: endDate.toISOString()
      }
    },
    daily,
    byProject,
    byModel,
    cache: {
      totalCacheCreation: data.totalCacheCreation,
      totalCacheRead: data.totalCacheRead,
      ephemeral5mTokens: data.ephemeral5mTokens,
      ephemeral1hTokens: data.ephemeral1hTokens,
      cacheHitRate: (data.totalCacheCreation + data.totalCacheRead) > 0
        ? (data.totalCacheRead / (data.totalCacheCreation + data.totalCacheRead)) * 100
        : 0,
      estimatedSavings: savedCost
    },
    cost: costBreakdown,
    productivity: {
      toolUsage,
      totalToolCalls,
      agentSessions: data.totalAgentSessions,
      totalSessions: data.totalSessions,
      agentUsageRate
    },
    trends: {
      byHour,
      byWeekday
    }
  }

  return statistics
}
