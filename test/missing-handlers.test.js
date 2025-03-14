import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - missing handlers', () => {
  test('should handle requests without using all handler methods', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle HEAD requests correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      // HEAD requests don't have a body
      res.end()
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test HEAD request
      const res = await composedAgent.request({
        method: 'HEAD',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
    } finally {
      server.close()
    }
  })
})
