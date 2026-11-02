/** Offline Chromium checks with actual sidebar CSS from both pinned releases. */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { bundleClient } from './bundle.mjs'
import { RELEASES, source } from './check-compatibility.mjs'
import { rewriteIndexTitle } from '../src/host/title-shell.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const bundle = await bundleClient(root)
const browser = await puppeteer.launch({
  executablePath: process.env.DSH_BRANDING_BROWSER_EXECUTABLE || '/tmp/vcp-html-browser/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true,
  args: ['--disable-dev-shm-usage'],
})
const svg = (label, width = 140, height = 24, fill = '#4667d5') => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" rx="4" fill="${fill}"/><text x="8" y="17" fill="white" font-size="15">${label}</text></svg>`).toString('base64')}`
const images = {
  light: svg('DAY'), dark: svg('NIGHT', 140, 24, '#6875b9'),
  square: svg('S', 24), long: svg('WIDE', 600), icon: svg('V', 24), iconAlt: svg('A', 24, 24, '#bf5141'),
}
// The 0.1.1 sidebar rules, retained here as a focused reproduction of the reported layout.
const previousBannerCss = `
span:has(> [data-slot="sidebar.brand.mark"]):has(+ span > [data-slot="sidebar.brand.name"] > .dsh-branding-banner) { display: none; }
.dsh-branding-banner { display: block; height: 24px; width: auto; min-width: 0; max-width: 160px; object-fit: contain; object-position: left center; pointer-events: none; }
`

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1.01,
  `${message}: expected ${expected}, got ${actual}`)

async function checkCustomMarks(page, source, context, expandedVisible = true) {
  // The native rail temporarily hides its resting mark while the pointer is over its toggle.
  await page.mouse.move(700, 500)
  await page.waitForFunction(expected => {
    const marks = [...document.querySelectorAll('[data-slot="sidebar.brand.mark"] > img.dsh-branding-mark')]
    return marks.length === 2 && marks.every(img => img.src === expected && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
  }, {}, source)
  const marks = await page.evaluate(() => [...document.querySelectorAll('[data-slot="sidebar.brand.mark"] > img.dsh-branding-mark')].map(img => ({
    src: img.src, alt: img.getAttribute('alt'), width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
    naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, objectFit: getComputedStyle(img).objectFit,
  })))
  assert.equal(marks.length, 2, `${context}: both brand-mark occurrences rendered`)
  for (const [index, mark] of marks.entries()) {
    assert.equal(mark.src, source, `${context}: mark uses the configured favicon`)
    assert.equal(mark.alt, '', `${context}: mark is decorative`)
    assert.equal(mark.naturalWidth, 24, `${context}: source width`)
    assert.equal(mark.naturalHeight, 24, `${context}: source height`)
    assert.equal(mark.objectFit, 'contain', `${context}: aspect ratio is contained`)
    if (index === 0 && !expandedVisible) continue
    near(mark.width, 24, `${context}: rendered mark width`)
    near(mark.height, 24, `${context}: rendered mark height`)
  }
}

async function nativeGeometry(page) {
  return page.evaluate(() => {
    const rect = node => node.getBoundingClientRect().toJSON()
    return {
      brand: rect(document.getElementById('brand-row').firstElementChild),
      mark: rect(document.getElementById('expanded-mark')),
      name: rect(document.getElementById('brand-name').parentElement),
      toggle: rect(document.getElementById('collapse')),
      markDisplay: getComputedStyle(document.getElementById('expanded-mark')).display,
    }
  })
}

function sameRect(actual, expected, context) {
  for (const key of ['x', 'y', 'width', 'height']) near(actual[key], expected[key], `${context} ${key}`)
}

async function bannerGeometry(page, image) {
  await page.waitForFunction(expected => {
    const img = document.querySelector('.dsh-branding-banner')
    return img?.src === expected && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
  }, {}, image)
  return page.evaluate(() => {
    const rect = node => node.getBoundingClientRect().toJSON()
    const img = document.querySelector('.dsh-branding-banner')
    const box = rect(img)
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight)
    const width = img.naturalWidth * scale
    const height = img.naturalHeight * scale
    const paint = {
      left: box.left + (box.width - width) / 2,
      top: box.top + (box.height - height) / 2,
      width, height,
    }
    paint.right = paint.left + width
    paint.bottom = paint.top + height
    const style = getComputedStyle(img)
    const row = document.getElementById('brand-row')
    const toggle = document.getElementById('collapse')
    const rowRect = rect(row)
    const fixedToggle = getComputedStyle(toggle).position === 'fixed'
    const inlineToggle = toggle.parentElement === row && !fixedToggle
    const left = rowRect.left + (fixedToggle ? 36 : 0)
    const right = rowRect.right - (inlineToggle ? 36 : 0)
    return {
      box, paint, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      fit: style.objectFit, position: style.objectPosition,
      row: rowRect, available: { left, right, width: right - left },
      root: rect(document.getElementById('expanded')),
      brand: rect(row.firstElementChild),
      toggle: rect(toggle),
      mark: getComputedStyle(document.getElementById('expanded-mark')).display,
    }
  })
}

