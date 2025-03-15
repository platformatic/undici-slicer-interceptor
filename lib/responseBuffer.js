/**
 * Class to buffer response chunks and parse the body as JSON
 */
export class ResponseBuffer {
  /**
   * Creates a new ResponseBuffer instance
   */
  constructor() {
    this.chunks = []
    this.totalSize = 0
  }
  
  /**
   * Adds a chunk to the buffer
   * 
   * @param {Buffer|string} chunk - Response data chunk
   */
  addChunk(chunk) {
    if (chunk) {
      this.chunks.push(chunk)
      this.totalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk)
    }
  }
  
  /**
   * Gets the complete response body as a string
   * 
   * @returns {string} The complete response body
   */
  getBody() {
    // Combine all chunks into a single Buffer
    const buffer = Buffer.concat(this.chunks, this.totalSize)
    
    // Convert the Buffer to a string
    return buffer.toString('utf8')
  }
  
  /**
   * Attempts to parse the response body as JSON
   * 
   * @returns {Object|Array|null} Parsed JSON object/array or null if parsing fails
   */
  getBodyAsJson() {
    try {
      const bodyString = this.getBody()
      return JSON.parse(bodyString)
    } catch (error) {
      // If parsing fails, return null
      return null
    }
  }
  
  /**
   * Clears the buffer
   */
  clear() {
    this.chunks = []
    this.totalSize = 0
  }
}
