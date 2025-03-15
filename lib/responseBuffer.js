import { BufferList } from 'bl'

/**
 * Class to buffer response chunks and parse the body as JSON
 * Uses the BufferList (bl) module for better buffer handling
 */
export class ResponseBuffer {
  /**
   * Creates a new ResponseBuffer instance
   */
  constructor() {
    this.bl = new BufferList()
  }
  
  /**
   * Adds a chunk to the buffer
   * 
   * @param {Buffer|string} chunk - Response data chunk
   */
  addChunk(chunk) {
    if (chunk) {
      this.bl.append(chunk)
    }
  }
  
  /**
   * Gets the complete response body as a string
   * 
   * @returns {string} The complete response body
   */
  getBody() {
    return this.bl.toString('utf8')
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
    this.bl = new BufferList()
  }
}
