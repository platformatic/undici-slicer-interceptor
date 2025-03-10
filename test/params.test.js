import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - route params', () => {
  test('should support paths with route parameters', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using route parameters
      const agent = new Agent()
      const interceptor = createInterceptor([
        // Using find-my-way parameter syntax
        { routeToMatch: '/users/:userId', cacheControl: 'private, max-age=3600' },
        { routeToMatch: '/products/:category/:productId', cacheControl: 'public, max-age=86400' },
        { routeToMatch: '/api/v:version/resources/:resourceId', cacheControl: 'no-store' },
        { routeToMatch: '/:tenant/dashboard/*', cacheControl: 'private, max-age=60' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test single parameter route
      const userRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/users/123'
      })

      assert.strictEqual(userRes.headers['cache-control'], 'private, max-age=3600')
      await userRes.body.dump()

      // Test multiple parameters route
      const productRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/products/electronics/abc-123'
      })

      assert.strictEqual(productRes.headers['cache-control'], 'public, max-age=86400')
      await productRes.body.dump()

      // Test route with version parameter
      const apiRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/v2/resources/456'
      })

      assert.strictEqual(apiRes.headers['cache-control'], 'no-store')
      await apiRes.body.dump()

      // Test route with parameter and wildcard
      const dashboardRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/acme-corp/dashboard/widgets/stats'
      })

      assert.strictEqual(dashboardRes.headers['cache-control'], 'private, max-age=60')
      await dashboardRes.body.dump()

      // Test unmatched route
      const otherRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/something-else'
      })

      assert.strictEqual(otherRes.headers['cache-control'], undefined)
      await otherRes.body.dump()
    } finally {
      server.close()
    }
  })

  test('should make parameters available in route handlers', async () => {
    // This test confirms that find-my-way correctly extracts parameter values
    // Setup custom router (for testing only)
    const findMyWay = await import('find-my-way')
    const router = findMyWay.default()

    // Register route with parameters
    router.on('GET', '/users/:userId/posts/:postId', (req, res, params) => {
      assert.strictEqual(params.userId, '123')
      assert.strictEqual(params.postId, '456')
      return 'route matched'
    })

    // Check that parameters are correctly extracted
    const result = router.find('GET', '/users/123/posts/456')
    assert.strictEqual(result.handler(null, null, result.params), 'route matched')
  })
})