function checkBanner(metrics, context) {
  const { box, paint, row, available, toggle } = metrics
  assert.equal(metrics.mark, 'none', `${context}: expanded native mark hidden`)
  assert.equal(metrics.fit, 'contain', `${context}: preserve aspect ratio`)
  assert.equal(metrics.position, '50% 50%', `${context}: center artwork within the image box`)
  near(box.width, available.width, `${context}: use the width remaining beside the toggle`)
  near(box.height, row.height, `${context}: use the header height`)
  near(paint.width / paint.height, metrics.naturalWidth / metrics.naturalHeight, `${context}: image aspect ratio`)
  near(paint.left + paint.width / 2, (available.left + available.right) / 2,
    `${context}: centered in the remaining header space`)
  near(paint.top + paint.height / 2, row.top + row.height / 2, `${context}: vertical row center`)
  assert.ok(paint.left >= row.left - 1.01 && paint.right <= row.right + 1.01
    && paint.top >= row.top - 1.01 && paint.bottom <= row.bottom + 1.01, `${context}: artwork stays inside header`)
  const overlapsToggle = paint.left < toggle.right && paint.right > toggle.left
    && paint.top < toggle.bottom && paint.bottom > toggle.top
  assert.equal(overlapsToggle, false, `${context}: artwork does not cover the toggle`)
  const possibleHeight = Math.min(row.height, available.width * metrics.naturalHeight / metrics.naturalWidth)
  if (possibleHeight > 25) assert.ok(paint.height > 24, `${context}: artwork uses space beyond the former 24px cap`)
  if (available.width > 161 && metrics.naturalWidth / metrics.naturalHeight > available.width / row.height) {
    assert.ok(paint.width > 160, `${context}: wide artwork uses space beyond the former 160px cap`)
  }
}

function checkOffset(actual, baseline, offset, context) {
  near((actual.paint.left + actual.paint.width / 2) - (baseline.paint.left + baseline.paint.width / 2), offset,
    `${context}: painted horizontal displacement`)
  near(actual.brand.x - baseline.brand.x, offset, `${context}: brand container moves with artwork`)
  near(actual.paint.top + actual.paint.height / 2, baseline.paint.top + baseline.paint.height / 2,
    `${context}: vertical center stays fixed`)
  near(actual.paint.width, baseline.paint.width, `${context}: painted width does not change`)
  near(actual.paint.height, baseline.paint.height, `${context}: painted height does not change`)
  near(actual.brand.width, baseline.brand.width, `${context}: brand frame width stays fixed`)
  near(actual.brand.height, baseline.brand.height, `${context}: brand frame height stays fixed`)
  sameRect(actual.row, baseline.row, `${context}: header stays fixed`)
  sameRect(actual.toggle, baseline.toggle, `${context}: toggle stays fixed`)
}

