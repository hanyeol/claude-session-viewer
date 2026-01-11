import { useRef, useState, useEffect } from 'react'

// Utility function to measure text width
function getTextWidth(text: string, font: string = '12px sans-serif'): number {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return 0
  context.font = font
  const metrics = context.measureText(text)
  return metrics.width
}

export interface BarSectionProps {
  label: string
  percentage: number
  color: string
  title: string
  containerRef?: React.RefObject<HTMLDivElement>
}

export function BarSection({ label, percentage, color, title }: BarSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [showLabel, setShowLabel] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  useEffect(() => {
    const updateLabelVisibility = () => {
      if (sectionRef.current) {
        const sectionWidth = sectionRef.current.offsetWidth
        // Use font matching text-xs font-semibold (approximately 12px bold)
        const textWidth = getTextWidth(label, 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')
        // Add some padding (8px total for both sides)
        setShowLabel(sectionWidth >= textWidth + 8)
      }
    }

    // Initial calculation
    updateLabelVisibility()

    // Update on window resize
    window.addEventListener('resize', updateLabelVisibility)

    // Use ResizeObserver for more accurate detection
    const resizeObserver = new ResizeObserver(updateLabelVisibility)
    if (sectionRef.current) {
      resizeObserver.observe(sectionRef.current)
    }

    return () => {
      window.removeEventListener('resize', updateLabelVisibility)
      resizeObserver.disconnect()
    }
  }, [label, percentage])

  return (
    <>
      <div
        ref={sectionRef}
        className={`${color} flex items-center justify-center text-xs font-semibold transition-all`}
        style={{ width: `${percentage}%`, minWidth: '2px' }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {showLabel && <span className="text-white">{label}</span>}
      </div>

      {/* Custom Tooltip - positioned outside the bar */}
      {showTooltip && sectionRef.current && (
        <div
          className="fixed px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg border border-gray-700 whitespace-nowrap z-50 pointer-events-none"
          style={{
            left: `${sectionRef.current.getBoundingClientRect().left + sectionRef.current.getBoundingClientRect().width / 2}px`,
            top: `${sectionRef.current.getBoundingClientRect().top - 10}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {title}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </>
  )
}
