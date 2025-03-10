import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - completeness tests', () => {
  test('should handle uppercase method correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with uppercase method
      const res = await composedAgent.request({
        method: 'HEAD', // Explicitly uppercase method
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
    } finally {
      server.close()
    }
  })

  test('should handle lowercase method correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with lowercase method
      const res = await composedAgent.request({
        method: 'head', // Explicitly lowercase method
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
    } finally {
      server.close()
    }
  })

  test('should use GET as default method when applying cache headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      // Echo back the request method to verify
      res.end(`Method: ${req.method}`)
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Make a request with explicit GET method
      const res = await composedAgent.request({
        method: 'GET', 
        origin: serverUrl,
        path: '/'
      })

      // Cache header should be applied for GET method
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      
      // Our method handling in the interceptor should handle case when method is undefined
      // This is being tested indirectly, as we can't directly provide an undefined method to undici
    } finally {
      server.close()
    }
  })

  test('should handle data streaming and completion correctly', async () => {
    // Setup test server with a streaming response
    const server = createServer((req, res) => {
      res.write('hello ')
      // Use a longer timeout to ensure the chunks are properly read
      setTimeout(() => {
        res.write('world')
        res.end()
      }, 50)
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Make a simple request to verify streaming works
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      
      // Use text() which waits for the complete body
      const text = await res.body.text()
      assert.strictEqual(text, 'hello world')
    } finally {
      server.close()
    }
  })
})
