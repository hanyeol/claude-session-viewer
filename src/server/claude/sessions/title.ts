import { cleanText } from '../../utils/text.js'
import { MAX_TITLE_LENGTH } from '../../constants.js'

/**
 * Session title extraction rules
 * Business logic for extracting meaningful titles from session messages
 */

/**
 * Extract first text content from message content (array or string)
 */
function extractFirstText(content: any): string | null {
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'text' && item.text) {
        const cleaned = cleanText(item.text)
        if (cleaned) return cleaned
      }
    }
    return null
  }

  if (typeof content === 'string') {
    const cleaned = cleanText(content)
    return cleaned || null
  }

  return null
}

/**
 * Extract session title from messages
 * Priority 1: queue-operation / enqueue message
 * Priority 2: first user message
 */
export function extractSessionTitle(messages: any[]): string {
  // Priority 1: queue-operation / enqueue message
  for (const msg of messages) {
    if (msg.type === 'queue-operation' && msg.operation === 'enqueue' && msg.content) {
      const firstText = extractFirstText(msg.content)
      if (firstText) {
        return firstText.substring(0, MAX_TITLE_LENGTH).trim()
      }
    }
  }

  // Priority 2: first user message
  for (const msg of messages) {
    if (msg.type === 'user' && msg.message?.content) {
      const firstText = extractFirstText(msg.message.content)
      if (firstText) {
        return firstText.substring(0, MAX_TITLE_LENGTH).trim()
      }
    }
  }

  return 'Untitled Session'
}
