import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { rewriteIndexTitle, installTitleShell } from '../src/host/title-shell.js'

const original = '<!doctype html><html><head><title>DeepSeek Harness</title><link rel="icon" href="/favicon.svg"></head><body><p>Native content</p></body></html>'

test('initial app HTML receives custom title and only public title bootstrap data', () => {
  const dom = new JSDOM(rewriteIndexTitle(original, '我的工作台'))
  const document = dom.window.document
  assert.equal(document.title, '我的工作台')
  assert.equal(document.querySelector('meta[name="dsh-branding-app-name"]').content, '我的工作台')
  assert.equal(document.querySelector('meta[name="dsh-branding-native-title"]').content, 'DeepSeek Harness')
  assert.equal(document.querySelectorAll('meta').length, 2)
  assert.equal(document.querySelector('link').getAttribute('href'), '/favicon.svg')
  assert.equal(document.body.innerHTML, '<p>Native content</p>')
  dom.window.close()
})

test('custom and original names preserve HTML characters without introducing markup', () => {
  const source = original.replace('DeepSeek Harness', 'Product &amp; &quot;Research&quot; &lt;Lab&gt;')
  const name = 'A & "B" </title><script>bad()</script>'
  const dom = new JSDOM(rewriteIndexTitle(source, name))
  assert.equal(dom.window.document.title, name)
  assert.equal(dom.window.document.querySelector('meta[name="dsh-branding-app-name"]').content, name)
  assert.equal(dom.window.document.querySelector('meta[name="dsh-branding-native-title"]').content, 'Product & "Research" <Lab>')
  assert.equal(dom.window.document.querySelectorAll('script').length, 0)
  dom.window.close()
})

test('blank app name leaves the served HTML byte-identical and missing title is untouched', () => {
  assert.equal(rewriteIndexTitle(original, ''), original)
  assert.equal(rewriteIndexTitle(original, ' \t\n '), original)
  assert.equal(rewriteIndexTitle('<html><head></head><body>Other document</body></html>', 'Brand'), '<html><head></head><body>Other document</body></html>')
})

test('index hook reads live configuration for each page and releases its registration', () => {
  let name = 'First'
  let inject
  let transform
  let registered = 0
  const cleanups = []
  const ctx = { inject: (names, callback) => {
    assert.deepEqual(names, ['webServer'])
    inject = callback
    return () => {}
  } }
  installTitleShell(ctx, { appName: { get: () => name } })
  assert.equal(transform, undefined)
  inject({
    effect: setup => { cleanups.push(setup()) },
    webServer: { tapIndex: callback => {
      registered++
      transform = callback
      return () => { registered--; transform = undefined }
    } },
  })
  assert.equal(registered, 1)
  assert.match(transform(original), /<title>First<\/title>/)
  name = 'Second'
  assert.match(transform(original), /<title>Second<\/title>/)
  name = ''
  assert.equal(transform(original), original)
  for (const cleanup of cleanups) cleanup()
  assert.equal(registered, 0)
})
