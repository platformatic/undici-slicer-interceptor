import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - protocol support', () => {
  test('should support URLs with protocols in route patterns', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      // Don't send the real header since we just want to test our interceptor
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const agent = new Agent()

    try {
      // Create agent with interceptor that uses both protocol and non-protocol routes
      // (Now we only use the first rule found for an origin)
      const interceptor = createInterceptor([
        {
          routeToMatch: 'http://example.com/static/images/*',
          headers: { 'cache-control': 'public, max-age=3600' }
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with example.com using Host header
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        headers: {
          host: 'example.com'
        },
        path: '/static/images/logo.png'
      })

      // First test: should match the rule for example.com
      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=3600', 'Should match route with protocol')
      await res1.body.text()

      // Second test: use a server request with localhost
      const interceptor2 = createInterceptor([
        {
          routeToMatch: `http://localhost:${port}/static/images/*`,
          headers: { 'cache-control': 'public, max-age=3600' }
        }
      ])

      const composedAgent2 = agent.compose(interceptor2)

      // Test with a direct localhost request
      const res2 = await composedAgent2.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        headers: {},
        path: '/static/images/logo.png'
      })

      // Second test: match the localhost rule
      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=3600', 'Should match route with protocol')
      await res2.body.text()
    } finally {
      await new Promise(resolve => server.close(resolve))
      await agent.close()
    }
  })
})
