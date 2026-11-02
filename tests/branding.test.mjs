import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { installBranding } from '../src/branding.js'
import { createFavicon } from '../src/favicon.js'
import { isImageData, readImage, MAX_FILE_BYTES } from '../src/images.js'

const image = value => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24"><text y="20">${value}</text></svg>`).toString('base64')}`
const light = image('Day')
const dark = image('Night')
function fixture() {
  const dom = new JSDOM('<!doctype html><head><link rel="icon" href="/light.svg" media="(prefers-color-scheme: light)"><link rel="shortcut icon" href="/dark.svg" media="(prefers-color-scheme: dark)"><link rel="apple-touch-icon" href="/app.png"><link rel="manifest" href="/manifest.webmanifest"></head><body></body>')
  const document = dom.window.document
  const original = document.head.innerHTML
  const nodes = [...document.head.querySelectorAll('link')]
  let state = { status: 'ready', value: { favicon: '', lightBanner: '', darkBanner: '' }, writable: true, revision: 1 }
  let scheme = 'light'
  const subscriptions = new Set()
  const events = new Set()
  const disposers = []
  const entries = new Map()
  const form = { getSnapshot: () => state, subscribe: callback => { subscriptions.add(callback); return () => subscriptions.delete(callback) } }
  const ctx = {
    effect: setup => { const dispose = setup(); disposers.push(dispose); return dispose },
    on: (name, callback) => { assert.equal(name, 'theme/change'); events.add(callback); disposers.push(() => events.delete(callback)) },
    theme: { getTheme: () => ({ active: { colorScheme: scheme } }) },
    slots: {
      inject: (name, setup) => { assert.ok(['sidebar.brand.name', 'sidebar.brand.mark', 'conversation.hero.brand.mark'].includes(name)); const dispose = setup(); disposers.push(dispose); return dispose },
      register: (options, Component) => {
        assert.equal(options.priority, -1)
        assert.equal(entries.has(options.name), false)
        entries.set(options.name, Component)
        return () => { if (entries.get(options.name) === Component) entries.delete(options.name) }
      },
    },
  }
  const status = installBranding({ ctx, React: { createElement: (tag, props) => ({ tag, props }) }, document, form })
  return { document, original, nodes, entries, status,
    update(patch) { state = { ...state, value: { ...state.value, ...patch } }; for (const callback of subscriptions) callback() },
    unavailable() { state = { ...state, status: 'unavailable' }; for (const callback of subscriptions) callback() },
    theme(next) { scheme = next; for (const callback of events) callback() },
    banner: () => entries.get('sidebar.brand.name')?.().props,
    hero: () => entries.get('conversation.hero.brand.mark')?.().props,
    mark: size => entries.get('sidebar.brand.mark')?.({ size }).props,
    dispose() { for (const dispose of disposers.reverse()) dispose(); assert.equal(subscriptions.size, 0); assert.equal(events.size, 0); dom.window.close() },
  }
}

test('blank settings leave every native brand and favicon untouched', () => {
  const f = fixture()
  assert.equal(f.entries.size, 0)
  assert.ok(!f.document.querySelector('[data-dsh-branding]'))
  for (const node of f.nodes) assert.ok(node.isConnected)
  f.dispose()
  assert.equal(f.document.head.innerHTML, f.original)
})

test('light and dark banners are independent; blank night restores native brand', () => {
  const f = fixture()
  f.update({ lightBanner: light })
  assert.equal(f.banner().src, light)
  f.theme('dark')
  assert.equal(f.entries.size, 0)
  f.update({ darkBanner: dark })
  assert.equal(f.banner().src, dark)
  f.theme('light')
  assert.equal(f.banner().src, light)
  f.update({ lightBanner: '' })
  assert.equal(f.entries.size, 0)
  f.dispose()
})

