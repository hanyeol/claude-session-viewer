import type { DailyUsageStats, TokenUsage } from '../types.js'
import { createEmptyTokenUsage } from './tokenUsage.js'

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
 * Fill in missing dates in daily statistics with zero values
 * @param dailyMap Map of date string to usage data
 * @param startDate Start date for the range (inclusive)
 * @param endDate End date for the range (inclusive)
 * @returns Array of daily stats with all dates filled in
 */
export function fillMissingDates(
  dailyMap: Map<string, { tokenUsage: TokenUsage; sessionIds: Set<string> }>,
  startDate: Date,
  endDate: Date
): DailyUsageStats[] {
  const daily: DailyUsageStats[] = []

  const currentDate = new Date(startDate)
  const end = new Date(endDate)

  while (currentDate <= end) {
    const dateKey = formatDateLocal(currentDate)
    const data = dailyMap.get(dateKey)

    daily.push({
      date: dateKey,
      tokenUsage: data?.tokenUsage || createEmptyTokenUsage(),
      sessionCount: data?.sessionIds.size || 0
    })

    currentDate.setDate(currentDate.getDate() + 1)
  }

  return daily
}
