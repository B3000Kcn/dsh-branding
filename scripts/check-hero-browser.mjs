/** Offline checks; set DSH_BRANDING_SCREENSHOT_DIR to save wide and narrow examples. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import puppeteer from 'puppeteer'
import { VCP_AGENT_HERO_STYLES } from '../../dsh-vcp-specific-ui/src/modules/vcp-agents/hero.js'
import { bundleClient } from './bundle.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const harness = fileURLToPath(new URL('../../../deepseek-harness/', import.meta.url))
const screenshots = process.env.DSH_BRANDING_SCREENSHOT_DIR
const execute = promisify(execFile)
const releases = [
  ['0.2.1-rc.2', '687f282e8625c6b8d11ff58211a90524be2e4317'],
  ['0.2.2-alpha.2', 'f3803c96974ad4a94195fb97e5c637e9c2a3afe3'],
]
async function source(commit, path) {
  return (await execute('git', ['show', `${commit}:${path}`], { cwd: harness, maxBuffer: 4 * 1024 * 1024 })).stdout
}

const svg = (label, fill) => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24"><rect width="120" height="24" fill="${fill}"/><text x="6" y="17" fill="white">${label}</text></svg>`,
).toString('base64')}`
const images = { light: svg('DAY', '#4667d5'), alternate: svg('ALT', '#a45032'), dark: svg('NIGHT', '#7350a3'), bad: 'data:image/png;base64,YQ==' }
const near = (actual, expected, context) => assert.ok(Math.abs(actual - expected) <= 1.01,
  `${context}: expected ${expected}, got ${actual}`)
function sameRect(actual, expected, context) {
  for (const key of ['x', 'y', 'width', 'height']) near(actual[key], expected[key], `${context} ${key}`)
}

async function metrics(page, id) {
  return page.evaluate(id => {
    const area = document.getElementById(id)
    const box = area.querySelector('.fishHitbox')
    const anchor = area.querySelector('[data-slot="conversation.hero.brand.mark"]')
    const image = anchor.querySelector('img')
    const button = area.querySelector('.dsh-vcp-agent-hero-trigger')
    const rect = node => node?.getBoundingClientRect().toJSON() ?? null
    return {
      box: rect(box), image: rect(image), button: rect(button),
      source: image?.src, naturalWidth: image?.naturalWidth, naturalHeight: image?.naturalHeight,
      imageFit: image && getComputedStyle(image).objectFit,
      anchorDisplay: getComputedStyle(anchor).display,
      titleDisplay: getComputedStyle(area.querySelector('.titleGroup')).display,
      fish: !!anchor.querySelector('.fish'),
      scrollWidth: area.scrollWidth, clientWidth: area.clientWidth,
    }
  }, id)
}

async function sidebarMetrics(page) {
  return page.evaluate(() => {
    const rect = node => node.getBoundingClientRect().toJSON()
    return {
      image: rect(document.querySelector('.dsh-branding-banner')),
      brand: rect(document.getElementById('sidebar-brand')),
      row: rect(document.getElementById('sidebar-row')),
    }
  })
}

async function loaded(page, id, expected) {
  await page.waitForFunction(({ id, expected }) => {
    const image = document.querySelector(`#${id} [data-slot="conversation.hero.brand.mark"] > img`)
    return image?.src === expected && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  }, {}, { id, expected })
}

async function assertAgent(page, baseline, context) {
  const agent = await metrics(page, 'agent')
  assert.equal(agent.anchorDisplay, 'none', `${context}: Agent portal hides its brand anchor`)
  assert.equal(agent.titleDisplay, 'none', `${context}: Agent portal hides its original title`)
  sameRect(agent.box, baseline.box, `${context}: Agent container`)
  sameRect(agent.button, baseline.button, `${context}: Agent button`)
  const before = await page.evaluate(() => heroTest.clicks())
  await page.click('#agent-button')
  assert.equal(await page.evaluate(() => heroTest.clicks()), before + 1, `${context}: Agent button remains clickable`)
}

const bundle = await bundleClient(root)
const browser = await puppeteer.launch({
  executablePath: process.env.DSH_BRANDING_BROWSER_EXECUTABLE || '/tmp/vcp-html-browser/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true,
  args: ['--disable-dev-shm-usage'],
})
let requests = 0
try {
  for (const [version, commit] of releases) {
    const [heroCss, sidebarSource] = await Promise.all([
      source(commit, 'packages/client/ui-conversation/src/client/skeleton/HeroShell.module.css'),
      source(commit, 'packages/client/ui-sidebar/src/client/SidebarRoot.module.css'),
    ])
    const sidebarCss = sidebarSource.replace(/:global\(([^)]+)\)/g, '$1')
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    await page.setOfflineMode(true)
    await page.setRequestInterception(true)
    page.on('request', request => {
      if (/^https?:/.test(request.url())) { requests++; void request.abort() }
      else void request.continue()
    })
    const heroMarkup = id => `<section class="case" id="${id}" data-label="${id === 'agent' ? 'VCP PRESET' : 'ORDINARY PRESET'}" data-conversation-content data-conversation-session="${id}">
      <div class="root"><div class="stack"><div class="headline">
        <span class="fishHitbox"><div data-slot="conversation.hero.brand.mark" style="display:contents"><svg class="fish" width="34" height="25" aria-hidden="true"><path d="M0 0h34v25H0z"/></svg></div></span>
        <span class="titleGroup"><span>探索未至之境</span><span class="previewBadge">预览版</span></span>
      </div><div class="body"></div></div></div></section>`
    await page.setContent(`<!doctype html><html><head><title>DeepSeek Harness</title><style>
      :root { --dsh-composer-card-max-width: 952px; --dsw-alias-label-primary:#242629; --dsw-alias-border-l2:#ddd; }
      body { margin: 10px; font-family: Arial, sans-serif; }
      #hero-suite { display:flex; gap:24px; align-items:flex-start; }
      .case { position:relative; width:520px; height:320px; flex:none; overflow:auto; background:#f7f8fa; }
      .case::before { content:attr(data-label); position:absolute; top:8px; left:8px; color:#667; font-size:11px; }
      @scope (#hero-suite) { ${heroCss} }
      @scope (#sidebar-suite) { ${sidebarCss} }
      ${VCP_AGENT_HERO_STYLES}
      </style></head><body>
      <div id="hero-suite">${heroMarkup('ordinary')}${heroMarkup('agent')}</div>
      <div id="sidebar-suite"><div class="root" style="width:264px;height:120px"><div class="logoRow" id="sidebar-row" data-window-drag>
        <button class="brand wide" id="sidebar-brand"><span class="brandIdentity"><span class="brandMark"><div data-slot="sidebar.brand.mark" style="display:contents"><span>鱼</span></div></span><span class="brandName"><div data-slot="sidebar.brand.name" style="display:contents"><span>DSH</span></div></span></span></button>
        <button class="iconButton toggle" type="button">≡</button>
      </div></div></div></body></html>`)

    await page.evaluate(() => {
      const disposers = []
      const listeners = new Set(), themeListeners = new Set(), sessionListeners = new Set(), panelListeners = new Set()
      let state = { status: 'ready', value: { favicon: '', lightBanner: '', darkBanner: '' }, writable: true, revision: 1 }
      let scheme = 'light', clicks = 0
      const slots = new Map([
        ['conversation.hero.brand.mark', [...document.querySelectorAll('[data-slot="conversation.hero.brand.mark"]')]],
        ['sidebar.brand.name', [...document.querySelectorAll('[data-slot="sidebar.brand.name"]')]],
        ['sidebar.brand.mark', [...document.querySelectorAll('[data-slot="sidebar.brand.mark"]')]],
      ])
      const originals = new Map([...slots.values()].flat().map(slot => [slot, [...slot.childNodes]]))
      const portal = document.createElement('span')
      portal.className = 'dsh-vcp-agent-portal'
      const agent = document.createElement('span')
      agent.className = 'dsh-vcp-agent-hero'
      agent.innerHTML = '<button type="button" id="agent-button" class="dsh-vcp-agent-hero-trigger"><span class="dsh-vcp-agent-hero-avatar">A</span><span class="dsh-vcp-agent-hero-name">Agent Alice</span><span class="dsh-vcp-agent-hero-chevron">⌄</span></button>'
      agent.querySelector('button').onclick = () => { clicks++ }
      portal.append(agent)
      document.querySelector('#agent .fishHitbox').append(portal)
      const React = { createElement(tag, props) {
        const node = document.createElement(tag)
        for (const [key, value] of Object.entries(props)) {
          if (key === 'onError') node.onerror = value
          else if (key === 'onLoad') node.onload = value
          else if (key === 'className') node.className = value
          else node.setAttribute(key, value)
        }
        return node
      } }
      const form = { getSnapshot: () => state, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback) } }
      const ctx = {
        configForms: { get: () => form },
        effect: setup => { const dispose = setup(); disposers.push(dispose); return dispose },
        on: (name, callback) => {
          if (name !== 'theme/change') throw new Error(`Unexpected event ${name}`)
          themeListeners.add(callback)
          const dispose = () => themeListeners.delete(callback)
          disposers.push(dispose)
          return dispose
        },
        theme: { getTheme: () => ({ active: { colorScheme: scheme } }) },
        sessions: { list: { getSnapshot: () => ({ byId: {} }),
          subscribe: callback => { sessionListeners.add(callback); return () => sessionListeners.delete(callback) } } },
        layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }),
          subscribe: callback => { panelListeners.add(callback); return () => panelListeners.delete(callback) } } },
        slots: {
          inject: (_name, setup) => setup(),
          register(options, Component) {
            const targets = slots.get(options.name)
            if (!targets) return () => {}
            if (options.priority !== -1) throw new Error(`Unexpected priority for ${options.name}`)
            const nodes = targets.map(slot => {
              const node = Component({ size: options.name === 'sidebar.brand.mark' ? 24 : 34 })
              slot.replaceChildren(node)
              return node
            })
            return () => targets.forEach((slot, index) => {
              if (slot.contains(nodes[index])) slot.replaceChildren(...originals.get(slot))
            })
          },
        },
      }
      window.__ModuleLoader__ = { load: entry => entry.factory(name => {
        if (name !== 'react') throw new Error(`Unexpected module ${name}`)
        return React
      }).apply(ctx) }
      window.heroTest = {
        update(patch) {
          state = { ...state, value: { ...state.value, ...patch }, revision: state.revision + 1 }
          for (const listener of listeners) listener()
        },
        theme(value) { scheme = value; for (const listener of themeListeners) listener() },
        agent(active) { if (active) portal.append(agent); else agent.remove() },
        clicks: () => clicks,
        restored() {
          return [...slots.values()].flat().every(slot => {
            const before = originals.get(slot)
            return slot.childNodes.length === before.length && before.every((node, index) => slot.childNodes[index] === node)
          })
        },
        dispose() {
          for (const dispose of disposers.reverse()) dispose()
          return listeners.size === 0 && themeListeners.size === 0 && sessionListeners.size === 0 && panelListeners.size === 0
        },
      }
    })
    await page.addScriptTag({ content: bundle })
    assert.ok(await page.evaluate(() => heroTest.restored()), `${version}: original nodes present initially`)
    const baseline = await metrics(page, 'agent')
    await assertAgent(page, baseline, `${version}: native baseline`)
    await page.evaluate(() => { document.getElementById('agent').style.width = '180px' })
    const narrowAgentBaseline = await metrics(page, 'agent')
    await page.evaluate(() => { document.getElementById('agent').style.width = '520px' })
    let ordinary = await metrics(page, 'ordinary')
    assert.ok(ordinary.fish, `${version}: native fish initially visible`)
    assert.notEqual(ordinary.titleDisplay, 'none', `${version}: native title initially visible`)

    await page.evaluate(image => heroTest.update({ lightBanner: image }), images.light)
    await loaded(page, 'ordinary', images.light)
    ordinary = await metrics(page, 'ordinary')
    assert.equal(ordinary.titleDisplay, 'none', `${version}: banner replaces ordinary title`)
    assert.equal(ordinary.anchorDisplay, 'contents', `${version}: ordinary mark remains visible`)
    assert.equal(ordinary.imageFit, 'contain', `${version}: banner preserves aspect ratio`)
    assert.equal(await page.$eval('#sidebar-suite .dsh-branding-banner', node => node.src), images.light)
    await assertAgent(page, baseline, `${version}: banner and Agent coexist`)

    // Removing the Agent portal reveals this occurrence's own branded mark.
    await page.evaluate(() => heroTest.agent(false))
    await loaded(page, 'agent', images.light)
    const switched = await metrics(page, 'agent')
    assert.equal(switched.anchorDisplay, 'contents', `${version}: removed Agent reveals the banner`)
    assert.equal(switched.titleDisplay, 'none', `${version}: banner replaces that occurrence's title`)
    await page.evaluate(() => heroTest.agent(true))
    await assertAgent(page, baseline, `${version}: Agent restored after switching`)

    await page.evaluate(image => heroTest.update({ lightBanner: image }), images.alternate)
    await loaded(page, 'ordinary', images.alternate)
    assert.equal(await page.$eval('#sidebar-suite .dsh-branding-banner', node => node.src), images.alternate)
    await assertAgent(page, baseline, `${version}: changed image`)
    await page.evaluate(() => heroTest.update({ lightBanner: '' }))
    ordinary = await metrics(page, 'ordinary')
    assert.ok(ordinary.fish, `${version}: clear restores native fish`)
    assert.notEqual(ordinary.titleDisplay, 'none', `${version}: clear restores native title`)
    await assertAgent(page, baseline, `${version}: cleared image`)

    await page.evaluate(({ light, dark }) => heroTest.update({
      lightBanner: light, darkBanner: dark,
      lightHeroScale: 150, lightHeroOffset: 20, darkHeroScale: 50, darkHeroOffset: -15,
      lightBannerScale: 100, lightBannerOffset: 0, darkBannerScale: 100, darkBannerOffset: 0,
    }), images)
    await loaded(page, 'ordinary', images.light)
    const light = await metrics(page, 'ordinary')
    await page.evaluate(() => heroTest.theme('dark'))
    await loaded(page, 'ordinary', images.dark)
    const dark = await metrics(page, 'ordinary')
    near(dark.image.height, light.image.height / 3, `${version}: dark hero scale is independent`)
    await assertAgent(page, baseline, `${version}: dark theme`)
    await page.evaluate(() => heroTest.theme('light'))
    await loaded(page, 'ordinary', images.light)
    sameRect((await metrics(page, 'ordinary')).image, light.image, `${version}: light geometry persists after theme switch`)

    // Offsets are screen pixels at every scale; hero and sidebar settings are separate.
    await page.evaluate(() => heroTest.update({ lightBannerScale: 100, lightBannerOffset: 0 }))
    const sidebarBaseline = await sidebarMetrics(page)
    for (const scale of [50, 100, 200]) {
      await page.evaluate(scale => heroTest.update({ lightHeroScale: scale, lightHeroOffset: 0 }), scale)
      const zero = await metrics(page, 'ordinary')
      near(zero.image.height, 80 * scale / 100, `${version}/${scale}%: main image height follows scale`)
      near(zero.image.width, zero.box.width * scale / 100, `${version}/${scale}%: main image width follows scale`)
      for (const offset of [-30, 30]) {
        await page.evaluate(offset => heroTest.update({ lightHeroOffset: offset }), offset)
        const shifted = await metrics(page, 'ordinary')
        near(shifted.image.x - zero.image.x, offset, `${version}/${scale}%/${offset}px: offset is not scaled`)
        near(shifted.image.width, zero.image.width, `${version}/${scale}%/${offset}px: image width stays fixed`)
        near(shifted.image.height, zero.image.height, `${version}/${scale}%/${offset}px: image height stays fixed`)
        sameRect(shifted.box, zero.box, `${version}/${scale}%/${offset}px: hero frame stays fixed`)
        const side = await sidebarMetrics(page)
        for (const key of ['image', 'brand', 'row']) sameRect(side[key], sidebarBaseline[key], `${version}: main adjustment preserves sidebar ${key}`)
      }
    }
    const beforeSidebarChange = await metrics(page, 'ordinary')
    await page.evaluate(() => heroTest.update({ lightBannerScale: 130, lightBannerOffset: 20 }))
    sameRect((await metrics(page, 'ordinary')).image, beforeSidebarChange.image, `${version}: sidebar adjustment preserves main image`)
    await assertAgent(page, baseline, `${version}: independent positioning`)

    for (const width of [360, 180, 100]) {
      await page.evaluate(width => { document.getElementById('ordinary').style.width = `${width}px` }, width)
      for (const offset of [-200, 200]) {
        await page.evaluate(offset => heroTest.update({ lightHeroScale: 300, lightHeroOffset: offset }), offset)
        const narrow = await metrics(page, 'ordinary')
        assert.ok(narrow.scrollWidth <= narrow.clientWidth, `${version}/${width}px/${offset}px: no horizontal scrolling (${narrow.scrollWidth} > ${narrow.clientWidth})`)
      }
    }
    await page.evaluate(() => { document.getElementById('ordinary').style.width = '520px'; heroTest.update({ lightHeroScale: 100, lightHeroOffset: 0 }) })
    await page.evaluate(() => { document.getElementById('agent').style.width = '180px' })
    const narrowAgent = await metrics(page, 'agent')
    sameRect(narrowAgent.box, narrowAgentBaseline.box, `${version}: narrow Agent container preserves native geometry`)
    sameRect(narrowAgent.button, narrowAgentBaseline.button, `${version}: narrow Agent button preserves native geometry`)
    assert.equal(narrowAgent.scrollWidth, narrowAgentBaseline.scrollWidth, `${version}: branding does not increase narrow Agent overflow`)
    const narrowClicks = await page.evaluate(() => heroTest.clicks())
    await page.click('#agent-button')
    assert.equal(await page.evaluate(() => heroTest.clicks()), narrowClicks + 1, `${version}: narrow Agent remains clickable`)
    await page.evaluate(() => { document.getElementById('agent').style.width = '520px'; document.getElementById('agent').scrollLeft = 0 })

    if (screenshots && version === releases[0][0]) {
      await loaded(page, 'ordinary', images.light)
      const suite = await page.$('#hero-suite')
      await suite.screenshot({ path: `${screenshots}/hero-wide.png` })
      await page.setViewport({ width: 780, height: 500 })
      await page.evaluate(() => {
        document.getElementById('ordinary').style.width = '360px'
        document.getElementById('agent').style.width = '360px'
      })
      await suite.screenshot({ path: `${screenshots}/hero-narrow.png` })
      await page.setViewport({ width: 1400, height: 900 })
      await page.evaluate(() => {
        document.getElementById('ordinary').style.width = '520px'
        document.getElementById('agent').style.width = '520px'
      })
      await assertAgent(page, baseline, `${version}: Agent restored after narrow screenshot`)
    }

    // The browser rejects invalid image bytes and the registered image error restores fallback nodes.
    await page.evaluate(image => heroTest.update({ lightBanner: image }), images.bad)
    await page.waitForFunction(() => !!document.querySelector('#ordinary [data-slot="conversation.hero.brand.mark"] > svg.fish'))
    ordinary = await metrics(page, 'ordinary')
    assert.ok(ordinary.fish, `${version}: failed image restores native fish`)
    assert.notEqual(ordinary.titleDisplay, 'none', `${version}: failed image restores native title`)
    await assertAgent(page, baseline, `${version}: failed image`)

    await page.evaluate(image => heroTest.update({ lightBanner: image }), images.light)
    await loaded(page, 'ordinary', images.light)
    assert.equal(await page.evaluate(() => heroTest.dispose()), true, `${version}: listeners disposed`)
    assert.ok(await page.evaluate(() => heroTest.restored()), `${version}: unloading restores original slot nodes`)
    ordinary = await metrics(page, 'ordinary')
    assert.ok(ordinary.fish, `${version}: unloading restores native fish`)
    assert.notEqual(ordinary.titleDisplay, 'none', `${version}: unloading restores native title`)
    await assertAgent(page, baseline, `${version}: unloaded branding leaves Agent intact`)
    await page.close()
    console.log(`${version}: hero and Agent coexistence, image lifecycle, independent positioning and narrow layouts OK`)
  }
  assert.equal(requests, 0, 'all checks must be offline')
  console.log('No HTTP requests. Real release CSS and the source bundle use a lightweight DOM/slot fixture; full React, DSH, Agent transport and a user instance were not started.')
} finally {
  await browser.close()
}
