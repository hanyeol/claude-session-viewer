import type { TokenUsage, CostBreakdown, ModelPricing } from '../types.js'

/**
 * Generic token statistics utilities
 * Pure calculation functions
 */

/**
 * Extract token usage from a message object
 */
export function extractTokenUsage(message: any): { usage: TokenUsage; model: string } | null {
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

/**
 * Aggregate multiple token usages into a single total
 */
export function aggregateTokenUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + usage.inputTokens,
      cacheCreationTokens: acc.cacheCreationTokens + usage.cacheCreationTokens,
      cacheReadTokens: acc.cacheReadTokens + usage.cacheReadTokens,
      outputTokens: acc.outputTokens + usage.outputTokens,
      totalTokens: acc.totalTokens + usage.totalTokens
    }),
    createEmptyTokenUsage()
  )
}

/**
 * Calculate cost for token usage based on pricing
 */
export function calculateCost(usage: TokenUsage, pricing: ModelPricing): CostBreakdown {
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

/**
 * Create an empty token usage object
 */
export function createEmptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  }
}
