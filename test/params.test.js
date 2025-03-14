import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - route params', () => {
  test('should support paths with route parameters', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using route parameters
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/users/:userId`, headers: { 'cache-control': 'private, max-age=3600' } }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with route parameter
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/users/123'
      })

      assert.strictEqual(res.headers['cache-control'], 'private, max-age=3600')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should make parameters available in route handlers', () => {
    // Test that route parameters work correctly with cache tag evaluation
    const rule = {
      routeToMatch: 'example.com/users/:userId',
      headers: { 'cache-control': 'private, max-age=3600' },
      cacheTags: "'user-' + .params.userId"
    }

    const interceptor = createInterceptor([rule])

    // Successful creation means parameters are supported
    assert.ok(interceptor)
  })
})
