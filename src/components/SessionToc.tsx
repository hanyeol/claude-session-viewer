import { useEffect, useState, useRef } from 'react'

interface TocItem {
  id: string
  type: string
  text: string
  toolUses: Array<{ name: string; type: 'tool_use' | 'tool_result' }>
  timestamp?: string
}

interface SessionTocProps {
  messages: any[]
  activeId: string | null
  onNavigate: (id: string) => void
}

export default function SessionToc({ messages, activeId, onNavigate }: SessionTocProps) {
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isManualScrollingRef = useRef(false)

  useEffect(() => {
    const items: TocItem[] = messages.map((message, index) => {
      const id = `message-${index}`
      let text = ''
      const toolUses: Array<{ name: string; type: 'tool_use' | 'tool_result' }> = []

      // Extract text and tool uses from message
      if (message.message?.content && Array.isArray(message.message.content)) {
        const textContent = message.message.content.find((c: any) => c.type === 'text')
        if (textContent) {
          text = textContent.text.slice(0, 50) + (textContent.text.length > 50 ? '...' : '')
        }

        // Collect tool uses and tool results
        message.message.content.forEach((c: any) => {
          if (c.type === 'tool_use') {
            toolUses.push({ name: c.name, type: 'tool_use' })
          } else if (c.type === 'tool_result') {
            toolUses.push({ name: 'Tool Result', type: 'tool_result' })
          }
        })
      }

      return {
        id,
        type: message.type || 'system',
        text: text, // Only show actual text content, not generic messages
        toolUses,
        timestamp: message.timestamp
      }
    })

    setTocItems(items)
  }, [messages])

  // Auto-scroll active item into view
  useEffect(() => {
    // Don't auto-scroll if user is manually scrolling
    if (isManualScrollingRef.current) return

    if (activeItemRef.current && containerRef.current) {
      const container = containerRef.current
      const activeItem = activeItemRef.current

      const containerRect = container.getBoundingClientRect()
      const itemRect = activeItem.getBoundingClientRect()

      // Check if item is not fully visible
      if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [activeId])

  const handleItemClick = (id: string) => {
    // Set manual scrolling flag
    isManualScrollingRef.current = true
    onNavigate(id)

    // Reset flag after scrolling completes (smooth scroll takes ~500-1000ms)
    setTimeout(() => {
      isManualScrollingRef.current = false
    }, 1500)
  }

  return (
    <div ref={containerRef} className="w-full border-l border-gray-700 bg-gray-800 overflow-y-auto h-full">
      <div className="p-4 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
        <h3 className="text-sm font-semibold text-gray-300">Table of Contents</h3>
        <p className="text-xs text-gray-500 mt-1">{tocItems.length} messages</p>
      </div>

      <nav className="p-2">
        {tocItems.map((item, index) => (
          <div key={item.id} className="mb-1">
            <button
              ref={activeId === item.id ? activeItemRef : null}
              onClick={() => handleItemClick(item.id)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                activeId === item.id
                  ? 'bg-blue-900/50 text-blue-200 border-l-2 border-blue-400'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                    item.type === 'user'
                      ? 'bg-blue-900/50 text-blue-300'
                      : item.type === 'assistant'
                      ? 'bg-green-900/50 text-green-300'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {item.type}
                </span>
                <span className="text-gray-500">#{index + 1}</span>
              </div>
              {item.text && (
                <div className="text-gray-300 line-clamp-2 leading-tight">
                  {item.text}
                </div>
              )}
              {item.toolUses.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.toolUses.map((tool, idx) => (
                    <span
                      key={idx}
                      className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${
                        tool.type === 'tool_result'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-yellow-900/30 text-yellow-400'
                      }`}
                    >
                      {tool.type === 'tool_result' ? '✓' : '🔧'} {tool.name}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </div>
        ))}
      </nav>
    </div>
  )
}
