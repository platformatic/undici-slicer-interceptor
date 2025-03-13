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
    const serverUrl = `http://localhost:${port}`

    // Create agent with our interceptor
    const agent = new Agent()
    const interceptor = createInterceptor([
      { routeToMatch: '/api/*', cacheControl: 'public, max-age=86400' },
      { routeToMatch: '/static/*', cacheControl: 'public, max-age=3600' }
    ])

    const composedAgent = agent.compose(interceptor)

    try {
      // Make request to the first path
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text() // Use text() instead of dump() to ensure the stream is fully consumed
      
      // Make request to the second path
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/static/image.jpg'
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=3600')
      await res2.body.text()
      
    } finally {
      // Always close the agent and server
      await agent.close()
      await new Promise(resolve => server.close(resolve))
    }
  })
})
