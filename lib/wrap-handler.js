/**
 * Class to wrap legacy handler interface to the new controller-based interface
 */
export class WrapHandler {
  #handler

  /**
   * Creates a new instance of WrapHandler
   *
   * @param {Object} handler - The legacy handler to wrap
   */
  constructor (handler) {
    this.#handler = handler
  }

  /**
   * Handles the request start event
   *
   * @param {Object} controller - The request controller
   * @param {Object} context - The request context
   */
  onRequestStart (controller, context) {
    this.#handler.onConnect?.((err) => controller.abort(err), context)
  }

  /**
   * Converts headers object to raw headers array format
   *
   * @param {Object} headers - Headers object
   * @returns {Array} Raw headers array
   */
  #headersToRaw (headers) {
    const rawHeaders = []
    for (const [key, val] of Object.entries(headers)) {
      rawHeaders.push(Buffer.from(key), Buffer.from(val))
    }
    return rawHeaders
  }

  /**
   * Handles the response start event
   *
   * @param {Object} controller - The request controller
   * @param {number} statusCode - The HTTP status code
   * @param {Object} headers - The response headers
   * @param {string} statusMessage - The status message
   */
  onResponseStart (controller, statusCode, headers, statusMessage) {
    // Convert headers object to raw headers format for legacy handlers
    const rawHeaders = this.#headersToRaw(headers)
    this.#handler.onHeaders?.(statusCode, rawHeaders, () => {}, statusMessage)
  }

  /**
   * Handles the response data event
   *
   * @param {Object} controller - The request controller
   * @param {Buffer} data - The response data chunk
   */
  onResponseData (controller, data) {
    this.#handler.onData?.(data)
  }

  /**
   * Handles the response end event
   */
  onResponseEnd () {
    this.#handler.onComplete?.([])
  }

  /**
   * Handles the response error event
   *
   * @param {Object} controller - The request controller
   * @param {Error} err - The error that occurred
   */
  onResponseError (controller, err) {
    this.#handler.onError?.(err)
  }
}
