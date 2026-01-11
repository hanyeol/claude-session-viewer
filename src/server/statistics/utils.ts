import type { DailyUsageStats, TokenUsage } from '../types.js'
import { createEmptyTokenUsage } from './tokenUsage.js'

/**
 * Fill in missing dates in daily statistics with zero values
 * @param dailyMap Map of date string to usage data
 * @param cutoffDate User-specified start date for the range (e.g., last 7/30/90 days)
 * @param minDate Earliest date in actual data (= All time start)
 * @param maxDate Latest date in actual data
 * @returns Array of daily stats with all dates filled in
 */
export function fillMissingDates(
  dailyMap: Map<string, { tokenUsage: TokenUsage; sessionIds: Set<string> }>,
  cutoffDate: Date,
  minDate: Date | null,
  maxDate: Date | null
): DailyUsageStats[] {
  const daily: DailyUsageStats[] = []

  // Always start from cutoffDate (7/30/90 days ago)
  const startDate = new Date(cutoffDate)

  // Always end at today (or maxDate if it's in the future, which happens with wrong system time)
  const today = new Date()
  const endDate = maxDate && maxDate > today ? new Date(maxDate) : new Date(today)
  endDate.setHours(23, 59, 59, 999)

  const currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0]
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
