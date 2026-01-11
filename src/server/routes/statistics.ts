import type { FastifyInstance } from 'fastify'
import { stat } from 'fs/promises'
import { join } from 'path'
import { CLAUDE_DIR } from '../constants.js'
import { getOverallStatistics, getProjectStatistics } from '../statistics/service.js'

/**
 * Statistics routes
 */
export async function registerStatisticsRoutes(server: FastifyInstance) {
  /**
   * GET /api/statistics/overall
   * Get overall usage statistics across all projects
   */
  server.get<{ Querystring: { days?: string } }>('/api/statistics/overall', async (request, reply) => {
    try {
      const days = request.query.days || '7'
      const statistics = await getOverallStatistics(days)
      return statistics
    } catch (error) {
      console.error('Error calculating overall statistics:', error)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * GET /api/statistics/projects/:projectId
   * Get usage statistics for a specific project
   */
  server.get<{ Params: { projectId: string }; Querystring: { days?: string } }>('/api/statistics/projects/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params
      const projectsDir = join(CLAUDE_DIR, 'projects')
      const projectPath = join(projectsDir, projectId)

      // Check if project exists
      try {
        const projectStat = await stat(projectPath)
        if (!projectStat.isDirectory()) {
          return reply.code(404).send({ error: 'Project not found' })
        }
      } catch (error) {
        return reply.code(404).send({ error: 'Project not found' })
      }

      const days = request.query.days || '7'
      const statistics = await getProjectStatistics(projectId, days)
      return statistics
    } catch (error) {
      console.error('Error calculating project statistics:', error)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })
}
