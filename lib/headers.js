import abstractLogging from 'abstract-logging'

/**
 * Checks if a specific header exists in the raw headers array
 *
 * @param {Array<string>} rawHeaders - Raw headers array
 * @param {string} headerName - Header name to check for
 * @returns {boolean} True if header exists, false otherwise
 */

export function hasHeader (rawHeaders, headerName) {
  const lowerHeaderName = headerName.toLowerCase()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const currentHeader = String(rawHeaders[i]).toLowerCase()
    if (currentHeader === lowerHeaderName) {
      return true
    }
  }
  return false
}
