import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - per-origin matching', () => {
  test('should require origin in route patterns and apply rules per-origin', async () => {
    // Setup test servers
    const server1 = createServer((req, res) => {
      res.end('hello from server 1')
    })

    const server2 = createServer((req, res) => {
      res.end('hello from server 2')
    })

    server1.listen(0)
    server2.listen(0)
    
    await once(server1, 'listening')
    await once(server2, 'listening')

    const port1 = server1.address().port
    const port2 = server2.address().port

    // Create agent with our interceptor - note origin-prefixed routes
    const agent = new Agent()
    const interceptor = createInterceptor([
      {
        routeToMatch: `localhost:${port1}/api/*`,
        cacheControl: 'public, max-age=86400'
      },
      {
        routeToMatch: `localhost:${port2}/api/*`,
        cacheControl: 'no-store'
      }
    ])

    const composedAgent = agent.compose(interceptor)

    try {
      // Test request to server 1
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port1}`,
        path: '/api/data'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text()

      // Test request to server 2 - same path but different origin
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port2}`,
        path: '/api/data'
      })

      // Should get different cache-control value because it's a different origin
      assert.strictEqual(res2.headers['cache-control'], 'no-store')
      await res2.body.text()
    } finally {
      // Close everything to avoid leaks
      await agent.close()
      await new Promise(resolve => server1.close(resolve))
      await new Promise(resolve => server2.close(resolve))
    }
  })
})
