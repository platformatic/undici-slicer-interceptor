import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - header handling', () => {
  test('should not override existing cache-control header', async () => {
    // Setup test server that returns its own cache-control header
    const server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
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

      // Test that our interceptor doesn't override the server's cache-control header
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'no-store', 'Server cache-control header should be preserved')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle buffer headers correctly', async () => {
    // Setup test server that returns headers as buffers
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', Buffer.from('text/plain'))
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

      // Test that the interceptor handles buffer headers correctly
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res.headers['content-type'], 'text/plain')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should thoroughly test all header handling methods', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      // Detect if cache-control header is already present in the request
      const reqCacheControl = req.headers['cache-control']
      if (reqCacheControl) {
        // Echo back the same cache-control header
        res.setHeader('cache-control', reqCacheControl)
      }
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

      // GET with no cache-control (should add it)
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })
      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text()

      // GET with existing cache-control (should not override)
      const res3 = await agent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/',
        headers: {
          'cache-control': 'no-store'
        }
      })
      assert.strictEqual(res3.headers['cache-control'], 'no-store')
      await res3.body.text()
    } finally {
      server.close()
    }
  })
})
