import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - header handling', () => {
  test('should not override existing cache-control header', async () => {
    // Setup test server that sets cache-control header
    const server = createServer((req, res) => {
      res.setHeader('cache-control', 'no-store, immutable')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test that the interceptor respects existing cache-control header
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      // Should keep the server's header and not override it
      assert.strictEqual(res.headers['cache-control'], 'no-store, immutable')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle buffer headers correctly', async () => {
    // Setup test server with buffer headers
    const server = createServer((req, res) => {
      res.setHeader('content-type', Buffer.from('text/plain'))
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
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
      // Test with mixed header cases to ensure case-insensitive comparison
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
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
})