test('favicon replaces both media-selected nodes, keeps PWA links, and restores identities and order', () => {
  const f = fixture()
  f.update({ favicon: light })
  assert.equal(f.document.querySelectorAll('link[rel="icon"]').length, 1)
  assert.equal(f.document.querySelector('link[rel="shortcut icon"]'), null)
  const custom = f.document.querySelector('[data-dsh-branding]')
  assert.equal(custom.href, light)
  assert.equal(custom.type, 'image/svg+xml')
  assert.equal(custom.hasAttribute('media'), false)
  assert.ok(f.nodes[2].isConnected && f.nodes[3].isConnected)
  f.update({ favicon: dark })
  assert.equal(custom.href, dark)
  f.update({ favicon: '' })
  assert.deepEqual([...f.document.head.querySelectorAll('link')], f.nodes)
  f.dispose()
  assert.equal(f.document.head.innerHTML, f.original)
})

test('unavailable settings and plugin unload restore accepted customizations', () => {
  for (const unavailable of [false, true]) {
    const f = fixture()
    f.update({ favicon: light, lightBanner: light })
    if (unavailable) f.unavailable()
    f.dispose()
    assert.equal(f.entries.size, 0)
    assert.equal(f.document.head.innerHTML, f.original)
  }
})

test('broken banner falls back; an obsolete image error cannot remove a newer banner', () => {
  const f = fixture()
  f.update({ lightBanner: light })
  const previous = f.banner()
  f.update({ lightBanner: dark })
  previous.onError()
  assert.equal(f.banner().src, dark)
  f.banner().onError()
  assert.equal(f.banner(), undefined)
  assert.equal(f.hero().src, dark, 'hero rendering is independent of a sidebar image error')
  assert.match(f.status.getSnapshot(), /恢复原图/)
  f.update({ lightBanner: light })
  assert.equal(f.banner().src, light)
  assert.equal(f.status.getSnapshot(), '')
  f.dispose()
})

test('invalid persisted URLs are never assigned and preserve valid independent fields', () => {
  const f = fixture()
  f.update({ favicon: 'javascript:alert(1)', lightBanner: light })
  assert.equal(f.document.querySelector('[data-dsh-branding]'), null)
  assert.equal(f.banner().src, light)
  assert.match(f.status.getSnapshot(), /配置无效/)
  f.update({ favicon: dark, lightBanner: 'https://example.com/not-an-upload' })
  assert.equal(f.banner(), undefined)
  assert.equal(f.mark().src, dark)
  assert.equal(f.document.querySelector('[data-dsh-branding]').href, dark)
  f.dispose()
})

test('sidebar image errors from an earlier occurrence of the same URL or after unload are ignored', () => {
  const f = fixture()
  f.update({ lightBanner: light, darkBanner: dark })
  const old = f.banner()
  f.theme('dark')
  f.theme('light')
  old.onError()
  assert.equal(f.banner().src, light)
  assert.equal(f.hero().src, light)
  assert.equal(f.status.getSnapshot(), '')
  const current = f.banner()
  f.dispose()
  current.onError()
  assert.equal(f.status.getSnapshot(), '')
})

test('configured favicon fills the native sidebar mark and clears independently of the banner', () => {
  const f = fixture()
  assert.equal(f.mark(), undefined)
  f.update({ favicon: light, lightBanner: dark })
  const registration = f.entries.get('sidebar.brand.mark')
  assert.equal(f.mark().src, light)
  assert.equal(f.mark().width, 24)
  assert.equal(f.mark().height, 24)
  assert.equal(f.mark(16).width, 16)
  assert.equal(f.mark().alt, '')
  assert.equal(f.mark().draggable, false)
  f.theme('dark')
  assert.equal(f.entries.get('sidebar.brand.mark'), registration)
  f.theme('light')
  f.update({ favicon: dark })
  assert.equal(f.mark().src, dark)
  assert.equal(f.banner().src, dark)
  f.update({ favicon: '' })
  assert.equal(f.mark(), undefined)
  assert.equal(f.banner().src, dark)
  f.dispose()
  assert.equal(f.entries.size, 0)
})

