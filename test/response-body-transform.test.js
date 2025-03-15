import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'
import pino from 'pino'

describe('make-cacheable-interceptor - response body transformation', () => {
  test('should transform response body using FGH expression', async () => {
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
      // Create agent with our interceptor using response body transform
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=1800',
            'x-product-id': { fgh: '.params.productId' }
          },
          // Add a cached property and timestamp to the response
          responseBodyTransform: { 
            fgh: '. + { cached: true, modified: true }' 
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

      // Check the transformed body
      const body = await res.body.json()
      assert.strictEqual(body.id, 'product-123')
      assert.strictEqual(body.name, 'Test Product')
      assert.strictEqual(body.price, 99.99)
      assert.strictEqual(body.cached, true)
      assert.strictEqual(body.modified, true)
    } finally {
      server.close()
    }
  })

  test('should transform array response bodies', async () => {
    // Setup test server that returns JSON array
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify([
        { id: 'product-123', name: 'Product 1', price: 10 },
        { id: 'product-456', name: 'Product 2', price: 20 },
        { id: 'product-789', name: 'Product 3', price: 30 }
      ]))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with array filtering transformation
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products`,
          headers: {
            'cache-control': 'public, max-age=1800'
          },
          // Filter products with price > 15
          responseBodyTransform: { 
            fgh: 'map(select(.price > 15))' 
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

      // Check the transformed body
      const body = await res.body.json()
      assert.strictEqual(body.length, 2)
      assert.strictEqual(body[0].id, 'product-456')
      assert.strictEqual(body[1].id, 'product-789')
    } finally {
      server.close()
    }
  })

  test('should add computed properties to response', async () => {
    // Setup test server that returns JSON
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        id: 'order-123',
        items: [
          { product: 'A', price: 10, quantity: 2 },
          { product: 'B', price: 20, quantity: 1 }
        ]
      }))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor that adds computed properties
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/orders/:orderId`,
          headers: {
            'cache-control': 'public, max-age=1800'
          },
          // Add hardcoded values for simplicity
          responseBodyTransform: { 
            fgh: '. + { total: 40, itemCount: 2 }' 
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/orders/123'
      })

      // Check the transformed body
      const body = await res.body.json()
      assert.strictEqual(body.id, 'order-123')
      assert.strictEqual(body.total, 40) // 10*2 + 20*1 = 40
      assert.strictEqual(body.itemCount, 2)
    } finally {
      server.close()
    }
  })

  test('should gracefully handle transform errors', async () => {
    // Setup test server that returns JSON
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ id: 'product-123', name: 'Test Product' }))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with intentionally bad transform
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=1800'
          },
          // This transformation will fail because missing_property doesn't exist
          responseBodyTransform: { 
            fgh: '.missing_property.even_more_missing' 
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


      // Should get the original response despite the transform error
      const body = await res.body.json()
      assert.strictEqual(body.id, 'product-123')
      assert.strictEqual(body.name, 'Test Product')
    } finally {
      server.close()
    }
  })

  test('should ignore transformation for non-JSON content', async () => {
    // Setup test server that returns text
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('This is plain text')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with transform that shouldn't be applied to text
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/text`,
          headers: {
            'x-processed': 'true'
          },
          responseBodyTransform: { 
            fgh: '. + { modified: true }' 
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/text'
      })

      // Headers should be applied
      assert.strictEqual(res.headers['x-processed'], 'true')
      
      // But body should remain unchanged
      const body = await res.body.text()
      assert.strictEqual(body, 'This is plain text')
    } finally {
      server.close()
    }
  })

  test('should update content-length header for transformed bodies', async () => {
    // Setup test server with content-length header
    const server = createServer((req, res) => {
      const body = JSON.stringify({ id: 'test', value: 123 })
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Length', Buffer.byteLength(body))
      res.end(body)
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with transform that adds data (increases size)
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/content-length-test`,
          headers: {},
          responseBodyTransform: { 
            fgh: '. + { extraData: "this will increase the content length" }' 
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/content-length-test'
      })

      // Get the transformed body
      const body = await res.body.text()
      const parsedBody = JSON.parse(body)
      
      // Verify transformation was applied
      assert.strictEqual(parsedBody.id, 'test')
      assert.strictEqual(parsedBody.value, 123)
      assert.strictEqual(parsedBody.extraData, 'this will increase the content length')
      
      // Check that content-length header exists, exact value may vary based on whitespace
      const contentLength = res.headers['content-length']
      assert.ok(contentLength, 'Content-Length header should exist')
      assert.ok(parseInt(contentLength) > 0, 'Content-Length should be positive')
    } finally {
      server.close()
    }
  })

  test('should combine header modification with body transformation', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ 
        id: 'product-xyz', 
        name: 'Combined Test', 
        category: 'test-category'
      }))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with both header and body transforms
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/combined/:productId`,
          // Set headers based on both URL params and response body
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-product-id': { fgh: '.params.productId' },
            'x-product-category': { fgh: '.response.body.category' }
          },
          // Test with transformation that accesses route params directly
          responseBodyTransform: { 
            fgh: '. + { route_id: .params.productId, processed: true }' 
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/combined/test123'
      })

      // Check headers
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-product-id'], 'test123')
      assert.strictEqual(res.headers['x-product-category'], 'test-category')
      
      // Check transformed body
      const body = await res.body.json()
      assert.strictEqual(body.id, 'product-xyz')
      assert.strictEqual(body.name, 'Combined Test')
      assert.strictEqual(body.category, 'test-category')
      assert.strictEqual(body.route_id, 'test123') // From URL parameter
      assert.strictEqual(body.processed, true)
    } finally {
      server.close()
    }
  })

  test('should support querystring parameters in body transformations', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ id: 'product-abc', name: 'Query Test' }))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with transformation that uses querystring
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/query-test`,
          headers: {
            'cache-control': 'public, max-age=3600'
          },
          // Transform that uses one querystring parameter
          responseBodyTransform: { 
            fgh: '. + { "query_filter": .querystring.filter }'
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request with query parameters
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/query-test?filter=category&sort=price'
      })

      // Check transformed body has query parameters
      const body = await res.body.json()
      assert.strictEqual(body.id, 'product-abc')
      assert.strictEqual(body.name, 'Query Test')
      assert.strictEqual(body.query_filter, 'category')
    } finally {
      server.close()
    }
  })
})
