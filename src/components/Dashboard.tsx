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
  hour: number
  sessionCount: number
  messageCount: number
  usage: TokenUsage
}

interface WeekdayActivityStats {
  weekday: number
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

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`
  }
  return num.toLocaleString()
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`
}

function StatCard({ title, value, subtitle, color = 'blue' }: { title: string; value: string; subtitle?: string; color?: string }) {
  const colorClasses = {
    blue: 'bg-blue-500/10 border-blue-500/20',
    green: 'bg-green-500/10 border-green-500/20',
    purple: 'bg-purple-500/10 border-purple-500/20',
    orange: 'bg-orange-500/10 border-orange-500/20',
    pink: 'bg-pink-500/10 border-pink-500/20',
    cyan: 'bg-cyan-500/10 border-cyan-500/20'
  }

  return (
    <div className={`p-6 rounded-lg border ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}>
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  )
}

function ProgressBar({ label, value, max, color = 'blue' }: { label: string; value: number; max: number; color?: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
    cyan: 'bg-cyan-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{formatNumber(value)} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}

type DateRange = '7' | '30' | 'all'

function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>('7')

  const { data, isLoading, error } = useQuery<TokenStatistics>({
    queryKey: ['token-statistics', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/tokens?days=${dateRange}`)
      if (!response.ok) throw new Error('Failed to fetch token statistics')
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
    const sortedTokens = [...daily.map(d => d.usage.totalTokens)].sort((a, b) => a - b)
    const percentile95Index = Math.floor(sortedTokens.length * 0.95)
    const maxDailyTokens = Math.max(sortedTokens[percentile95Index] || 1, 1)

    // Calculate daily min/max/average
    const dailyTotals = daily.map(d => d.usage.totalTokens)
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
            value={formatNumber(overview.total.totalTokens)}
            subtitle={`${overview.totalSessions} sessions`}
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
            value={formatNumber(overview.totalMessages)}
            subtitle={`${overview.totalSessions} sessions`}
            color="orange"
          />
        </div>

        {/* Token Breakdown */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Token Breakdown</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-300">Input & Output Tokens</h3>
              <ProgressBar
                label="Regular Input"
                value={overview.total.inputTokens}
                max={overview.total.totalTokens}
                color="blue"
              />
              <ProgressBar
                label="Output Tokens"
                value={overview.total.outputTokens}
                max={overview.total.totalTokens}
                color="green"
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-300">Cache Details</h3>
              <ProgressBar
                label="Cache Creation"
                value={overview.total.cacheCreationTokens}
                max={overview.total.totalTokens}
                color="purple"
              />
              <ProgressBar
                label="Cache Read"
                value={overview.total.cacheReadTokens}
                max={overview.total.totalTokens}
                color="cyan"
              />
              <ProgressBar
                label="5-minute Cache"
                value={cache.ephemeral5mTokens}
                max={cache.totalCacheCreation}
                color="yellow"
              />
              <ProgressBar
                label="1-hour Cache"
                value={cache.ephemeral1hTokens}
                max={cache.totalCacheCreation}
                color="orange"
              />
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Cost Breakdown</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <ProgressBar
                label="Input Cost"
                value={cost.inputCost}
                max={cost.totalCost}
                color="blue"
              />
              <ProgressBar
                label="Output Cost"
                value={cost.outputCost}
                max={cost.totalCost}
                color="green"
              />
            </div>
            <div>
              <ProgressBar
                label="Cache Creation Cost"
                value={cost.cacheCreationCost}
                max={cost.totalCost}
                color="purple"
              />
              <ProgressBar
                label="Cache Read Cost"
                value={cost.cacheReadCost}
                max={cost.totalCost}
                color="cyan"
              />
            </div>
          </div>
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded">
            <div className="text-sm text-gray-400">Estimated savings from cache</div>
            <div className="text-2xl font-bold text-green-400">{formatCost(cache.estimatedSavings)}</div>
          </div>
        </div>

        {/* Daily Usage Chart */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Daily Token Usage</h2>
          {daily.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p>No daily data available</p>
                <p className="text-sm text-gray-600 mt-2">Total sessions: {overview.totalSessions}</p>
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
                      data: daily.map(d => d.usage.inputTokens),
                      backgroundColor: 'rgb(59, 130, 246)',
                      borderColor: 'rgb(59, 130, 246)',
                      borderWidth: 0,
                    },
                    {
                      label: 'Cache Create',
                      data: daily.map(d => d.usage.cacheCreationTokens),
                      backgroundColor: 'rgb(168, 85, 247)',
                      borderColor: 'rgb(168, 85, 247)',
                      borderWidth: 0,
                    },
                    {
                      label: 'Cache Read',
                      data: daily.map(d => d.usage.cacheReadTokens),
                      backgroundColor: 'rgb(6, 182, 212)',
                      borderColor: 'rgb(6, 182, 212)',
                      borderWidth: 0,
                    },
                    {
                      label: 'Output',
                      data: daily.map(d => d.usage.outputTokens),
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
                            const total = formatNumber(daily[index].usage.totalTokens)
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
              const totalTokens = byProject.reduce((sum, p) => sum + p.usage.totalTokens, 0)
              const percentage = (project.usage.totalTokens / totalTokens) * 100

              return (
                <div key={index} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-baseline mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-200">{project.displayName}</div>
                      <div className="text-xs text-gray-500">{project.sessionCount} sessions</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="font-mono text-sm">{formatNumber(project.usage.totalTokens)}</div>
                      <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="text-left">
                      <div className="text-gray-500">Input</div>
                      <div className="text-blue-400 font-mono">{formatNumber(project.usage.inputTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Create</div>
                      <div className="text-purple-400 font-mono">{formatNumber(project.usage.cacheCreationTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Read</div>
                      <div className="text-cyan-400 font-mono">{formatNumber(project.usage.cacheReadTokens)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500">Output</div>
                      <div className="text-green-400 font-mono">{formatNumber(project.usage.outputTokens)}</div>
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
              const totalTokens = byModel.reduce((sum, m) => sum + m.usage.totalTokens, 0)
              const percentage = (model.usage.totalTokens / totalTokens) * 100

              return (
                <div key={index} className="border-b border-gray-700 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-200">{model.model}</div>
                      <div className="text-xs text-gray-500">{model.messageCount} messages</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{formatNumber(model.usage.totalTokens)}</div>
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
                      <div className="text-blue-400 font-mono">{formatNumber(model.usage.inputTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Create</div>
                      <div className="text-purple-400 font-mono">{formatNumber(model.usage.cacheCreationTokens)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Cache Read</div>
                      <div className="text-cyan-400 font-mono">{formatNumber(model.usage.cacheReadTokens)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500">Output</div>
                      <div className="text-green-400 font-mono">{formatNumber(model.usage.outputTokens)}</div>
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
              subtitle={`Across ${overview.totalSessions} sessions`}
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
                            `Tokens: ${formatNumber(hourData.usage.totalTokens)}`,
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
                            `Tokens: ${formatNumber(weekdayData.usage.totalTokens)}`,
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
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold">Dashboard</h1>
            <div className="flex gap-2">
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
