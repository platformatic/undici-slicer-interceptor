import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - path handling', () => {
  test('should handle root path correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
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

      // Make a request with the shortest valid path - just "/"
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      // Root path should match '/'
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle path with querystring correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
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

      // Make a request with a querystring to test path extraction
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/?param=value'
      })

      // Should extract path from querystring and match '/'
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
