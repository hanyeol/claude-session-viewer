import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

// Import shared components
import { BarSection, StatCard, formatNumber, formatCost } from './dashboard/index'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface TokenUsage {
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  totalTokens: number
}

interface DailyUsageStats {
  date: string
  tokenUsage: TokenUsage
  sessionCount: number
}

interface ProjectUsageStats {
  id: string
  name: string
  tokenUsage: TokenUsage
  sessionCount: number
}

interface ModelUsageStats {
  model: string
  tokenUsage: TokenUsage
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
  hour: number
  sessionCount: number
  messageCount: number
  tokenUsage: TokenUsage
}

interface WeekdayActivityStats {
  weekday: number
  weekdayName: string
  sessionCount: number
  messageCount: number
  tokenUsage: TokenUsage
}

interface TrendAnalysis {
  byHour: HourlyActivityStats[]
  byWeekday: WeekdayActivityStats[]
}

interface UsageStatistics {
  overview: {
    tokenUsage: TokenUsage
    sessionCount: number
    messageCount: number
    dateRange: {
      start: string
      end: string
    }
  }
  daily: DailyUsageStats[]
  byProject: ProjectUsageStats[]
  byModel: ModelUsageStats[]
  cache: CacheStats
  cost: CostBreakdown
  productivity: ProductivityStats
  trends: TrendAnalysis
}

type DateRange = '7' | '30' | 'all'

