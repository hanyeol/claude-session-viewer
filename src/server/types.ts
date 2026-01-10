// Session data model
export interface Session {
  id: string
  project: string
  timestamp: string
  messages: any[]
  messageCount: number
  title?: string
  isAgent?: boolean
  agentSessions?: Session[]
}

export interface ProjectGroup {
  name: string
  displayName: string
  sessionCount: number
  lastActivity: string
  sessions: Session[]
}

// Token statistics types
export interface TokenUsage {
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  totalTokens: number
}

export interface DailyTokenStats {
  date: string
  usage: TokenUsage
  sessionCount: number
}

export interface ProjectTokenStats {
  project: string
  displayName: string
  usage: TokenUsage
  sessionCount: number
}

export interface ModelTokenStats {
  model: string
  usage: TokenUsage
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
  usage: TokenUsage
}

export interface WeekdayActivityStats {
  weekday: number // 0 = Sunday, 6 = Saturday
  weekdayName: string
  sessionCount: number
  messageCount: number
  usage: TokenUsage
}

export interface TrendAnalysis {
  byHour: HourlyActivityStats[]
  byWeekday: WeekdayActivityStats[]
}

export interface TokenStatistics {
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

// Pricing model interface
export interface ModelPricing {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

export type PricingMap = Record<string, ModelPricing>
