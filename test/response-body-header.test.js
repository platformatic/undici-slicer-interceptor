import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - response body based headers', () => {
  test('should set headers using response body data', async () => {
    // Setup test server that returns JSON
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ id: 'product-123', name: 'Test Product', price: 99.99 }))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using response-based FGH
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=1800',
            'x-product-id': { fgh: '.params.productId' }, // Request-based
            'x-product-real-id': { fgh: '.response.body.id' }, // Response-based
            'x-cache-tags': { fgh: "'product', 'product-' + .response.body.id" } // Response-based
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

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=1800')
      assert.strictEqual(res.headers['x-product-id'], '123')
      assert.strictEqual(res.headers['x-product-real-id'], 'product-123')
      assert.strictEqual(res.headers['x-cache-tags'], 'product,product-product-123')

      // Read the body to ensure everything completes
      await res.body.text()
    } finally {
      server.close()
    }
  })

  test('should set headers for an array response body', async () => {
    // Setup test server that returns JSON array
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify([
        { id: 'product-123', name: 'Product 1' },
        { id: 'product-456', name: 'Product 2' }
      ]))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using response-based FGH with array iteration
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products`,
          headers: {
            'cache-control': 'public, max-age=1800',
            'x-product-count': { fgh: '2' },
            'x-cache-tags': { fgh: "'products', .response.body[].id" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=1800')
      assert.strictEqual(res.headers['x-product-count'], '2')
      assert.strictEqual(res.headers['x-cache-tags'], 'products,product-123,product-456')

      // Read the body to ensure everything completes
      await res.body.text()
    } finally {
      server.close()
    }
  })

  test('should fallback to request-only for non-200 responses', async () => {
    // Setup test server that returns error
    const server = createServer((req, res) => {
      res.statusCode = 404
      res.end('Not Found')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=1800',
            'x-product-id': { fgh: '.params.productId' }, // Request-based
            'x-cache-tags': { fgh: "'product', 'product-' + .response.body.id" } // Response-based
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

      assert.strictEqual(res.statusCode, 404)
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=1800')
      assert.strictEqual(res.headers['x-product-id'], '123')
      // Response-based header should not be set
      assert.strictEqual(res.headers['x-cache-tags'], undefined)

      // Read the body to ensure everything completes
      await res.body.text()
    } finally {
      server.close()
    }
  })

  test('should automatically detect and use the appropriate handler type', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      if (req.url.includes('/request-only')) {
        res.setHeader('Content-Type', 'text/plain')
        res.end('Request only endpoint')
      } else if (req.url.includes('/response-based')) {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ id: 'product-789', name: 'Test Product' }))
      }
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with both types of rules
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          {
            routeToMatch: `${hostname}/request-only/:id`,
            headers: {
              'cache-control': 'public, max-age=1800',
              'x-id': { fgh: '.params.id' }, // Request-based only
              'x-cache-tags': { fgh: "'request-only', 'id-' + .params.id" }
            }
          },
          {
            routeToMatch: `${hostname}/response-based/:id`,
            headers: {
              'cache-control': 'public, max-age=1800',
              'x-id': { fgh: '.params.id' }, // Request-based
              'x-product-id': { fgh: '.response.body.id' }, // Response-based
              'x-cache-tags': { fgh: "'response-based', 'product-' + .response.body.id" }
            }
          }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request-only endpoint
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/request-only/123'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=1800')
      assert.strictEqual(res1.headers['x-id'], '123')
      assert.strictEqual(res1.headers['x-cache-tags'], 'request-only,id-123')
      await res1.body.text()

      // Test response-based endpoint
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/response-based/456'
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=1800')
      assert.strictEqual(res2.headers['x-id'], '456')
      assert.strictEqual(res2.headers['x-product-id'], 'product-789')
      assert.strictEqual(res2.headers['x-cache-tags'], 'response-based,product-product-789')
      await res2.body.text()
    } finally {
      server.close()
    }
  })

  test('should handle mixed request and response based headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        productId: 'product-555',
        categoryId: 'cat-123',
        variants: [
          { id: 'var-1', color: 'red' },
          { id: 'var-2', color: 'blue' }
        ]
      }))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with mixed header types
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:id`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-route-id': { fgh: '.params.id' }, // Request-based
            'x-product-id': { fgh: '.response.body.productId' }, // Response-based
            'x-category': { fgh: '.response.body.categoryId' }, // Response-based
            'x-variant-count': { fgh: '2' }, // Response-based
            'x-cache-tags': {
              fgh: "'product', 'product-' + .params.id, 'category-' + .response.body.categoryId, .response.body.variants[].id"
            }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/555'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-route-id'], '555')
      assert.strictEqual(res.headers['x-product-id'], 'product-555')
      assert.strictEqual(res.headers['x-category'], 'cat-123')
      assert.strictEqual(res.headers['x-variant-count'], '2')
      assert.strictEqual(res.headers['x-cache-tags'], 'product,product-555,category-cat-123,var-1,var-2')

      await res.body.text()
    } finally {
      server.close()
    }
  })

  test('should handle errors gracefully when response is not valid JSON', async () => {
    // Setup test server that returns non-JSON
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<html><body>Not JSON</body></html>')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with response-based headers
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:id`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-route-id': { fgh: '.params.id' }, // Request-based
            'x-product-id': { fgh: '.response.body.id' }, // Response-based that will fail
            'x-cache-tags': { fgh: "'product', 'product-' + .params.id" } // Mixed, but should work
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

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-route-id'], '123')
      // Response-based header should not be set due to JSON parsing error
      assert.strictEqual(res.headers['x-product-id'], undefined)
      // Mixed header should still have the request-based part
      assert.strictEqual(res.headers['x-cache-tags'], 'product,product-123')

      await res.body.text()
    } finally {
      server.close()
    }
  })
})
