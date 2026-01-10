import type { PricingMap } from '../types.js'

/**
 * Claude API configuration
 * Model pricing and related settings
 */

// Claude API Pricing (as of January 2025)
// Prices per 1M tokens
export const PRICING: PricingMap = {
  'claude-sonnet-4-5-20250929': {
    input: 3.0,
    output: 15.0,
    cacheCreation: 3.75,
    cacheRead: 0.30
  },
  'claude-sonnet-4-20250514': {
    input: 3.0,
    output: 15.0,
    cacheCreation: 3.75,
    cacheRead: 0.30
  },
  'claude-opus-4-20250514': {
    input: 15.0,
    output: 75.0,
    cacheCreation: 18.75,
    cacheRead: 1.50
  },
  'claude-haiku-4-20250515': {
    input: 0.80,
    output: 4.0,
    cacheCreation: 1.0,
    cacheRead: 0.08
  }
}

// Default pricing model
export const DEFAULT_PRICING_MODEL = 'claude-sonnet-4-5-20250929'

// Weekday names for statistics
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
