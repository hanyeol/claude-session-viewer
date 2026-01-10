/**
 * Session filtering rules
 * Business logic for determining which sessions to include/exclude
 */

/**
 * Check if a session should be skipped
 * Rule: Sessions with only 1 assistant message are skipped
 */
export function shouldSkipSession(messages: any[]): boolean {
  return messages.length === 1 && messages[0].type === 'assistant'
}

/**
 * Check if a session ID represents an agent session
 */
export function isAgentSession(sessionId: string): boolean {
  return sessionId.startsWith('agent-')
}

/**
 * Check if a file is empty
 */
export function isEmptyFile(fileSize: number): boolean {
  return fileSize === 0
}
