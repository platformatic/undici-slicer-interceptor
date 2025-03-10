import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent, setGlobalDispatcher, request } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor', () => {
  test('should add cache-control headers based on rules', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/static/*', cacheControl: 'public, max-age=86400' },
        { routeToMatch: '/api/*', cacheControl: 'no-store' }
      ])

      const composedAgent = agent.compose(interceptor)
      setGlobalDispatcher(composedAgent)

      // Test static route
      const staticRes = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/static/image.jpg'
      })

      assert.strictEqual(staticRes.headers['cache-control'], 'public, max-age=86400')
      await staticRes.body.dump()

      // Test API route
      const apiRes = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data'
      })

      assert.strictEqual(apiRes.headers['cache-control'], 'no-store')
      await apiRes.body.dump()

      // Test unmatched route
      const otherRes = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/other'
      })

      assert.strictEqual(otherRes.headers['cache-control'], undefined)
      await otherRes.body.dump()
    } finally {
      server.close()
    }
  })
})
