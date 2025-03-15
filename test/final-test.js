import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

/**
 * This test verifies that the response body-based header processing 
 * functionality is working correctly
 */
describe('make-cacheable-interceptor - comprehensive response body headers test', () => {
  test('should process both request and response based headers correctly', async () => {
    // Setup test server that returns different responses based on the request
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      
      if (req.url.includes('/products/123')) {
        res.end(JSON.stringify({ 
          id: 'product-123', 
          name: 'Product 123',
          category: 'electronics',
          tags: ['new', 'featured']
        }))
      } else if (req.url.includes('/products')) {
        res.end(JSON.stringify([
          { id: 'product-1', name: 'Product 1' },
          { id: 'product-2', name: 'Product 2' },
          { id: 'product-3', name: 'Product 3' }
        ]))
      } else {
        res.statusCode = 404
        res.end(JSON.stringify({ error: 'Not found' }))
      }
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const serverUrl = `http://localhost:${port}`
    const hostname = `localhost:${port}`

    try {
      // Create interceptor with comprehensive rules
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          // Rule for single product
          {
            routeToMatch: `${hostname}/products/:productId`,
            headers: {
              'cache-control': 'public, max-age=3600',
              'x-product-id': { fgh: '.params.productId' }, // Request-based
              'x-product-real-id': { fgh: '.response.body.id' }, // Response-based
              'x-product-name': { fgh: '.response.body.name' }, // Response-based
              'x-product-category': { fgh: '.response.body.category' }, // Response-based
              'x-cache-tags': { 
                fgh: "'product', 'product-' + .params.productId, 'product-' + .response.body.id, 'category-' + .response.body.category" 
              } // Mixed request/response based
            }
          },
          // Rule for product list
          {
            routeToMatch: `${hostname}/products`,
            headers: {
              'cache-control': 'public, max-age=1800',
              'x-resource-type': 'product-list', // Static
              'x-product-count': { fgh: '3' }, // Static in FGH
              'x-cache-tags': { fgh: "'products', .response.body[].id" } // Response-based with array iteration
            }
          }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test single product request
      const singleProductRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/products/123'
      })

      // Verify headers for single product
      assert.strictEqual(singleProductRes.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(singleProductRes.headers['x-product-id'], '123')
      assert.strictEqual(singleProductRes.headers['x-product-real-id'], 'product-123')
      assert.strictEqual(singleProductRes.headers['x-product-name'], 'Product 123')
      assert.strictEqual(singleProductRes.headers['x-product-category'], 'electronics')
      assert.strictEqual(
        singleProductRes.headers['x-cache-tags'], 
        'product,product-123,product-product-123,category-electronics'
      )
      
      // Read body to complete the request
      await singleProductRes.body.text()

      // Test product list request
      const productListRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/products'
      })

      // Verify headers for product list
      assert.strictEqual(productListRes.headers['cache-control'], 'public, max-age=1800')
      assert.strictEqual(productListRes.headers['x-resource-type'], 'product-list')
      assert.strictEqual(productListRes.headers['x-product-count'], '3')
      assert.strictEqual(
        productListRes.headers['x-cache-tags'], 
        'products,product-1,product-2,product-3'
      )
      
      // Read body to complete the request
      await productListRes.body.text()

      // Test 404 response (should only apply request-based headers)
      const notFoundRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/not-found'
      })

      // Verify it's a 404 and no headers were added
      assert.strictEqual(notFoundRes.statusCode, 404)
      assert.strictEqual(notFoundRes.headers['x-product-id'], undefined)
      assert.strictEqual(notFoundRes.headers['x-cache-tags'], undefined)
      
      // Read body to complete the request
      await notFoundRes.body.text()
    } finally {
      server.close()
    }
  })
})