test('broken sidebar icons restore the native mark and obsolete errors cannot remove a fresh same-URL icon', () => {
  const f = fixture()
  f.update({ favicon: light })
  const stale = f.mark()
  f.update({ favicon: '' })
  f.update({ favicon: light })
  stale.onError()
  assert.equal(f.mark().src, light)
  f.mark().onError()
  assert.equal(f.mark(), undefined)
  assert.match(f.status.getSnapshot(), /侧栏图标无法加载.*恢复原图/)
  assert.equal(f.document.querySelector('[data-dsh-branding]').href, light)
  f.dispose()
})

test('favicon works on a page that originally had no tab icons', () => {
  const dom = new JSDOM('<!doctype html><head></head>')
  const icon = createFavicon(dom.window.document)
  icon.set(light)
  assert.equal(dom.window.document.querySelectorAll('link').length, 1)
  icon.dispose()
  icon.dispose()
  assert.equal(dom.window.document.head.innerHTML, '')
  dom.window.close()
})

test('image validation accepts only bounded supported inline image formats', () => {
  assert.ok(isImageData(''))
  assert.ok(isImageData(light))
  for (const value of [null, undefined, 123, 'javascript:alert(1)', 'data:text/html;base64,YQ==', 'https://example.com/a.png', `data:image/png;base64,${'a'.repeat(MAX_FILE_BYTES * 2)}`]) {
    assert.equal(isImageData(value), false)
  }
})

function uploadEnv({ fail = false, width = 120 } = {}) {
  return {
    FileReader: class { readAsDataURL() { this.result = light; this.onload() } },
    Image: class { naturalWidth = width; naturalHeight = 24; set src(value) { assert.equal(value, light); fail ? this.onerror() : this.onload() } },
  }
}
const file = { type: 'image/svg+xml', size: 100, name: 'banner.svg' }
test('uploads decode before saving and report corrupt images and oversized dimensions', async () => {
  assert.equal(await readImage(file, uploadEnv()), light)
  await assert.rejects(readImage(file, uploadEnv({ fail: true })), /无法解码/)
  await assert.rejects(readImage(file, uploadEnv({ width: 16385 })), /尺寸/)
  await assert.rejects(readImage({ ...file, size: MAX_FILE_BYTES + 1 }, uploadEnv()), /512 KiB/)
  await assert.rejects(readImage({ ...file, type: 'text/html' }, uploadEnv()), /支持/)
})

test('uploads and persisted data accept 512 KiB, while uploads reject one byte more', async () => {
  for (const size of [400 * 1024, 512 * 1024]) {
    assert.equal(await readImage({ ...file, size }, uploadEnv()), light)
    assert.ok(isImageData(`data:image/png;base64,${Buffer.alloc(size).toString('base64')}`))
  }
  await assert.rejects(readImage({ ...file, size: 512 * 1024 + 1 }, uploadEnv()), /512 KiB/)
})

test('zoom updates the visible mode in place and blank modes retain native layout', () => {
  const f = fixture()
  f.update({ lightBanner: light, lightBannerScale: 120, darkBanner: dark, darkBannerScale: 80 })
  const before = f.banner()
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-scale: 1\.2;/)
  f.update({ lightBannerScale: 130 })
  assert.equal(f.banner().src, before.src)
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-scale: 1\.3;/)
  f.theme('dark')
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-scale: 0\.8;/)
  f.update({ darkBanner: '' })
  assert.equal(f.entries.size, 0)
  f.theme('light')
  assert.equal(f.banner().src, light)
  f.update({ lightBannerScale: 999 })
  assert.equal(f.banner(), undefined)
  assert.equal(f.hero().src, light)
  assert.match(f.status.getSnapshot(), /配置无效/)
  f.dispose()
})

test('horizontal offsets default to zero, follow the visible mode and reject invalid configuration', () => {
  const f = fixture()
  f.update({ lightBanner: light })
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-offset: 0px;/)
  const before = f.banner()
  f.update({ lightBannerOffset: -15, lightBannerScale: 150, darkBanner: dark, darkBannerOffset: 10 })
  assert.equal(f.banner().src, before.src)
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-offset: -15px;/)
  f.theme('dark')
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-offset: 10px;/)
  f.update({ darkBannerOffset: 0 })
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-offset: 0px;/)
  f.theme('light')
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-offset: -15px;/)
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-scale: 1\.5;/)
  f.update({ lightBannerOffset: 3 })
  assert.equal(f.banner(), undefined)
  assert.equal(f.hero().src, light)
  assert.match(f.status.getSnapshot(), /配置无效/)
  f.update({ lightBannerOffset: 0 })
  assert.equal(f.banner().src, light)
  f.dispose()
})

