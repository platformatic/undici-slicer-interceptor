import { describe, test } from 'node:test'
import assert from 'node:assert'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - input validation', () => {
  test('should handle invalid rules gracefully', async () => {
    // Test array validation
    try {
      createInterceptor('not-an-array')
      assert.fail('Should have thrown an error for non-array rules')
    } catch (err) {
      assert.strictEqual(err.message, 'Rules must be an array')
    }

    // Test rule validation - missing routeToMatch
    try {
      createInterceptor([{ cacheControl: 'no-store' }])
      assert.fail('Should have thrown an error for missing routeToMatch')
    } catch (err) {
      assert.strictEqual(err.message, 'Each rule must have a routeToMatch string')
    }

    // Test rule validation - missing cacheControl
    try {
      createInterceptor([{ routeToMatch: '/api' }])
      assert.fail('Should have thrown an error for missing cacheControl')
    } catch (err) {
      assert.strictEqual(err.message, 'Each rule must have a cacheControl string')
    }
  })

  test('should thoroughly test rule validation', async () => {
    // Test with invalid rule missing routeToMatch
    let error = null
    try {
      createInterceptor([{ cacheControl: 'no-store' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a routeToMatch string')

    // Test with null routeToMatch
    error = null
    try {
      createInterceptor([{ routeToMatch: null, cacheControl: 'no-store' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a routeToMatch string')

    // Test with non-string routeToMatch
    error = null
    try {
      createInterceptor([{ routeToMatch: 123, cacheControl: 'no-store' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a routeToMatch string')

    // Test with invalid rule missing cacheControl
    error = null
    try {
      createInterceptor([{ routeToMatch: '/path' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a cacheControl string')

    // Test with null cacheControl
    error = null
    try {
      createInterceptor([{ routeToMatch: '/path', cacheControl: null }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a cacheControl string')

    // Test with non-string cacheControl
    error = null
    try {
      createInterceptor([{ routeToMatch: '/path', cacheControl: 123 }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a cacheControl string')
  })
})
