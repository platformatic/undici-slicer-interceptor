import { describe, test } from 'node:test'
import assert from 'node:assert'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - input validation', () => {
  test('should handle invalid rules gracefully', () => {
    // Not an array
    assert.throws(
      () => {
        createInterceptor({})
      },
      { message: 'Rules must be an array' }
    )

    // Missing routeToMatch
    assert.throws(
      () => {
        createInterceptor([{ cacheControl: 'public, max-age=86400' }])
      },
      { message: 'Each rule must have a routeToMatch string' }
    )

    // Missing cacheControl
    assert.throws(
      () => {
        createInterceptor([{ routeToMatch: 'example.com/api' }])
      },
      { message: 'Each rule must have a cacheControl string' }
    )

    // Invalid route format - missing origin
    assert.throws(
      () => {
        createInterceptor([
          { routeToMatch: '/api', cacheControl: 'no-store' }
        ])
      },
      /Origin must be specified at the beginning of the route/
    )

    // Invalid route format - missing path
    assert.throws(
      () => {
        createInterceptor([
          { routeToMatch: 'example.com', cacheControl: 'no-store' }
        ])
      },
      /Invalid route format/
    )
  })

  test('should thoroughly test rule validation', () => {
    // Non-string routeToMatch
    assert.throws(
      () => {
        createInterceptor([
          { routeToMatch: 123, cacheControl: 'no-store' }
        ])
      },
      { message: 'Each rule must have a routeToMatch string' }
    )

    // Non-string cacheControl
    assert.throws(
      () => {
        createInterceptor([
          { routeToMatch: 'example.com/path', cacheControl: 123 }
        ])
      },
      { message: 'Each rule must have a cacheControl string' }
    )

    // Empty routeToMatch
    assert.throws(
      () => {
        createInterceptor([
          { routeToMatch: '', cacheControl: 'no-store' }
        ])
      },
      { message: 'Each rule must have a routeToMatch string' }
    )

    // Empty cacheControl
    assert.throws(
      () => {
        createInterceptor([
          { routeToMatch: 'example.com/path', cacheControl: '' }
        ])
      },
      { message: 'Each rule must have a cacheControl string' }
    )

    // Valid rules should work fine
    assert.doesNotThrow(() => {
      createInterceptor([
        { routeToMatch: 'example.com/api/*', cacheControl: 'no-store' },
        { routeToMatch: 'api.example.com/path', cacheControl: 'public, max-age=86400' }
      ])
    })
  })
})