let requests = 0
try {
  for (const [version, commit] of RELEASES) {
    const css = (await source(commit, 'packages/client/ui-sidebar/src/client/SidebarRoot.module.css'))
      .replace(/:global\(([^)]+)\)/g, '$1')
    const page = await browser.newPage()
    await page.setOfflineMode(true)
    await page.setRequestInterception(true)
    page.on('request', request => {
      if (/^https?:/.test(request.url())) { requests++; void request.abort() }
      else void request.continue()
    })
    await page.setContent(`<!doctype html><html><head><title>DeepSeek Harness</title>
      <link rel="icon" href="${images.icon}" media="(prefers-color-scheme: light)">
      <link rel="icon" href="${images.icon}" media="(prefers-color-scheme: dark)">
      <link rel="apple-touch-icon" href="${images.icon}">
      <style>:root { --dsw-alias-label-primary:#242629; --dsw-alias-border-l2:#ddd; } body { margin:20px; } ${css}</style>
      </head><body><div class="root" id="expanded" style="width:264px;height:200px">
      <div class="logoRow" id="brand-row" data-window-drag><button class="brand wide" id="new-session" aria-label="新建会话"><span class="brandIdentity" aria-hidden="true">
      <span class="brandMark" id="expanded-mark"><div data-slot="sidebar.brand.mark" style="display:contents"><img width="24" height="24" src="${images.icon}"></div></span>
      <span class="brandName"><div id="brand-name" data-slot="sidebar.brand.name" style="display:contents"><span id="native-name">DSH</span></div></span>
      </span></button><button class="iconButton toggle" id="collapse" aria-label="收起侧栏">≡</button></div></div>
      <div class="root collapsed" style="height:100px"><div class="logoRow" data-window-drag><button class="iconButton toggle" id="expand" aria-label="展开侧栏"><span class="railMark" id="rail-mark"><div data-slot="sidebar.brand.mark" style="display:contents"><img id="rail-image" width="24" height="24" src="${images.icon}"></div></span><svg class="panelIcon" id="rail-panel-icon" width="18" height="18" aria-hidden="true"></svg></button></div></div>
      </body></html>`)
    await page.evaluate(() => {
      const disposers = []
      const listeners = new Set()
      const events = new Set()
      const sessionListeners = new Set()
      const panelListeners = new Set()
      let sessionState = { byId: {} }
      let panelState = { activePanelId: null }
      let state = { status: 'ready', value: { favicon: '', lightBanner: '', darkBanner: '' }, writable: true, revision: 1 }
      let scheme = 'light'
      const nameSlot = document.getElementById('brand-name')
      const nativeName = document.getElementById('native-name')
      const markSlots = [...document.querySelectorAll('[data-slot="sidebar.brand.mark"]')]
      const nativeMarkNodes = markSlots.map(slot => [...slot.childNodes])
      const originalIcons = [...document.querySelectorAll('link')]
      let newSessions = 0
      let toggles = 0
      document.getElementById('new-session').onclick = () => { newSessions++ }
      for (const id of ['collapse', 'expand']) document.getElementById(id).onclick = () => { toggles++ }
      function setCanStartSession(allowed) {
        const old = document.getElementById('brand-row').firstElementChild
        const brand = document.createElement(allowed ? 'button' : 'span')
        brand.className = old.className
        brand.id = allowed ? 'new-session' : 'brand-no-session'
        if (allowed) {
          brand.type = 'button'
          brand.setAttribute('aria-label', '新建会话')
          brand.onclick = () => { newSessions++ }
        }
        brand.replaceChildren(...old.childNodes)
        old.replaceWith(brand)
      }
      const React = { createElement: (tag, props) => {
        const node = document.createElement(tag)
        for (const [key, value] of Object.entries(props)) {
          if (key === 'onError') node.onerror = value
          else if (key === 'className') node.className = value
          else if (key === 'style' && value && typeof value === 'object') {
            for (const [property, setting] of Object.entries(value)) {
              const normalized = typeof setting === 'number' && ['width', 'height'].includes(property) ? `${setting}px` : String(setting)
              if (property.startsWith('--')) node.style.setProperty(property, normalized)
              else node.style[property] = normalized
            }
          }
          else node.setAttribute(key, value)
        }
        return node
      } }
      const form = { getSnapshot: () => state, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback) } }
      const ctx = {
        configForms: { get: id => { if (id !== 'dsh-branding') throw new Error(id); return form } },
        effect: setup => { const dispose = setup(); disposers.push(dispose); return dispose },
        on: (name, callback) => { events.add(callback); disposers.push(() => events.delete(callback)) },
        theme: { getTheme: () => ({ active: { colorScheme: scheme } }) },
        sessions: { list: { getSnapshot: () => sessionState,
          subscribe: listener => { sessionListeners.add(listener); return () => sessionListeners.delete(listener) },
        } },
        layout: { panelInfo: { getSnapshot: () => panelState,
          subscribe: listener => { panelListeners.add(listener); return () => panelListeners.delete(listener) },
        } },
        slots: {
          inject: (name, setup) => { const dispose = setup(); disposers.push(dispose); return dispose },
          register: (options, Component) => {
            if (!['sidebar.brand.name', 'sidebar.brand.mark'].includes(options.name)) return () => {}
            if (options.priority !== -1) throw new Error('Unexpected slot priority')
            if (options.name === 'sidebar.brand.name') {
              const node = Component()
              nameSlot.replaceChildren(node)
              return () => { if (nameSlot.contains(node)) nameSlot.replaceChildren(nativeName) }
            }
            const nodes = markSlots.map(slot => {
              const node = Component({ size: 24 })
              slot.replaceChildren(node)
              return node
            })
            return () => markSlots.forEach((slot, index) => {
              if (slot.contains(nodes[index])) slot.replaceChildren(...nativeMarkNodes[index])
            })
          },
        },
      }
      window.__ModuleLoader__ = { load: entry => entry.factory(name => {
        if (name !== 'react') throw new Error(name)
        return React
      }).apply(ctx) }
      window.brandingTest = {
        update(patch) { state = { ...state, value: { ...state.value, ...patch }, revision: state.revision + 1 }; for (const listener of listeners) listener() },
        theme(next) { scheme = next; document.body.toggleAttribute('data-ds-dark-theme', next === 'dark'); for (const callback of events) callback() },
        originalIcons, counts: () => ({ newSessions, toggles }), setCanStartSession,
        nativeMarksRestored: () => markSlots.every((slot, index) => slot.childNodes.length === nativeMarkNodes[index].length
          && nativeMarkNodes[index].every((node, i) => slot.childNodes[i] === node)),
        topic(title) {
          sessionState = { byId: title === undefined ? {} : { current: { id: 'current', title, retainedBy: { mainView: 1 } } } }
          for (const listener of sessionListeners) listener()
          document.title = title === undefined ? 'DeepSeek Harness' : `${title} — DeepSeek Harness`
        },
        panel(id) {
          panelState = { activePanelId: id }
          for (const listener of panelListeners) listener()
          const topic = sessionState.byId.current?.title
          document.title = id !== null || topic === undefined ? 'DeepSeek Harness' : `${topic} — DeepSeek Harness`
        },
        setDarwin(enabled) {
          const row = document.getElementById('brand-row')
          const toggle = document.getElementById('collapse')
          if (enabled) {
            document.documentElement.dataset.platform = 'darwin'
            const strip = document.createElement('div')
            strip.className = 'topStrip'
            strip.id = 'top-strip'
            strip.setAttribute('data-window-drag', '')
            strip.append(toggle)
            row.before(strip)
            setCanStartSession(false)
          } else {
            delete document.documentElement.dataset.platform
            row.append(toggle)
            document.getElementById('top-strip')?.remove()
            setCanStartSession(true)
          }
        },
        dispose() { for (const dispose of disposers.reverse()) dispose(); return listeners.size === 0 && events.size === 0 && sessionListeners.size === 0 && panelListeners.size === 0 },
      }
    })
    await page.addScriptTag({ content: bundle })
    assert.equal(await page.$('.dsh-branding-banner'), null, `${version}: initial native brand`)
    await page.mouse.move(700, 500)
    const rail = await page.$eval('#rail-image', node => node.getBoundingClientRect().toJSON())
    near(rail.width, 24, `${version}: native rail width`)
    const blankNative = await nativeGeometry(page)
    assert.ok(await page.evaluate(() => brandingTest.nativeMarksRestored()), `${version}: original mark nodes start in place`)

    // The favicon occupies both native mark slots when there is no full banner.
    await page.evaluate(icon => brandingTest.update({ favicon: icon }), images.icon)
    await checkCustomMarks(page, images.icon, `${version}: favicon marks`)
    assert.notEqual(await page.$eval('#expanded-mark', node => getComputedStyle(node).display), 'none',
      `${version}: expanded favicon mark stays visible without a banner`)
    assert.equal(await page.$eval('#brand-name', node => node.textContent), 'DSH', `${version}: native name stays visible`)
    await page.hover('#expand')
    const swapsOnHover = !css.includes('@media (hover: hover)') || await page.evaluate(() => matchMedia('(hover: hover)').matches)
    const hoverMark = await page.$eval('#rail-mark', node => getComputedStyle(node).display)
    const hoverHint = await page.$eval('#rail-panel-icon', node => getComputedStyle(node).display)
    if (swapsOnHover) {
      assert.equal(hoverMark, 'none', `${version}: native hover hides the mark`)
      assert.notEqual(hoverHint, 'none', `${version}: native hover reveals the expand icon`)
    } else {
      assert.notEqual(hoverMark, 'none', `${version}: native non-hover media keeps the mark`)
      assert.equal(hoverHint, 'none', `${version}: native non-hover media keeps the hint hidden`)
    }
    const beforeMarkExpand = await page.evaluate(() => brandingTest.counts())
    await page.click('#expand')
    const afterMarkExpand = await page.evaluate(() => brandingTest.counts())
    assert.equal(afterMarkExpand.toggles, beforeMarkExpand.toggles + 1, `${version}: rail remains clickable`)
    await page.mouse.move(700, 500)
    await page.evaluate(icon => brandingTest.update({ favicon: icon }), images.iconAlt)
    await checkCustomMarks(page, images.iconAlt, `${version}: changed favicon marks`)
    assert.equal(await page.$eval('link[rel="icon"]', node => node.href), images.iconAlt, `${version}: tab icon changes with the mark`)
    await page.evaluate(() => brandingTest.update({ favicon: '' }))
    assert.equal(await page.$$eval('.dsh-branding-mark', nodes => nodes.length), 0, `${version}: clearing removes custom marks`)
    assert.ok(await page.evaluate(() => brandingTest.nativeMarksRestored()), `${version}: clearing restores the original mark nodes`)
    const afterMarkClear = await nativeGeometry(page)
    for (const key of ['brand', 'mark', 'name', 'toggle']) sameRect(afterMarkClear[key], blankNative[key], `${version}: blank native ${key}`)

    // Reproduce the old result against the same host CSS before testing the fix.
    await page.evaluate(({ image, icon, css }) => {
      brandingTest.update({ lightBanner: image, favicon: icon })
      const style = [...document.head.querySelectorAll('style')].find(node => node.textContent.includes('.dsh-branding-banner'))
      if (!style) throw new Error('branding stylesheet not found')
      window.previousBrandingStyle = { style, text: style.textContent }
      style.textContent = css
    }, { image: images.light, icon: images.icon, css: previousBannerCss })
    const old = await bannerGeometry(page, images.light)
    near(old.box.height, 24, `${version}: 0.1.1 reproduced small height`)
    assert.ok(Math.abs(old.box.left + old.box.width / 2 - (old.available.left + old.available.right) / 2) > 10,
      `${version}: 0.1.1 reproduced horizontal offset`)
    await page.evaluate(() => {
      previousBrandingStyle.style.textContent = previousBrandingStyle.text
      delete window.previousBrandingStyle
    })
    const defaultOffset = await bannerGeometry(page, images.light)
    checkBanner(defaultOffset, `${version}: restored current style`)
    await checkCustomMarks(page, images.icon, `${version}: favicon while full banner is active`, false)
    await page.evaluate(() => brandingTest.update({ lightBannerOffset: 0 }))
    const explicitZero = await bannerGeometry(page, images.light)
    checkOffset(explicitZero, defaultOffset, 0, `${version}: missing offset defaults to zero`)
    assert.equal(await page.$$eval('link[rel="icon"]', nodes => nodes.length), 1)

    for (const width of [264, 400, 180]) {
      await page.evaluate(width => {
        document.getElementById('expanded').style.width = `${width}px`
        brandingTest.update({ lightBanner: '' })
      }, width)
      const native = await nativeGeometry(page)
      assert.notEqual(native.markDisplay, 'none', `${version}/${width}: native mark visible`)
      for (const [label, image] of [['wide', images.light], ['square', images.square], ['long', images.long]]) {
        await page.evaluate(image => brandingTest.update({ lightBanner: image }), image)
        const metrics = await bannerGeometry(page, image)
        checkBanner(metrics, `${version}/${width}/${label}`)
        sameRect(metrics.toggle, native.toggle, `${version}/${width}/${label}: toggle stays in place`)
        if (label === 'wide') {
          const before = await page.evaluate(() => brandingTest.counts())
          await page.click('#new-session')
          await page.click('#collapse')
          const after = await page.evaluate(() => brandingTest.counts())
          assert.deepEqual(after, { newSessions: before.newSessions + 1, toggles: before.toggles + 1 },
            `${version}/${width}: brand and toggle remain clickable`)
        }
        await page.evaluate(() => brandingTest.update({ lightBanner: '' }))
        assert.equal(await page.$('.dsh-branding-banner'), null, `${version}/${width}/${label}: clear restores native`)
        const restored = await nativeGeometry(page)
        assert.notEqual(restored.markDisplay, 'none')
        for (const key of ['brand', 'mark', 'name', 'toggle']) sameRect(restored[key], native[key], `${version}/${width}/${label}: native ${key}`)
      }
    }

    // Zoom changes the painted size, not only the label, and keeps the same center.
    await page.evaluate(image => {
      document.getElementById('expanded').style.width = '400px'
      brandingTest.update({ lightBanner: image, lightBannerScale: 100, darkBanner: image, darkBannerScale: 80 })
    }, images.square)
    const zoomBase = await bannerGeometry(page, images.square)
    for (const percentage of [110, 150, 50]) {
      await page.evaluate(scale => brandingTest.update({ lightBannerScale: scale }), percentage)
      const zoomed = await bannerGeometry(page, images.square)
      near(zoomed.paint.width, zoomBase.paint.width * percentage / 100, `${version}/${percentage}%: painted width follows zoom`)
      near(zoomed.paint.height, zoomBase.paint.height * percentage / 100, `${version}/${percentage}%: painted height follows zoom`)
      near(zoomed.paint.left + zoomed.paint.width / 2, (zoomed.available.left + zoomed.available.right) / 2,
        `${version}/${percentage}%: centered beside the toggle`)
      near(zoomed.paint.top + zoomed.paint.height / 2, zoomed.row.top + zoomed.row.height / 2, `${version}/${percentage}%: centered vertically`)
      assert.ok(zoomed.paint.top >= zoomed.row.top - 1.01 && zoomed.paint.bottom <= zoomed.row.bottom + 1.01,
        `${version}/${percentage}%: header grows to fit vertical zoom`)
    }
    await page.evaluate(() => brandingTest.theme('dark'))
    near((await bannerGeometry(page, images.square)).paint.height, zoomBase.paint.height * .8, `${version}: dark zoom is independent`)
    await page.evaluate(() => brandingTest.theme('light'))
    near((await bannerGeometry(page, images.square)).paint.height, zoomBase.paint.height * .5, `${version}: light zoom persists`)

    // Each offset step moves the whole brand frame by exactly 5px at every zoom.
    for (const percentage of [50, 100, 150]) {
      await page.evaluate(scale => brandingTest.update({ lightBannerScale: scale, lightBannerOffset: 0 }), percentage)
      const zero = await bannerGeometry(page, images.square)
      for (const offset of [-5, 5]) {
        await page.evaluate(value => brandingTest.update({ lightBannerOffset: value }), offset)
        const shifted = await bannerGeometry(page, images.square)
        checkOffset(shifted, zero, offset, `${version}/${percentage}%/${offset}px`)
        const before = await page.evaluate(() => brandingTest.counts())
        await page.click('#new-session')
        await page.click('#collapse')
        const after = await page.evaluate(() => brandingTest.counts())
        assert.deepEqual(after, { newSessions: before.newSessions + 1, toggles: before.toggles + 1 },
          `${version}/${percentage}%/${offset}px: brand and toggle remain clickable`)
      }
    }

    // At either offset limit the translated frame can cross the control; the control must still win clicks.
    await page.evaluate(() => brandingTest.update({ lightBannerScale: 100, lightBannerOffset: 0 }))
    const offsetBase = await bannerGeometry(page, images.square)
    for (const offset of [-200, 200]) {
      await page.evaluate(value => brandingTest.update({ lightBannerOffset: value }), offset)
      const shifted = await bannerGeometry(page, images.square)
      checkOffset(shifted, offsetBase, offset, `${version}/${offset}px limit`)
      const before = await page.evaluate(() => brandingTest.counts())
      await page.click('#collapse')
      const after = await page.evaluate(() => brandingTest.counts())
      assert.equal(after.toggles, before.toggles + 1, `${version}/${offset}px: toggle remains clickable`)
    }

    // Light and dark offsets and their reset values remain independent across theme switches.
    await page.evaluate(() => brandingTest.update({
      lightBannerScale: 100, darkBannerScale: 100, lightBannerOffset: 0, darkBannerOffset: 0,
    }))
    const lightZero = await bannerGeometry(page, images.square)
    await page.evaluate(() => brandingTest.update({ lightBannerOffset: 5, darkBannerOffset: -5 }))
    checkOffset(await bannerGeometry(page, images.square), lightZero, 5, `${version}: light offset`)
    await page.evaluate(() => brandingTest.theme('dark'))
    const darkShifted = await bannerGeometry(page, images.square)
    await page.evaluate(() => brandingTest.update({ darkBannerOffset: 0 }))
    const darkZero = await bannerGeometry(page, images.square)
    checkOffset(darkShifted, darkZero, -5, `${version}: dark offset independent of light`)
    await page.evaluate(() => { brandingTest.update({ darkBannerOffset: -5 }); brandingTest.theme('light') })
    checkOffset(await bannerGeometry(page, images.square), lightZero, 5, `${version}: light offset persists`)
    await page.evaluate(() => brandingTest.update({ lightBannerOffset: 0 }))
    checkOffset(await bannerGeometry(page, images.square), lightZero, 0, `${version}: light reset`)
    await page.evaluate(() => brandingTest.theme('dark'))
    checkOffset(await bannerGeometry(page, images.square), darkZero, -5, `${version}: dark offset survives light reset`)
    await page.evaluate(() => brandingTest.update({ darkBannerOffset: 0 }))
    checkOffset(await bannerGeometry(page, images.square), darkZero, 0, `${version}: dark reset`)
    await page.evaluate(() => {
      brandingTest.theme('light')
      brandingTest.update({
        lightBanner: '', darkBanner: '', lightBannerScale: 100, darkBannerScale: 100,
        lightBannerOffset: 0, darkBannerOffset: 0,
      })
    })

    // The same slot is a span on macOS and when alpha.2 cannot start a session.
    await page.evaluate(() => {
      document.getElementById('expanded').style.width = '264px'
      brandingTest.setCanStartSession(false)
    })
    const nativeSpan = await nativeGeometry(page)
    await page.evaluate(image => brandingTest.update({ lightBanner: image }), images.light)
    checkBanner(await bannerGeometry(page, images.light), `${version}: non-interactive span brand`)
    const beforeSpan = await page.evaluate(() => brandingTest.counts())
    await page.click('#collapse')
    const afterSpan = await page.evaluate(() => brandingTest.counts())
    assert.deepEqual(afterSpan, { newSessions: beforeSpan.newSessions, toggles: beforeSpan.toggles + 1 })
    await page.evaluate(() => brandingTest.update({ lightBanner: '' }))
    const restoredSpan = await nativeGeometry(page)
    for (const key of ['brand', 'mark', 'name', 'toggle']) sameRect(restoredSpan[key], nativeSpan[key], `${version}: native span ${key}`)
    await page.evaluate(() => brandingTest.setCanStartSession(true))

    // Windows fixes the toggle to the left caption area and shortens the row.
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-windows-titlebar', '')
      document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px')
    })
    const nativeWindows = await nativeGeometry(page)
    await page.evaluate(image => brandingTest.update({ lightBanner: image }), images.square)
    const windows = await bannerGeometry(page, images.square)
    near(windows.row.height, 40, `${version}: Windows header height`)
    checkBanner(windows, `${version}: Windows titlebar`)
    sameRect(windows.toggle, nativeWindows.toggle, `${version}: Windows toggle stays in place`)
    for (const offset of [-200, -5, 5]) {
      await page.evaluate(value => brandingTest.update({ lightBannerOffset: value }), offset)
      checkOffset(await bannerGeometry(page, images.square), windows, offset, `${version}: Windows ${offset}px`)
      const beforeWindows = await page.evaluate(() => brandingTest.counts())
      await page.click('#collapse')
      const afterWindows = await page.evaluate(() => brandingTest.counts())
      assert.equal(afterWindows.toggles, beforeWindows.toggles + 1, `${version}: Windows toggle remains clickable at ${offset}px`)
    }
    await page.evaluate(() => {
      brandingTest.update({ lightBanner: '', lightBannerOffset: 0 })
      document.documentElement.removeAttribute('data-windows-titlebar')
      document.documentElement.style.removeProperty('--dsh-windows-titlebar-height')
    })

    // macOS keeps the toggle in a separate top strip and uses a span for the brand.
    await page.evaluate(() => brandingTest.setDarwin(true))
    const nativeDarwin = await nativeGeometry(page)
    await page.evaluate(image => brandingTest.update({ lightBanner: image }), images.light)
    const darwin = await bannerGeometry(page, images.light)
    checkBanner(darwin, `${version}: macOS top strip`)
    sameRect(darwin.toggle, nativeDarwin.toggle, `${version}: macOS toggle stays in place`)
    for (const offset of [-5, 5, 200]) {
      await page.evaluate(value => brandingTest.update({ lightBannerOffset: value }), offset)
      checkOffset(await bannerGeometry(page, images.light), darwin, offset, `${version}: macOS ${offset}px`)
      const beforeDarwin = await page.evaluate(() => brandingTest.counts())
      await page.click('#collapse')
      const afterDarwin = await page.evaluate(() => brandingTest.counts())
      assert.equal(afterDarwin.toggles, beforeDarwin.toggles + 1, `${version}: macOS toggle remains clickable at ${offset}px`)
    }
    await page.evaluate(() => { brandingTest.update({ lightBanner: '', lightBannerOffset: 0 }); brandingTest.setDarwin(false) })

    await page.evaluate(images => brandingTest.update({ lightBanner: images.light, favicon: images.icon }), images)
    await page.evaluate(() => brandingTest.theme('dark'))
    assert.equal(await page.$('.dsh-branding-banner'), null, `${version}: blank dark banner restores native`)
    assert.notEqual(await page.$eval('#expanded-mark', node => getComputedStyle(node).display), 'none')
    await page.evaluate(images => brandingTest.update({ darkBanner: images.dark }), images)
    assert.equal(await page.$eval('.dsh-branding-banner', node => node.src), images.dark)
    checkBanner(await bannerGeometry(page, images.dark), `${version}: dark banner`)
    await page.evaluate(() => brandingTest.theme('light'))
    checkBanner(await bannerGeometry(page, images.light), `${version}: return to light banner`)
    await page.screenshot({ path: `/tmp/dsh-branding-layout-${version}.png` })
    await page.mouse.move(700, 500)
    const railAfter = await page.$eval('#expand [data-slot="sidebar.brand.mark"] > img.dsh-branding-mark', node => node.getBoundingClientRect().toJSON())
    sameRect(railAfter, rail, `${version}: custom collapsed mark keeps native rail geometry`)
    const beforeExpand = await page.evaluate(() => brandingTest.counts())
    await page.click('#expand')
    const afterExpand = await page.evaluate(() => brandingTest.counts())
    assert.equal(afterExpand.toggles, beforeExpand.toggles + 1, `${version}: collapsed expand remains clickable`)
    await page.evaluate(() => brandingTest.update({ lightBanner: '', darkBanner: '', favicon: '', appName: '我的工作台' }))
    await page.waitForFunction(() => document.title === '我的工作台')
    await page.evaluate(() => brandingTest.topic('话题 — 测试'))
    await page.waitForFunction(() => document.title === '话题 — 测试 — 我的工作台')
    await page.evaluate(() => brandingTest.topic('DeepSeek Harness — 资料'))
    await page.waitForFunction(() => document.title === 'DeepSeek Harness — 资料 — 我的工作台')
    await page.evaluate(() => brandingTest.panel('settings'))
    await page.waitForFunction(() => document.title === '我的工作台')
    await page.evaluate(() => brandingTest.panel(null))
    await page.waitForFunction(() => document.title === 'DeepSeek Harness — 资料 — 我的工作台')
    await page.evaluate(() => brandingTest.update({ appName: '全局名称' }))
    await page.waitForFunction(() => document.title === 'DeepSeek Harness — 资料 — 全局名称')
    await page.evaluate(() => brandingTest.update({ appName: '' }))
    await page.waitForFunction(() => document.title === 'DeepSeek Harness — 资料 — DeepSeek Harness')
    await page.evaluate(() => brandingTest.update({ appName: '我的工作台' }))
    await page.evaluate(() => brandingTest.topic(undefined))
    await page.waitForFunction(() => document.title === '我的工作台')
    await page.evaluate(() => brandingTest.update({ appName: '' }))
    await page.waitForFunction(() => document.title === 'DeepSeek Harness')
    await page.evaluate(() => brandingTest.update({ appName: '另一个工作台' }))
    await page.waitForFunction(() => document.title === '另一个工作台')
    assert.equal(await page.$('.dsh-branding-banner'), null)
    assert.notEqual(await page.$eval('#expanded-mark', node => getComputedStyle(node).display), 'none')
    assert.ok(await page.evaluate(() => brandingTest.nativeMarksRestored()), `${version}: clear restores both native mark nodes`)
    assert.ok(await page.evaluate(() => brandingTest.originalIcons.every((node, index) => document.querySelectorAll('link')[index] === node)))
    // Unloading with an active favicon also restores the native mark and tab-icon nodes.
    await page.evaluate(icon => brandingTest.update({ favicon: icon }), images.iconAlt)
    await checkCustomMarks(page, images.iconAlt, `${version}: active favicon before unload`)
    assert.ok(await page.evaluate(() => brandingTest.dispose()))
    assert.equal(await page.title(), 'DeepSeek Harness', `${version}: unload restores the native tab title`)
    assert.equal(await page.$('[data-dsh-branding]'), null)
    assert.ok(await page.evaluate(() => brandingTest.nativeMarksRestored()), `${version}: unload restores both native mark nodes`)
    assert.ok(await page.evaluate(() => brandingTest.originalIcons.every((node, index) => document.querySelectorAll('link')[index] === node)),
      `${version}: unload restores the original tab-icon nodes`)
    console.log(`${version}: old offset reproduced; centered proportional banners, native controls, theme fallback and icon restoration OK`)
    await page.close()

    // The served index supplies a public name even where settings.describe is unavailable.
    const bootstrapPage = await browser.newPage()
    await bootstrapPage.setOfflineMode(true)
    await bootstrapPage.setContent(rewriteIndexTitle('<!doctype html><html><head><title>DeepSeek Harness</title></head><body></body></html>', '共享工作台'))
    assert.equal(await bootstrapPage.title(), '共享工作台', `${version}: initial HTML is branded before client boot`)
    await bootstrapPage.evaluate(() => {
      let state = { status: 'unavailable', value: undefined }
      let sessions = { byId: {} }
      const listeners = new Set()
      const sessionListeners = new Set()
      const disposers = []
      const ctx = {
        effect: setup => { const dispose = setup(); disposers.push(dispose); return dispose },
        on: () => () => {},
        configForms: { get: () => ({ getSnapshot: () => state,
          subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
        }) },
        theme: { getTheme: () => ({ active: { colorScheme: 'light' } }) },
        sessions: { list: { getSnapshot: () => sessions,
          subscribe: listener => { sessionListeners.add(listener); return () => sessionListeners.delete(listener) },
        } },
        layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} } },
        slots: { inject: () => () => {} },
      }
      window.__ModuleLoader__ = { load: entry => entry.factory(name => {
        if (name !== 'react') throw new Error(name)
        return {}
      }).apply(ctx) }
      window.bootTitleTest = {
        topic(title) {
          sessions = { byId: { current: { title, retainedBy: { mainView: 1 } } } }
          for (const listener of sessionListeners) listener()
          document.title = `${title} — DeepSeek Harness`
        },
        ready(name) {
          state = { status: 'ready', value: { appName: name } }
          for (const listener of listeners) listener()
        },
        unavailable() { state = { status: 'unavailable', value: undefined }; for (const listener of listeners) listener() },
        dispose() { for (const dispose of disposers.reverse()) dispose() },
      }
    })
    await bootstrapPage.addScriptTag({ content: bundle })
    await bootstrapPage.waitForFunction(() => document.title === '共享工作台')
    await bootstrapPage.evaluate(() => bootTitleTest.topic('共享话题'))
    await bootstrapPage.waitForFunction(() => document.title === '共享话题 — 共享工作台')
    await bootstrapPage.evaluate(() => bootTitleTest.ready('宿主新名称'))
    await bootstrapPage.waitForFunction(() => document.title === '共享话题 — 宿主新名称')
    await bootstrapPage.evaluate(() => bootTitleTest.ready(''))
    await bootstrapPage.waitForFunction(() => document.title === '共享话题 — DeepSeek Harness')
    await bootstrapPage.evaluate(() => bootTitleTest.unavailable())
    await bootstrapPage.waitForFunction(() => document.title === '共享话题 — DeepSeek Harness')
    await bootstrapPage.evaluate(() => bootTitleTest.dispose())
    assert.equal(await bootstrapPage.title(), '共享话题 — DeepSeek Harness')
    await bootstrapPage.close()
    console.log(`${version}: selected/global tab titles, initial HTML and bootstrap-only title configuration OK`)
  }
  assert.equal(requests, 0)
  console.log('No HTTP requests; no full DSH instance or remote services used.')
} finally {
  await browser.close()
}
