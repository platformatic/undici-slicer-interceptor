import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'
import { extractOrigin } from '../lib/router.js'

describe('make-cacheable-interceptor - origin extraction', () => {
  test('should correctly extract origin from different request formats', () => {
    // Test with origin property
    assert.strictEqual(
      extractOrigin({ origin: 'http://example.com' }),
      'http://example.com'
    )

    // Test with host header
    assert.strictEqual(
      extractOrigin({ headers: { host: 'example.com:3000' } }),
      'example.com:3000'
    )

    // Test with Host header (case insensitive)
    assert.strictEqual(
      extractOrigin({ headers: { Host: 'example.com:8080' } }),
      'example.com:8080'
    )

    // Test with hostname and port
    assert.strictEqual(
      extractOrigin({ hostname: 'example.com', port: 9000 }),
      'http://example.com:9000'
    )

    // Test with hostname, no port
    assert.strictEqual(
      extractOrigin({ hostname: 'example.com' }),
      'http://example.com'
    )

    // Test with hostname and protocol
    assert.strictEqual(
      extractOrigin({ hostname: 'example.com', protocol: 'https:' }),
      'https://example.com'
    )

    // Test with fallback
    assert.strictEqual(
      extractOrigin({}),
      'default-origin'
    )
  })
})
