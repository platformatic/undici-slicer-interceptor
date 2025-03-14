import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - querystring handling', () => {
  test('should properly handle paths with querystrings', async () => {
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
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/api/*`, cacheControl: 'no-store' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with querystring
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data?param1=value1&param2=value2'
      })

      assert.strictEqual(res.headers['cache-control'], 'no-store')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should properly handle semicolon delimited querystrings', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with semicolon delimiter option
      const agent = new Agent()
      const interceptor = createInterceptor(
        [{ routeToMatch: `${hostname}/api/*`, cacheControl: 'no-store' }],
        { useSemicolonDelimiter: true }
      )

      const composedAgent = agent.compose(interceptor)

      // Test with semicolon-delimited querystring
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data?param1=value1;param2=value2'
      })

      assert.strictEqual(res.headers['cache-control'], 'no-store')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
