import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - specific header format test', () => {
  test('should handle x-cache-tags format with response header access', async () => {
    // Setup test server with x-cache-tags header
    const server = createServer((req, res) => {
      res.setHeader('x-cache-tags', 'product')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using the specific format from the requirements
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/test`,
          headers: {
            'x-cache-tags': { fgh: "'product', .response.headers['x-cache-tags']" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/test'
      })

      // Verify the header works as expected
      assert.strictEqual(res.headers['x-cache-tags'], 'product,product')

      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle the exact format from the requirements', async () => {
    // Setup test server with x-cache-tags header
    const server = createServer((req, res) => {
      res.setHeader('x-cache-tags', 'user-info')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using the exact format from the requirements
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/test`,
          headers: {
            'x-cache-tags': { fgh: "'product', .response.headers['x-cache-tags']" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/test'
      })

      // Verify that we get both the static value and the header value
      assert.strictEqual(res.headers['x-cache-tags'], 'product,user-info')

      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
