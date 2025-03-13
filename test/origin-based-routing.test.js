import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - origin based routing', () => {
  test('should handle different origins correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const hostname = `localhost:${port}`

    try {
      // Create agent with our interceptor with origin in route
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/api/*`, cacheControl: 'public, max-age=86400' },
        { routeToMatch: `${hostname}/static/*`, cacheControl: 'public, max-age=3600' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test API route
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        path: '/api/data'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text()

      // Test static route
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        path: '/static/image.jpg'
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=3600')
      await res2.body.text()
    } finally {
      await server.close()
    }
  })
})