function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>('7')

  const { data, isLoading, error } = useQuery<UsageStatistics>({
    queryKey: ['usage-statistics', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/overall?days=${dateRange}`)
      if (!response.ok) throw new Error('Failed to fetch usage statistics')
      return response.json()
    },
  })

  // Skeleton component for loading state
  const SkeletonCard = () => (
    <div className="p-6 rounded-lg border bg-gray-800/50 border-gray-700 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-1/2 mb-3"></div>
      <div className="h-8 bg-gray-700 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-700 rounded w-1/3"></div>
    </div>
  )

  const SkeletonChart = () => (
    <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 animate-pulse">
      <div className="h-6 bg-gray-700 rounded w-1/3 mb-6"></div>
      <div className="h-64 bg-gray-700 rounded"></div>
    </div>
  )

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-red-400">Error loading statistics: {error.message}</div>
        </div>
      )
    }

    if (!data) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-400">No data available</div>
        </div>
      )
    }

    const { overview, daily, byProject, byModel, cache, cost, productivity, trends } = data

    // Calculate max for daily chart (using 95th percentile to avoid outliers)
    const sortedTokens = [...daily.map(d => d.tokenUsage.totalTokens)].sort((a, b) => a - b)
    const percentile95Index = Math.floor(sortedTokens.length * 0.95)
    const maxDailyTokens = Math.max(sortedTokens[percentile95Index] || 1, 1)

    // Calculate daily min/max/average
    const dailyTotals = daily.map(d => d.tokenUsage.totalTokens)
    const minDailyTokens = dailyTotals.length > 0 ? Math.min(...dailyTotals) : 0
    const maxDailyTokensActual = dailyTotals.length > 0 ? Math.max(...dailyTotals) : 0
    const avgDailyTokens = dailyTotals.length > 0 ? dailyTotals.reduce((sum, val) => sum + val, 0) / dailyTotals.length : 0

    return (
      <>
        {/* Date Range Display */}
        <p className="text-gray-400 mb-6">
          {format(new Date(overview.dateRange.start), 'MMM d, yyyy')} - {format(new Date(overview.dateRange.end), 'MMM d, yyyy')}
        </p>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Tokens"
            value={formatNumber(overview.tokenUsage.totalTokens)}
            subtitle={`${overview.sessionCount} sessions`}
            color="blue"
          />
          <StatCard
            title="Total Cost"
            value={formatCost(cost.totalCost)}
            subtitle="Estimated"
            color="green"
          />
          <StatCard
            title="Cache Hit Rate"
            value={`${cache.cacheHitRate.toFixed(1)}%`}
            subtitle={`Saved ${formatCost(cache.estimatedSavings)}`}
            color="purple"
          />
          <StatCard
            title="Messages"
            value={formatNumber(overview.messageCount)}
            subtitle={`${overview.sessionCount} sessions`}
            color="orange"
          />
        </div>

        {/* Token Breakdown */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Token Breakdown</h2>

          {/* Total Token Distribution */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-300">Total Token Distribution</h3>
              <span className="text-sm text-white font-semibold">{formatNumber(overview.tokenUsage.totalTokens)} tokens</span>
            </div>
            <div className="relative">
              <div className="h-8 w-full bg-gray-700 overflow-hidden flex">
              <BarSection
                label="Input"
                percentage={(overview.tokenUsage.inputTokens / overview.tokenUsage.totalTokens) * 100}
                color="bg-blue-500"
                title={`Input: ${formatNumber(overview.tokenUsage.inputTokens)}`}
              />
              <BarSection
                label="Output"
                percentage={(overview.tokenUsage.outputTokens / overview.tokenUsage.totalTokens) * 100}
                color="bg-green-500"
                title={`Output: ${formatNumber(overview.tokenUsage.outputTokens)}`}
              />
              <BarSection
                label="Cache Create"
                percentage={(overview.tokenUsage.cacheCreationTokens / overview.tokenUsage.totalTokens) * 100}
                color="bg-purple-500"
                title={`Cache Create: ${formatNumber(overview.tokenUsage.cacheCreationTokens)}`}
              />
              <BarSection
                label="Cache Read"
                percentage={(overview.tokenUsage.cacheReadTokens / overview.tokenUsage.totalTokens) * 100}
                color="bg-cyan-500"
                title={`Cache Read: ${formatNumber(overview.tokenUsage.cacheReadTokens)}`}
              />
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs justify-center flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded" />
                <span>Input ({formatNumber(overview.tokenUsage.inputTokens)})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded" />
                <span>Output ({formatNumber(overview.tokenUsage.outputTokens)})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded" />
                <span>Cache Create ({formatNumber(overview.tokenUsage.cacheCreationTokens)})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded" />
                <span>Cache Read ({formatNumber(overview.tokenUsage.cacheReadTokens)})</span>
              </div>
            </div>
          </div>

          {/* Cache Creation Breakdown */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-300">Cache Creation Breakdown</h3>
              <span className="text-sm text-white font-semibold">{formatNumber(cache.totalCacheCreation)} tokens</span>
            </div>
            <div className="relative">
              <div className="h-8 w-full bg-gray-700 overflow-hidden flex">
              <BarSection
                label="5-minute"
                percentage={cache.totalCacheCreation > 0 ? (cache.ephemeral5mTokens / cache.totalCacheCreation) * 100 : 0}
                color="bg-yellow-500"
                title={`5-minute: ${formatNumber(cache.ephemeral5mTokens)}`}
              />
              <BarSection
                label="1-hour"
                percentage={cache.totalCacheCreation > 0 ? (cache.ephemeral1hTokens / cache.totalCacheCreation) * 100 : 0}
                color="bg-orange-500"
                title={`1-hour: ${formatNumber(cache.ephemeral1hTokens)}`}
              />
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs justify-center flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded" />
                <span>5-minute ({formatNumber(cache.ephemeral5mTokens)})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-500 rounded" />
                <span>1-hour ({formatNumber(cache.ephemeral1hTokens)})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Cost Breakdown</h2>

          {/* Total Cost Distribution */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-300">Total Cost Distribution</h3>
              <span className="text-sm text-white font-semibold">{formatCost(cost.totalCost)}</span>
            </div>
            <div className="relative">
              <div className="h-8 w-full bg-gray-700 overflow-hidden flex">
              <BarSection
                label="Input"
                percentage={(cost.inputCost / cost.totalCost) * 100}
                color="bg-blue-500"
                title={`Input: ${formatCost(cost.inputCost)}`}
              />
              <BarSection
                label="Output"
                percentage={(cost.outputCost / cost.totalCost) * 100}
                color="bg-green-500"
                title={`Output: ${formatCost(cost.outputCost)}`}
              />
              <BarSection
                label="Cache Create"
                percentage={(cost.cacheCreationCost / cost.totalCost) * 100}
                color="bg-purple-500"
                title={`Cache Create: ${formatCost(cost.cacheCreationCost)}`}
              />
              <BarSection
                label="Cache Read"
                percentage={(cost.cacheReadCost / cost.totalCost) * 100}
                color="bg-cyan-500"
                title={`Cache Read: ${formatCost(cost.cacheReadCost)}`}
              />
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs justify-center flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded" />
                <span>Input ({formatCost(cost.inputCost)})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded" />
                <span>Output ({formatCost(cost.outputCost)})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded" />
                <span>Cache Create ({formatCost(cost.cacheCreationCost)})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded" />
                <span>Cache Read ({formatCost(cost.cacheReadCost)})</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded">
              <div className="text-sm text-gray-400">Estimated savings from cache</div>
              <div className="text-2xl font-bold text-green-400">{formatCost(cache.estimatedSavings)}</div>
            </div>
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded">
              <div className="text-sm text-gray-400">Cache Hit Rate</div>
              <div className="text-2xl font-bold text-purple-400">{cache.cacheHitRate.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Daily Usage Chart */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Daily Token Usage</h2>
          {daily.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p>No daily data available</p>
                <p className="text-sm text-gray-600 mt-2">Total sessions: {overview.sessionCount}</p>
                <p className="text-sm text-gray-600">Daily entries: {daily.length}</p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900/50 rounded p-4">
              <Bar
                data={{
                  labels: daily.map(day => format(new Date(day.date), 'MMM d')),
                  datasets: [
                    {
                      label: 'Input',
                      data: daily.map(d => d.tokenUsage.inputTokens),
                      backgroundColor: 'rgb(59, 130, 246)',
                      borderColor: 'rgb(59, 130, 246)',
                      borderWidth: 0,
                    },
                    {
                      label: 'Cache Create',
                      data: daily.map(d => d.tokenUsage.cacheCreationTokens),
                      backgroundColor: 'rgb(168, 85, 247)',
                      borderColor: 'rgb(168, 85, 247)',
                      borderWidth: 0,
                    },
                    {
                      label: 'Cache Read',
                      data: daily.map(d => d.tokenUsage.cacheReadTokens),
                      backgroundColor: 'rgb(6, 182, 212)',
                      borderColor: 'rgb(6, 182, 212)',
                      borderWidth: 0,
                    },
                    {
                      label: 'Output',
                      data: daily.map(d => d.tokenUsage.outputTokens),
                      backgroundColor: 'rgb(34, 197, 94)',
                      borderColor: 'rgb(34, 197, 94)',
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      stacked: true,
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                      },
                      ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 15,
                      },
                    },
                    y: {
                      stacked: true,
                      max: maxDailyTokens,
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                      },
                      ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        callback: function(value) {
                          if (typeof value === 'number') {
                            return formatNumber(value)
                          }
                          return value
                        },
                      },
                    },
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      callbacks: {
                        title: (items) => {
                          if (items.length > 0) {
                            const index = items[0].dataIndex
                            return format(new Date(daily[index].date), 'MMM d, yyyy')
                          }
                          return ''
                        },
                        label: (context) => {
                          const label = context.dataset.label || ''
                          const value = context.parsed.y !== null ? formatNumber(context.parsed.y) : '0'
                          return `${label}: ${value}`
                        },
                        footer: (items) => {
                          if (items.length > 0) {
                            const index = items[0].dataIndex
                            const total = formatNumber(daily[index].tokenUsage.totalTokens)
                            const sessions = daily[index].sessionCount
                            return `Total: ${total}\n${sessions} sessions`
                          }
                          return ''
                        },
                      },
                    },
                  },
                }}
                height={300}
              />
            </div>
          )}
          <div className="flex gap-4 mt-4 text-xs justify-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded" />
              <span>Input</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded" />
              <span>Cache Create</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-cyan-500 rounded" />
              <span>Cache Read</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span>Output</span>
            </div>
          </div>
          {daily.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-700">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Min Daily</div>
                <div className="font-mono text-sm text-gray-300">{formatNumber(minDailyTokens)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Avg Daily</div>
                <div className="font-mono text-sm text-blue-400">{formatNumber(avgDailyTokens)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Max Daily</div>
                <div className="font-mono text-sm text-green-400">{formatNumber(maxDailyTokensActual)}</div>
              </div>
            </div>
          )}
        </div>

        {/* By Project */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Usage by Project</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {byProject.slice(0, 10).map((project, index) => {
              const totalTokens = byProject.reduce((sum, p) => sum + p.tokenUsage.totalTokens, 0)
              const percentage = (project.tokenUsage.totalTokens / totalTokens) * 100

              return (
                <div key={index} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-baseline mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-200">{project.name}</div>
                      <div className="text-xs text-gray-500">{project.sessionCount} sessions</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="font-mono text-sm">{formatNumber(project.tokenUsage.totalTokens)}</div>
                      <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="text-left">
                      <div className="text-gray-500">Input</div>
                      <div className="text-blue-400 font-mono">{formatNumber(project.tokenUsage.inputTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Create</div>
                      <div className="text-purple-400 font-mono">{formatNumber(project.tokenUsage.cacheCreationTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Read</div>
                      <div className="text-cyan-400 font-mono">{formatNumber(project.tokenUsage.cacheReadTokens)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500">Output</div>
                      <div className="text-green-400 font-mono">{formatNumber(project.tokenUsage.outputTokens)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Model */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Usage by Model</h2>
          <div className="space-y-4">
            {byModel.map((model, index) => {
              const totalTokens = byModel.reduce((sum, m) => sum + m.tokenUsage.totalTokens, 0)
              const percentage = (model.tokenUsage.totalTokens / totalTokens) * 100

              return (
                <div key={index} className="border-b border-gray-700 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-200">{model.model}</div>
                      <div className="text-xs text-gray-500">{model.messageCount} messages</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{formatNumber(model.tokenUsage.totalTokens)}</div>
                      <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-green-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs mt-2">
                    <div className="text-left">
                      <div className="text-gray-500">Input</div>
                      <div className="text-blue-400 font-mono">{formatNumber(model.tokenUsage.inputTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Create</div>
                      <div className="text-purple-400 font-mono">{formatNumber(model.tokenUsage.cacheCreationTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Read</div>
                      <div className="text-cyan-400 font-mono">{formatNumber(model.tokenUsage.cacheReadTokens)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500">Output</div>
                      <div className="text-green-400 font-mono">{formatNumber(model.tokenUsage.outputTokens)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Productivity Metrics */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Productivity Metrics</h2>

          {/* Overview Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <StatCard
              title="Total Tool Calls"
              value={formatNumber(productivity.totalToolCalls)}
              subtitle={`Across ${overview.sessionCount} sessions`}
              color="blue"
            />
            <StatCard
              title="Agent Sessions"
              value={formatNumber(productivity.agentSessions)}
              subtitle={`${productivity.agentUsageRate.toFixed(1)}% of sessions`}
              color="purple"
            />
            <StatCard
              title="Avg Tools per Session"
              value={(productivity.totalToolCalls / productivity.totalSessions).toFixed(1)}
              subtitle="Tool calls per session"
              color="cyan"
            />
          </div>

          {/* Tool Usage Breakdown */}
          <h3 className="text-lg font-semibold mb-4 text-gray-300">Tool Usage & Success Rates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
            {productivity.toolUsage.map((tool, index) => (
              <div key={index} className="@container bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-200">{tool.toolName}</div>
                    <div className="text-xs text-gray-500">
                      <span className="hidden @[300px]:inline">{tool.successfulUses} successful / {tool.totalUses} total calls</span>
                      <span className="@[300px]:hidden">{tool.successfulUses} / {tool.totalUses} calls</span>
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <div className={`font-mono text-sm ${tool.successRate >= 90 ? 'text-green-400' : tool.successRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {tool.successRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">success</div>
                  </div>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${tool.successRate >= 90 ? 'bg-green-500' : tool.successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(tool.successRate, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cache Efficiency Deep Dive */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Cache Efficiency Analysis</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <StatCard
              title="Total Cache Created"
              value={formatNumber(cache.totalCacheCreation)}
              subtitle="Tokens cached"
              color="purple"
            />
            <StatCard
              title="Total Cache Read"
              value={formatNumber(cache.totalCacheRead)}
              subtitle="Tokens from cache"
              color="cyan"
            />
            <StatCard
              title="Cache Hit Rate"
              value={`${cache.cacheHitRate.toFixed(2)}%`}
              subtitle={`${formatCost(cache.estimatedSavings)} saved`}
              color="green"
            />
          </div>
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded">
              <div className="text-sm text-gray-400 mb-2">5-minute Cache</div>
              <div className="text-2xl font-bold mb-1">{formatNumber(cache.ephemeral5mTokens)}</div>
              <div className="text-xs text-gray-500">
                {cache.totalCacheCreation > 0 ? ((cache.ephemeral5mTokens / cache.totalCacheCreation) * 100).toFixed(1) : 0}% of total cache
              </div>
            </div>
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded">
              <div className="text-sm text-gray-400 mb-2">1-hour Cache</div>
              <div className="text-2xl font-bold mb-1">{formatNumber(cache.ephemeral1hTokens)}</div>
              <div className="text-xs text-gray-500">
                {cache.totalCacheCreation > 0 ? ((cache.ephemeral1hTokens / cache.totalCacheCreation) * 100).toFixed(1) : 0}% of total cache
              </div>
            </div>
          </div>
        </div>

        {/* Activity Trends */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Activity Trends</h2>

          {/* Hourly Activity */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-gray-300">Activity by Hour of Day</h3>
            <div className="bg-gray-900/50 rounded p-4">
              <Bar
                data={{
                  labels: trends.byHour.map(h => `${h.hour.toString().padStart(2, '0')}:00`),
                  datasets: [
                    {
                      label: 'Messages',
                      data: trends.byHour.map(h => h.messageCount),
                      backgroundColor: 'rgba(59, 130, 246, 0.8)',
                      borderColor: 'rgb(59, 130, 246)',
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                      },
                      ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        maxRotation: 45,
                        minRotation: 45,
                      },
                    },
                    y: {
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                      },
                      ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                      },
                    },
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const hourData = trends.byHour[context.dataIndex]
                          return [
                            `Messages: ${hourData.messageCount}`,
                            `Sessions: ${hourData.sessionCount}`,
                            `Tokens: ${formatNumber(hourData.tokenUsage.totalTokens)}`,
                          ]
                        },
                      },
                    },
                  },
                }}
                height={250}
              />
            </div>
          </div>

          {/* Weekday Activity */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-300">Activity by Day of Week</h3>
            <div className="bg-gray-900/50 rounded p-4">
              <Bar
                data={{
                  labels: trends.byWeekday.map(w => w.weekdayName),
                  datasets: [
                    {
                      label: 'Messages',
                      data: trends.byWeekday.map(w => w.messageCount),
                      backgroundColor: 'rgba(34, 197, 94, 0.8)',
                      borderColor: 'rgb(34, 197, 94)',
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                      },
                      ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                      },
                    },
                    y: {
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                      },
                      ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                      },
                    },
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const weekdayData = trends.byWeekday[context.dataIndex]
                          return [
                            `Messages: ${weekdayData.messageCount}`,
                            `Sessions: ${weekdayData.sessionCount}`,
                            `Tokens: ${formatNumber(weekdayData.tokenUsage.totalTokens)}`,
                          ]
                        },
                      },
                    },
                  },
                }}
                height={250}
              />
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header - Always visible */}
        <div className="mb-2">
          <div className="flex items-start justify-between mb-2">
            <h1 className="text-4xl font-bold">Dashboard</h1>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setDateRange('7')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === '7'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setDateRange('30')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === '30'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                Last 30 Days
              </button>
              <button
                onClick={() => setDateRange('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                All Time
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {isLoading ? (
          <>
            {/* Loading Skeleton */}
            {/* Date Range Skeleton */}
            <div className="h-5 bg-gray-700 rounded w-64 mb-8 animate-pulse"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonChart />
            <div className="mt-8">
              <SkeletonChart />
            </div>
            <div className="mt-8">
              <SkeletonChart />
            </div>
          </>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  )
}

export default Dashboard