test('hero uses the shared mode image with independent zoom and position, including older configs', () => {
  const f = fixture()
  f.update({ lightBanner: light, darkBanner: dark, lightBannerScale: 150, lightBannerOffset: 20 })
  assert.equal(f.hero().src, light)
  const registration = f.entries.get('conversation.hero.brand.mark')
  let css = f.document.querySelector('style').textContent
  assert.match(css, /--dsh-branding-hero-scale: 1;/)
  assert.match(css, /--dsh-branding-hero-offset: 0px;/)
  f.update({ lightHeroScale: 120, lightHeroOffset: -15, darkHeroScale: 80, darkHeroOffset: 10 })
  assert.equal(f.entries.get('conversation.hero.brand.mark'), registration, 'position changes do not remount the image')
  css = f.document.querySelector('style').textContent
  assert.match(css, /--dsh-branding-scale: 1\.5;/)
  assert.match(css, /--dsh-branding-offset: 20px;/)
  assert.match(css, /--dsh-branding-hero-scale: 1\.2;/)
  assert.match(css, /--dsh-branding-hero-offset: -15px;/)
  f.theme('dark')
  assert.equal(f.hero().src, dark)
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-hero-scale: 0\.8;/)
  assert.match(f.document.querySelector('style').textContent, /--dsh-branding-hero-offset: 10px;/)
  f.update({ darkBanner: '' })
  assert.equal(f.hero(), undefined)
  f.theme('light')
  assert.equal(f.hero().src, light)
  f.dispose()
  assert.equal(f.entries.size, 0)
})

test('invalid hero transforms restore only hero artwork and recover after correction', () => {
  const f = fixture()
  f.update({ lightBanner: light, lightHeroScale: 999 })
  assert.equal(f.hero(), undefined)
  assert.equal(f.banner().src, light)
  assert.match(f.status.getSnapshot(), /配置无效/)
  f.update({ lightHeroScale: 100, lightHeroOffset: 3 })
  assert.equal(f.hero(), undefined)
  f.update({ lightHeroOffset: 0 })
  assert.equal(f.hero().src, light)
  assert.equal(f.status.getSnapshot(), '')
  f.unavailable()
  assert.equal(f.hero(), undefined)
  f.dispose()
})

test('hero image failures restore the native outlet and ignore stale callbacks even for reused URLs', () => {
  const f = fixture()
  f.update({ lightBanner: light })
  const stale = f.hero()
  f.update({ lightBanner: '' })
  f.update({ lightBanner: light })
  stale.onError()
  assert.equal(f.hero().src, light)
  const current = f.hero()
  current.onError()
  assert.equal(f.hero(), undefined)
  assert.equal(f.banner().src, light)
  assert.match(f.status.getSnapshot(), /主界面横幅无法加载.*恢复原图/)
  f.update({ lightBanner: dark })
  assert.equal(f.hero().src, dark)
  assert.equal(f.status.getSnapshot(), '')
  f.dispose()
  current.onError()
  assert.equal(f.entries.size, 0)
})

test('successful hero retry clears its own failure without clearing another field warning', () => {
  const f = fixture()
  f.update({ lightBanner: light })
  const failed = f.hero()
  failed.onError()
  f.update({ lightHeroScale: 110 })
  failed.onLoad()
  assert.match(f.status.getSnapshot(), /主界面横幅无法加载/)
  f.hero().onLoad()
  assert.equal(f.status.getSnapshot(), '')
  f.hero().onError()
  f.update({ lightHeroScale: 120, favicon: 'invalid' })
  f.hero().onLoad()
  assert.match(f.status.getSnapshot(), /品牌配置无效/)
  f.dispose()
})
