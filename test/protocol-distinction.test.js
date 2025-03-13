import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - protocol distinction support', () => {
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
      const interceptor = createInterceptor([
        {
          routeToMatch: 'http://example.com/static/images/*',
          cacheControl: 'public, max-age=3600'
        },
        {
          routeToMatch: 'example.com/static/images/*',
          cacheControl: 'public, max-age=7200'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with example.com using Host header without protocol specification in the request
      const res1 = await composedAgent.request({
        method: 'GET',
        // We need to provide an origin for undici, but set it to localhost
        // The host header will be used for matching
        origin: `http://localhost:${port}`,
        headers: {
          host: 'example.com'
        },
        path: '/static/images/logo.png'
      })

      // First test: since we're using a host header, the rule without protocol should be used
      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=7200', 'Should match route without protocol')
      await res1.body.text()

      // Second test: use a server request with a protocol-matching rule
      // Instead of making a real HTTP request, use a local request with the localhost server
      // but with an explicit protocol match
      const interceptor2 = createInterceptor([
        {
          routeToMatch: `http://localhost:${port}/static/images/*`,
          cacheControl: 'public, max-age=3600'
        }
      ])

      const composedAgent2 = agent.compose(interceptor2)

      // Test with a direct localhost request but with protocol matching
      const res2 = await composedAgent2.request({
        method: 'GET',
        // Use the local server with both origin protocol and matching host
        origin: `http://localhost:${port}`,
        headers: {},
        path: '/static/images/logo.png'
      })

      // Second test: when using a protocol in both the rule and the request, that rule should match
      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=3600', 'Should match route with protocol')
      await res2.body.text()
    } finally {
      await new Promise(resolve => server.close(resolve))
      await agent.close()
    }
  })
})
