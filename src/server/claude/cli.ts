import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface ClaudeCliOptions {
  cwd: string
  prompt: string
  sessionId?: string
  outputFormat?: 'json' | 'stream-json'
  timeout?: number
}

export interface ClaudeCliResult {
  success: boolean
  output?: any
  error?: string
}

/**
 * Execute Claude CLI in headless mode
 */
export async function executeClaudeCli(options: ClaudeCliOptions): Promise<ClaudeCliResult> {
  const { cwd, prompt, sessionId, outputFormat = 'json', timeout = 120000 } = options

  // Escape prompt for shell
  const escapedPrompt = prompt.replace(/"/g, '\\"')

  // Build command with optional session ID
  let command = `claude -p "${escapedPrompt}" --output-format ${outputFormat}`
  if (sessionId) {
    command += ` --session-id ${sessionId}`
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    })

    if (stderr && !stdout) {
      return {
        success: false,
        error: stderr
      }
    }

    // Parse JSON output
    if (outputFormat === 'json') {
      try {
        const output = JSON.parse(stdout)
        return {
          success: true,
          output
        }
      } catch (parseError) {
        return {
          success: false,
          error: `Failed to parse JSON output: ${parseError}`
        }
      }
    }

    // Return raw output for stream-json
    return {
      success: true,
      output: stdout
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error executing Claude CLI'
    }
  }
}
