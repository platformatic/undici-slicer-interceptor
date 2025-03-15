import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

/**
 * This test verifies that we can use response headers in FGH expressions
 */
describe('make-cacheable-interceptor - response headers access', () => {
  test('should be able to access response headers in FGH expressions', async () => {
    // Setup test server that returns JSON with custom headers
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('X-Test-Header', 'test-value')
      res.setHeader('X-Server-ID', 'server-123')
      res.end(JSON.stringify({ id: 'product-123', name: 'Test Product' }))
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const serverUrl = `http://localhost:${port}`
    const hostname = `localhost:${port}`

    try {
      // Create interceptor with access to response headers
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=1800',
            'x-product-id': { fgh: '.params.productId' }, // Request-based
            'x-product-real-id': { fgh: '.response.body.id' }, // Response-based
            'x-content-type': { fgh: '.response.headers["content-type"]' }, // Response header-based
            'x-test-echo': { fgh: '.response.headers["x-test-header"]' }, // Response header-based
            'x-server-echo': { fgh: '.response.headers["x-server-id"]' }, // Response header-based
            'x-cache-tags': {
              fgh: "'product', 'product-' + .params.productId, 'server-' + .response.headers[\"x-server-id\"]"
            } // Mixed with response headers
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/123'
      })

      // Verify response headers are used correctly
      assert.strictEqual(res.headers['x-product-id'], '123')
      assert.strictEqual(res.headers['x-product-real-id'], 'product-123')
      assert.strictEqual(res.headers['x-content-type'], 'application/json')
      assert.strictEqual(res.headers['x-test-echo'], 'test-value')
      assert.strictEqual(res.headers['x-server-echo'], 'server-123')
      assert.strictEqual(res.headers['x-cache-tags'], 'product,product-123,server-server-123')

      // Read the body to complete the request
      await res.body.text()
    } finally {
      server.close()
    }
  })

  test('should handle case-insensitivity in response headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('X-Custom-Header', 'custom-value')
      res.end(JSON.stringify({ id: 'product-123' }))
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const serverUrl = `http://localhost:${port}`
    const hostname = `localhost:${port}`

    try {
      // Create interceptor with rules using different case for headers
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'x-content-lowercase': { fgh: '.response.headers["content-type"]' }, // lowercase
            'x-custom-lowercase': { fgh: '.response.headers["x-custom-header"]' }, // lowercase
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/123'
      })

      // Headers should be accessible with lowercase keys
      assert.strictEqual(res.headers['x-content-lowercase'], 'application/json')
      assert.strictEqual(res.headers['x-custom-lowercase'], 'custom-value')

      // Read the body to complete the request
      await res.body.text()
    } finally {
      server.close()
    }
  })
})
