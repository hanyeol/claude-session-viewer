/**
 * Generic text utilities
 * Pure functions with no project-specific logic
 */

/**
 * Remove XML-like tags from text
 */
export function removeTags(text: string, tags: string[]): string {
  let result = text
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')
    result = result.replace(regex, ' ')
  }
  return result
}

/**
 * Normalize whitespace in text
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Clean text by removing common IDE/system tags
 */
export function cleanText(text: string): string {
  const cleaned = removeTags(text, ['ide_selection', 'ide_opened_file', 'system-reminder'])
  return normalizeWhitespace(cleaned)
}

/**
 * Truncate text to maximum length
 */
export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) : text
}
