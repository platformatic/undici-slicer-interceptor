import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - if-then-else cache tags', () => {
  test('should add conditional cache tag when parameter exists', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using if-then-else condition
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=86400',
            'x-cache-tags': { fgh: 'if .params.productId then "product-" + .params.productId else empty end' }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request with productId parameter
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/products/42'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res.headers['x-cache-tags'], 'product-42')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
  
  test('should not add cache tag when parameter does not exist', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor that checks for a non-existent parameter
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=86400',
            'x-cache-tags': { fgh: 'if .params.nonExistentParam then "product-" + .params.nonExistentParam else empty end' }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request without the parameter the condition is checking for
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/products/42'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      // The header should not be set when condition evaluates to empty
      assert.strictEqual(res.headers['x-cache-tags'], undefined)
      await res.body.dump()
    } finally {
      server.close()
    }
  })
  
  test('should handle multiple conditional cache tags', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using if-then-else conditions
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api`,
          headers: {
            'cache-control': 'public, max-age=86400',
            'x-cache-tags': { 
              fgh: `'api',
                if .querystring.category then "category-" + .querystring.category else empty end,
                if .querystring.brand then "brand-" + .querystring.brand else empty end`
            }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request with both query parameters
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api?category=electronics&brand=sony'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res1.headers['x-cache-tags'], 'api,category-electronics,brand-sony')
      await res1.body.dump()
      
      // Test request with only one query parameter
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api?category=electronics'
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res2.headers['x-cache-tags'], 'api,category-electronics')
      await res2.body.dump()
      
      // Test request with no query parameters
      const res3 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api'
      })

      assert.strictEqual(res3.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res3.headers['x-cache-tags'], 'api')
      await res3.body.dump()
    } finally {
      server.close()
    }
  })
  
  test('should handle basic if-else with condition', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using simpler if-else condition
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/catalog/:section/:itemId`,
          headers: {
            'cache-control': 'public, max-age=86400',
            'x-cache-tags': { 
              fgh: `'catalog', if .params.section == "products" then "product-" + .params.itemId else "other-" + .params.section end`
            }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request for products
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/catalog/products/42'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res1.headers['x-cache-tags'], 'catalog,product-42')
      await res1.body.dump()
      
      // Test request for other section
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/catalog/brands/sony'
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res2.headers['x-cache-tags'], 'catalog,other-brands')
      await res2.body.dump()
    } finally {
      server.close()
    }
  })
})
