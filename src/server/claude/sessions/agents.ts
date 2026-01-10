import type { Session } from '../../types.js'

/**
 * Agent session mapping logic
 * Handles the relationship between parent sessions and agent (Task) sessions
 */

/**
 * Collect agent session IDs and their descriptions from Task tool uses
 */
export function collectAgentDescriptions(messages: any[]): Map<string, string> {
  const agentDescriptions = new Map<string, string>()
  const toolUseDescriptions = new Map<string, string>()
  const toolResultAgentIds = new Map<string, string>()

  // First pass: collect Task tool uses and their descriptions
  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
      for (const item of msg.message.content) {
        if (item.type === 'tool_use' && item.name === 'Task' && item.input?.description) {
          toolUseDescriptions.set(item.id, item.input.description)
        }
      }
    }

    // Collect agent IDs from tool results
    const agentId = msg.agentId || msg.toolUseResult?.agentId
    if (agentId && msg.message?.content && Array.isArray(msg.message.content)) {
      for (const item of msg.message.content) {
        if (item.type === 'tool_result' && item.tool_use_id) {
          toolResultAgentIds.set(item.tool_use_id, agentId)
        }
      }
    }
  }

  // Second pass: map tool uses to agent IDs
  for (const [toolUseId, description] of toolUseDescriptions.entries()) {
    const agentId = toolResultAgentIds.get(toolUseId)
    if (agentId) {
      agentDescriptions.set(`agent-${agentId}`, description)
    }
  }

  return agentDescriptions
}

/**
 * Attach agent sessions to a parent session
 */
export function attachAgentSessionsToParent(
  session: Session,
  agentDescriptions: Map<string, string>,
  agentSessionsMap: Map<string, Session>
): void {
  if (agentDescriptions.size === 0) return

  session.agentSessions = []
  for (const [agentSessionId, description] of agentDescriptions) {
    const agentSession = agentSessionsMap.get(agentSessionId)
    if (agentSession) {
      agentSession.title = description
      session.agentSessions.push(agentSession)
    }
  }

  // Sort by timestamp (chronological order)
  session.agentSessions.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

/**
 * Find agent title from parent session messages
 */
export function findAgentTitleFromParentMessages(messages: any[], agentId: string): string | null {
  const agentDescriptions = collectAgentDescriptions(messages)
  return agentDescriptions.get(`agent-${agentId}`) || null
}

/**
 * Inject agentId into Task tool_use content for display
 */
export function injectAgentIdsIntoMessages(messages: any[]): any[] {
  const toolUseToAgentId = new Map<string, string>()

  // Build mapping from tool_use_id to agentId
  for (const msg of messages) {
    const agentId = msg.agentId || msg.toolUseResult?.agentId
    const content = msg.message?.content
    if (!agentId || !Array.isArray(content)) continue

    for (const item of content) {
      if (item.type === 'tool_result' && item.tool_use_id) {
        toolUseToAgentId.set(item.tool_use_id, agentId)
      }
    }
  }

  // Inject agentId into tool_use items
  return messages.map((msg) => {
    const content = msg.message?.content
    if (!Array.isArray(content)) return msg

    const updatedContent = content.map((item: any) => {
      if (item.type !== 'tool_use' || item.name !== 'Task' || !item.id) return item
      const agentId = toolUseToAgentId.get(item.id)
      return agentId ? { ...item, agentId } : item
    })

    return {
      ...msg,
      message: {
        ...msg.message,
        content: updatedContent
      }
    }
  })
}
