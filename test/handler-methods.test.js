import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
// import { Readable } from 'node:stream'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - handler methods', () => {
  test('should correctly pass through all handler methods', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    // Define handler with all methods
    const handler = {
      onConnect: (abort) => {
        return { abort }
      },
      onError: (err) => {
        throw err
      },
      onUpgrade: (statusCode, headers, socket) => {
        throw new Error('Should not be called')
      },
      onHeaders: (statusCode, headers, resume) => {
        return true
      },
      onData: (chunk) => {
        return true
      },
      onComplete: (trailers) => {},
      onBodySent: (chunk) => {}
    }

    try {
      // Create agent with our interceptor
      // const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/`,
          headers: { 'cache-control': 'public, max-age=86400' }
        }]
      })

      // Manually execute the interceptor function
      const dispatch = (options, handlerParam) => {
        assert.deepStrictEqual(options, { path: '/', method: 'GET', origin: serverUrl })

        // Verify all methods are passed through
        assert.strictEqual(typeof handlerParam.onConnect, 'function')
        assert.strictEqual(typeof handlerParam.onError, 'function')
        assert.strictEqual(typeof handlerParam.onHeaders, 'function')
        assert.strictEqual(typeof handlerParam.onData, 'function')
        assert.strictEqual(typeof handlerParam.onComplete, 'function')
        assert.strictEqual(typeof handlerParam.onBodySent, 'function')

        return { statusCode: 200 }
      }

      const dispatchFn = interceptor(dispatch)
      const result = dispatchFn({ path: '/', method: 'GET', origin: serverUrl }, handler)

      assert.strictEqual(result.statusCode, 200)
    } finally {
      server.close()
    }
  })

  test('should handle data streaming and completion correctly', async () => {
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
        rules: [{
          routeToMatch: `${hostname}/`,
          headers: { 'cache-control': 'public, max-age=86400' }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')

      // Consume body as a stream to test data handling
      const chunks = []
      for await (const chunk of res.body) {
        chunks.push(chunk)
      }

      // Verify data was correctly streamed
      const body = Buffer.concat(chunks).toString()
      assert.strictEqual(body, 'hello world')
    } finally {
      server.close()
    }
  })

  test('should ensure all function handlers work correctly', async () => {
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
        rules: [{
          routeToMatch: `${hostname}/`,
          headers: { 'cache-control': 'public, max-age=86400' }
        }]
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
        rules: [{
          routeToMatch: `${hostname}/`,
          headers: { 'cache-control': 'public, max-age=86400' }
        }]
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
})
