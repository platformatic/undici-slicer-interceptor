import { describe, test } from 'node:test'
import assert from 'node:assert'
// import { Agent } from 'undici'
// import { createServer } from 'node:http'
// import { once } from 'node:events'
// import { createInterceptor } from '../index.js'
import { parseRouteWithOrigin, extractOrigin } from '../lib/router.js'

describe('make-cacheable-interceptor - origin extraction', () => {
  test('should correctly extract origin from different request formats', () => {
    // Test with origin URL
    const result1 = extractOrigin({ origin: 'http://example.com:3000' })
    assert.strictEqual(result1.origin, 'example.com:3000')

    // Test with host header
    const result2 = extractOrigin({ headers: { host: 'example.com:3000' } })
    assert.strictEqual(result2.origin, 'example.com:3000')

    // Test with hostname and port
    const result3 = extractOrigin({ hostname: 'example.com', port: 3000 })
    assert.strictEqual(result3.origin, 'example.com:3000')
  })

  test('should parse routes with origin correctly', () => {
    // Test with hostname/path
    const result1 = parseRouteWithOrigin('example.com/api/data')
    assert.deepStrictEqual(result1, {
      origin: 'example.com',
      path: '/api/data'
    })

    // Test with hostname:port/path
    const result2 = parseRouteWithOrigin('example.com:3000/api/data')
    assert.deepStrictEqual(result2, {
      origin: 'example.com:3000',
      path: '/api/data'
    })

    // Test with protocol (should be ignored)
    const result3 = parseRouteWithOrigin('http://example.com:3000/api/data')
    assert.deepStrictEqual(result3, {
      origin: 'example.com:3000',
      path: '/api/data'
    })
  })

  test('should throw error for invalid routes', () => {
    // Routes without slashes are invalid
    assert.throws(() => {
      parseRouteWithOrigin('examplecom')
    }, /Invalid route format/)
  })
})
