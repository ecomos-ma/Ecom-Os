import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { isOutside } = require('../vendor/extract-zip/path-safety.js')

test('safe extractor contains normalized paths inside its root', () => {
  const root = process.platform === 'win32' ? 'C:\\worker\\chromium' : '/worker/chromium'
  assert.equal(isOutside(root, `${root}${process.platform === 'win32' ? '\\bin' : '/bin'}`), false)
})

test('safe extractor rejects normalized paths outside its root', () => {
  const root = process.platform === 'win32' ? 'C:\\worker\\chromium' : '/worker/chromium'
  const outside = process.platform === 'win32' ? 'C:\\worker\\escape' : '/worker/escape'
  assert.equal(isOutside(root, outside), true)
})
