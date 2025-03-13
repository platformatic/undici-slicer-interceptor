import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - per-origin matching', () => {
  test('should require origin in route patterns and apply rules per-origin', async () => {
    // Setup a single test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const hostname1 = `localhost:${port}`
    const hostname2 = `127.0.0.1:${port}`
    const serverUrl1 = `http://${hostname1}`
    const serverUrl2 = `http://${hostname2}`

    // Create agent with our interceptor - note origin-prefixed routes
    const agent = new Agent()
    
    try {
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname1}/api/*`,
          cacheControl: 'public, max-age=86400'
        },
        {
          routeToMatch: `${hostname2}/api/*`,
          cacheControl: 'no-store'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request to first hostname
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl1,
        path: '/api/data'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text()

      // Test request to second hostname (same server, different hostname)
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl2,
        path: '/api/data'
      })

      // Should get different cache-control value because it's a different hostname
      assert.strictEqual(res2.headers['cache-control'], 'no-store')
      await res2.body.text()
    } finally {
      // Close everything to avoid leaks
      await agent.close()
      await new Promise(resolve => server.close(resolve))
    }
  })
})
