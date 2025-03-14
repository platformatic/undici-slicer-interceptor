import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - cache tags', () => {
  test('should add x-cache-tags header with static values', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using static cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/static/*`,
          headers: { 'cache-control': 'public, max-age=86400' },
          cacheTags: "'static', 'cdn'"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/static/script.js'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(res.headers['x-cache-tags'], 'static,cdn')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should add x-cache-tags header with route parameter values', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using route parameter-based cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/users/:userId`,
          headers: { 'cache-control': 'private, max-age=3600' },
          cacheTags: "'user-' + .params.userId, 'type-user'"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/users/123'
      })

      assert.strictEqual(res.headers['cache-control'], 'private, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'user-123,type-user')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should add x-cache-tags header with querystring values', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using querystring-based cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/products`,
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: ".querystring.category, 'products'"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/products?category=electronics&sort=price'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'electronics,products')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle multiple cache tag expressions', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using complex cache tag rules
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/api/:version/categories/:categoryId/products/:productId`,
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: "'api-version-' + .params.version, 'category-' + .params.categoryId, 'product-' + .params.productId, .querystring.variant // 'default'"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with query parameter
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/v1/categories/electronics/products/laptop-123?variant=premium'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(
        res1.headers['x-cache-tags'],
        'api-version-v1,category-electronics,product-laptop-123,premium'
      )
      await res1.body.dump()

      // Test request without query parameter (should use default)
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/v1/categories/electronics/products/laptop-123'
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(
        res2.headers['x-cache-tags'],
        'api-version-v1,category-electronics,product-laptop-123,default'
      )
      await res2.body.dump()
    } finally {
      server.close()
    }
  })

  test('should throw error for invalid cache tag expressions', () => {
    assert.throws(() => {
      createInterceptor([
        {
          routeToMatch: 'example.com/invalid-test',
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: 'invalid[expression' // This should cause an error during compilation
        }
      ])
    }, /Error compiling cache tag expression: invalid\[expression/)
  })

  test('should not add x-cache-tags header when no cache tags are defined', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor without cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/no-tags`,
          headers: { 'cache-control': 'public, max-age=3600' }
          // No cacheTags property
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/no-tags'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], undefined)
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should respect existing x-cache-tags header', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('x-cache-tags', 'existing-tag')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/respect-existing`,
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: "'should-not-appear'"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/respect-existing'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'existing-tag')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
