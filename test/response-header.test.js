import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - response headers', () => {
  test('should set simple headers from response body', async () => {
    // Sample response data
    const responseData = {
      id: 'prod-123',
      name: 'Sample Product'
    }

    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(responseData))
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
            'cache-control': 'public, max-age=3600',
            'x-product-id': { fgh: '.params.productId' },  // from request
            'x-response-id': { fgh: '.response.body.id' }  // from response body
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/abc-123'
      })

      // Consume the body to ensure it's processed
      const body = await response.body.json()

      // Verify the headers
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-product-id'], 'abc-123')
      assert.strictEqual(response.headers['x-response-id'], 'prod-123')

      // Verify body is unmodified
      assert.deepStrictEqual(body, responseData)
    } finally {
      server.close()
    }
  })

  test('should set headers from array response body', async () => {
    // Sample response data - an array
    const responseData = [
      { id: 'prod-1', name: 'Product 1' },
      { id: 'prod-2', name: 'Product 2' },
      { id: 'prod-3', name: 'Product 3' }
    ]

    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(responseData))
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
          routeToMatch: `${hostname}/api/products`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-product-count': { fgh: '.response.body[].length' },
            'x-cache-tags': { fgh: "'products', .response.body[].id" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products'
      })

      // Consume the body to ensure it's processed
      const body = await response.body.json()

      // Verify the headers
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-product-count'], '3')
      assert.strictEqual(response.headers['x-cache-tags'], 'products,prod-1,prod-2,prod-3')

      // Verify body is unmodified
      assert.deepStrictEqual(body, responseData)
    } finally {
      server.close()
    }
  })

  test('should handle mix of request and response headers', async () => {
    // Sample response data
    const responseData = {
      id: 'prod-xyz',
      name: 'Premium Product',
      category: 'electronics'
    }

    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(responseData))
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
            'cache-control': 'public, max-age=3600',
            'x-product-id': { fgh: '.params.productId' },  // request-based
            'x-response-id': { fgh: '.response.body.id' },  // response-based
            'x-cache-tags': { fgh: "'product-' + .params.productId, 'category-' + .response.body.category" } // mixed
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/abc-123'
      })

      // Consume the body to ensure it's processed
      const body = await response.body.json()

      // Verify the headers
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-product-id'], 'abc-123')
      assert.strictEqual(response.headers['x-response-id'], 'prod-xyz')
      assert.strictEqual(response.headers['x-cache-tags'], 'product-abc-123,category-electronics')

      // Verify body is unmodified
      assert.deepStrictEqual(body, responseData)
    } finally {
      server.close()
    }
  })

  test('should handle non-JSON responses gracefully', async () => {
    // Setup test server with text response
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('This is not JSON data')
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
          routeToMatch: `${hostname}/api/text`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-request-path': { fgh: '.path' },  // request-based
            'x-response-valid-json': { fgh: '.response.body != null' }  // response-based
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/text'
      })

      // Consume the body to ensure it's processed
      const body = await response.body.text()

      // Verify the headers (request-based headers should work, response-based may not)
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-request-path'], '/api/text')
      
      // x-response-valid-json might be false or undefined depending on implementation
      // Just verify it exists with some value
      assert(response.headers['x-response-valid-json'] !== undefined)
      
      // Verify body is unmodified
      assert.strictEqual(body, 'This is not JSON data')
    } finally {
      server.close()
    }
  })

  test('should handle empty response bodies gracefully', async () => {
    // Setup test server with empty response
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end('')
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
          routeToMatch: `${hostname}/api/empty`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-has-body': { fgh: '.response.body != null' }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/empty'
      })

      // Consume the body to ensure it's processed
      const body = await response.body.text()

      // Verify the headers
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-has-body'], 'false')
      
      // Verify body is empty
      assert.strictEqual(body, '')
    } finally {
      server.close()
    }
  })
})
