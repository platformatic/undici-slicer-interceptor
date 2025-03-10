import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - missing handlers', () => {
  test('should handle requests without using all handler methods', async () => {
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

      // Make a simple request to verify the caching works
      // This effectively tests that the handler methods are correctly passed through
      // without needing to actually provide our own custom handlers
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      // Verify cache header is added
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      
      // Reading the body to completion ensures all handler methods get called internally
      const text = await res.body.text()
      assert.strictEqual(text, 'hello world')
    } finally {
      server.close()
    }
  })
  
  test('should handle HEAD requests correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end()
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

      // Make a HEAD request
      const res = await composedAgent.request({
        method: 'HEAD',
        origin: serverUrl,
        path: '/'
      })

      // Should apply cache-control header to HEAD requests
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
    } finally {
      server.close()
    }
  })
})
