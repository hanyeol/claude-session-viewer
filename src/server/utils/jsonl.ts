import { readFile } from 'fs/promises'

/**
 * Pure JSONL parser
 * No session-specific logic, just file parsing
 */
export async function parseJsonl(filePath: string): Promise<any[]> {
  const content = await readFile(filePath, 'utf-8')
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
}
