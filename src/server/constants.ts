import { homedir } from 'os'
import { join } from 'path'

/**
 * Project-specific constants
 */

// Directory paths
export const CLAUDE_DIR = join(homedir(), '.claude')

// Server configuration
export const DEFAULT_PORT = 9090

// Session configuration
export const MAX_TITLE_LENGTH = 100
