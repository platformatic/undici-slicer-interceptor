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
        createInterceptor({
          rules: [{ headers: { 'cache-control': 'public, max-age=86400' } }]
        })
      },
      { message: 'Each rule must have a routeToMatch string' }
    )

    // Missing both headers and responseBodyTransform
    assert.throws(
      () => {
        createInterceptor({ rules: [{ routeToMatch: 'example.com/api' }] })
      },
      { message: 'Each rule must have either a headers object or a responseBodyTransform object (or both)' }
    )

    // Invalid route format - missing origin
    assert.throws(
      () => {
        createInterceptor({
          rules: [{
            routeToMatch: '/api',
            headers: { 'cache-control': 'no-store' }
          }]
        })
      },
      /Origin must be specified at the beginning of the route/
    )

    // Invalid route format - missing path
    assert.throws(
      () => {
        createInterceptor({
          rules: [{
            routeToMatch: 'example.com',
            headers: { 'cache-control': 'no-store' }
          }]
        })
      },
      /Invalid route format/
    )
  })

  test('should thoroughly test rule validation', () => {
    // Non-string routeToMatch
    assert.throws(
      () => {
        createInterceptor({
          rules: [{
            routeToMatch: 123,
            headers: { 'cache-control': 'no-store' }
          }]
        })
      },
      { message: 'Each rule must have a routeToMatch string' }
    )

    // Non-object headers
    assert.throws(
      () => {
        createInterceptor({
          rules: [{
            routeToMatch: 'example.com/path',
            headers: 'invalid'
          }]
        })
      },
      { message: 'Each rule must have either a headers object or a responseBodyTransform object (or both)' }
    )

    // Empty routeToMatch
    assert.throws(
      () => {
        createInterceptor({
          rules: [{
            routeToMatch: '',
            headers: { 'cache-control': 'no-store' }
          }]
        })
      },
      { message: 'Each rule must have a routeToMatch string' }
    )

    // Valid rules should work fine with headers
    assert.doesNotThrow(() => {
      createInterceptor({
        rules: [
          { routeToMatch: 'example.com/api/*', headers: { 'cache-control': 'no-store' } },
          { routeToMatch: 'api.example.com/path', headers: { 'cache-control': 'public, max-age=86400' } }
        ]
      })
    })

    // Valid rules should work fine with responseBodyTransform
    assert.doesNotThrow(() => {
      createInterceptor({
        rules: [
          {
            routeToMatch: 'example.com/api/*',
            responseBodyTransform: { fgh: '. + { cached: true }' }
          }
        ]
      })
    })

    // Valid rules should work fine with both headers and responseBodyTransform
    assert.doesNotThrow(() => {
      createInterceptor({
        rules: [
          {
            routeToMatch: 'example.com/api/*',
            headers: { 'cache-control': 'no-store' },
            responseBodyTransform: { fgh: '. + { cached: true }' }
          }
        ]
      })
    })
  })
})
