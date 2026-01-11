// Session data model
export interface Session {
  id: string
  projectId: string
  projectName?: string
  timestamp: string
  messages: any[]
  messageCount: number
  title?: string
  isAgent?: boolean
  agentSessions?: Session[]
}

export interface ProjectGroup {
  id: string
  name: string
  sessionCount: number
  lastActivity: string
  sessions: Session[]
}

// Usage statistics types
export interface TokenUsage {
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  totalTokens: number
}

export interface DailyUsageStats {
  date: string
  tokenUsage: TokenUsage
  sessionCount: number
}

export interface ProjectUsageStats {
  id: string
  name: string
  tokenUsage: TokenUsage
  sessionCount: number
}

export interface ModelUsageStats {
  model: string
  tokenUsage: TokenUsage
  messageCount: number
}

export interface CacheStats {
  totalCacheCreation: number
  totalCacheRead: number
  ephemeral5mTokens: number
  ephemeral1hTokens: number
  cacheHitRate: number
  estimatedSavings: number
}

export interface CostBreakdown {
  inputCost: number
  outputCost: number
  cacheCreationCost: number
  cacheReadCost: number
  totalCost: number
}

export interface ToolUsageStats {
  toolName: string
  totalUses: number
  successfulUses: number
  successRate: number
}

export interface ProductivityStats {
  toolUsage: ToolUsageStats[]
  totalToolCalls: number
  agentSessions: number
  totalSessions: number
  agentUsageRate: number
}

export interface HourlyActivityStats {
  hour: number // 0-23
  sessionCount: number
  messageCount: number
  tokenUsage: TokenUsage
}

export interface WeekdayActivityStats {
  weekday: number // 0 = Sunday, 6 = Saturday
  weekdayName: string
  sessionCount: number
  messageCount: number
  tokenUsage: TokenUsage
}

export interface TrendAnalysis {
  byHour: HourlyActivityStats[]
  byWeekday: WeekdayActivityStats[]
}

export interface UsageStatistics {
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

// Pricing model interface
export interface ModelPricing {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

export type PricingMap = Record<string, ModelPricing>
