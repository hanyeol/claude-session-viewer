export interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  color?: string
}

export function StatCard({ title, value, subtitle, color = 'blue' }: StatCardProps) {
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
