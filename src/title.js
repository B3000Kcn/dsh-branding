/** Match the whitespace normalization applied by the browser's document.title getter. */
function titleText(value) {
  return value.replace(/[\t\n\f\r ]+/g, ' ').replace(/^ | $/g, '')
}

/** Project the same current Session title and panel choice used by DSH DocumentTitle. */
function projection(ctx) {
  const panel = ctx.layout.panelInfo.getSnapshot()
  const sessions = ctx.sessions.list.getSnapshot()
  if (!panel || panel.activePanelId === undefined || !sessions?.byId || typeof sessions.byId !== 'object') return undefined
  if (panel.activePanelId !== null) return { title: undefined }
  const row = Object.values(sessions.byId).find(item => (item?.retainedBy?.mainView ?? 0) > 0)
  if (row?.title !== undefined && typeof row.title !== 'string') return undefined
  return { title: row?.title }
}

/** Recover the product part only when the entire known Session-title prefix matches. */
function productFromSessionTitle(value, title) {
  const prefix = titleText(`${title} —`)
  if (value === prefix) return ''
  if (value.startsWith(`${prefix} `)) return value.slice(prefix.length + 1)
  return undefined
}

/** Replace the product name in the projected tab title while retaining the Session title. */
export function installTabTitle({ ctx, document, form }) {
  const Observer = document.defaultView.MutationObserver
  let previous = projection(ctx)
  const meta = name => document.head?.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? undefined
  const bootstrap = meta('dsh-branding-app-name')
  const nativeSeed = meta('dsh-branding-native-title')
  const bootstrapName = bootstrap === undefined ? '' : titleText(bootstrap)
  let nativeProduct = nativeSeed === undefined ? undefined : titleText(nativeSeed)
  let nativeSession
  let owned
  let stopped = false
  let formReady = false
  let observedHead
  const cleanups = []
  const retiredNative = []

  // The Host may have already placed its custom name in the first HTML title.
  // Keep that value owned so an accepted empty setting can restore the native title.
  if (bootstrapName) {
    const initial = document.title
    const projected = previous?.title === undefined ? bootstrapName : titleText(`${previous.title} — ${bootstrapName}`)
    if ((initial === bootstrapName || initial === projected) && initial !== nativeTitle(previous)) owned = initial
  }

  function relevant(records) {
    return records.some(record => {
      const target = record.target.nodeType === 3 ? record.target.parentElement : record.target
      if (target?.localName === 'title' && target.parentNode === document.head) return true
      if (record.type !== 'childList' || record.target !== document.head) return false
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && node.localName === 'title')
    })
  }

  const headObserver = new Observer(records => { if (relevant(records)) reconcile(true) })
  const rootObserver = new Observer(() => {
    if (attachHead()) reconcile(true)
  })

  function attachHead() {
    if (observedHead === document.head) return false
    headObserver.disconnect()
    observedHead = document.head
    if (observedHead) headObserver.observe(observedHead, { childList: true, subtree: true, characterData: true })
    return true
  }

  function pendingTitleChange() {
    const changed = relevant(headObserver.takeRecords())
    rootObserver.takeRecords()
    return attachHead() || changed
  }

  function nativeTitle(current) {
    if (nativeProduct === undefined) return undefined
    return current?.title === undefined ? nativeProduct : titleText(`${current.title} — ${nativeProduct}`)
  }

  function rememberRetired(current) {
    if (previous?.title === undefined || previous.title === current?.title) return
    const value = nativeTitle(previous)
    if (value === undefined || retiredNative.includes(value)) return
    retiredNative.push(value)
    if (retiredNative.length > 16) retiredNative.shift()
  }

  function remember(value, current) {
    if (!current || !document.head?.querySelector('title')) return
    if (current.title !== undefined) {
      // The host effect may briefly restore the bare product title during cleanup.
      if (value === nativeProduct) return
      // A prior topic title may arrive after selection has already advanced.
      if (nativeSession && current.title !== nativeSession.title && value === nativeSession.value) return
      if (retiredNative.includes(value) && value !== nativeTitle(current)) return
      let title = current.title
      let product = productFromSessionTitle(value, title)
      if (product === undefined && previous?.title !== undefined) {
        title = previous.title
        product = productFromSessionTitle(value, title)
      }
      if (product !== undefined) {
        nativeProduct = product
        nativeSession = { title, value }
      }
      return
    }
    // The Session store may notify before React replaces the previous topic title.
    if (previous?.title !== undefined) {
      const previousTitle = nativeTitle(previous)
      if (previousTitle !== undefined && value === previousTitle) return
      if (nativeProduct === undefined) {
        const product = productFromSessionTitle(value, previous.title)
        if (product !== undefined) { nativeProduct = product; return }
      }
    }
    nativeProduct = value
  }

  function write(value) {
    if (document.title !== value) {
      document.title = value
      // These records are ours. Consuming them prevents a mutation feedback loop.
      headObserver.takeRecords()
    }
    return document.title
  }

  function restore(current) {
    if (owned !== undefined && document.title === owned) {
      const value = nativeTitle(current)
      if (value !== undefined) write(value)
    }
    owned = undefined
  }

  function reconcile(external = false) {
    if (stopped) return
    external = pendingTitleChange() || external
    const current = projection(ctx)
    const value = document.title
    rememberRetired(current)
    if (external || (owned !== undefined && value !== owned)) owned = undefined
    if (owned === undefined) remember(value, current)
    const state = form.getSnapshot()
    if (state?.status === 'ready') formReady = true
    const configured = state?.status === 'ready'
      ? typeof state.value?.appName === 'string' ? titleText(state.value.appName) : ''
      : formReady ? '' : bootstrapName
    if (!current || !configured) {
      restore(current)
    } else if (nativeProduct !== undefined) {
      const desired = current.title === undefined ? configured : titleText(`${current.title} — ${configured}`)
      if (document.title !== desired) {
        const written = write(desired)
        if (written === desired) owned = written
      }
    }
    previous = current
  }

  try {
    attachHead()
    if (document.documentElement) rootObserver.observe(document.documentElement, { childList: true })
    cleanups.push(form.subscribe(reconcile))
    cleanups.push(ctx.sessions.list.subscribe(reconcile))
    cleanups.push(ctx.layout.panelInfo.subscribe(reconcile))
    reconcile()
  } catch (error) {
    for (const dispose of cleanups.reverse()) dispose()
    headObserver.disconnect()
    rootObserver.disconnect()
    throw error
  }

  return () => {
    if (stopped) return
    // Apply any host write waiting in the observer queue before releasing ownership.
    const external = pendingTitleChange()
    const current = projection(ctx)
    rememberRetired(current)
    if (external || (owned !== undefined && document.title !== owned)) {
      owned = undefined
      remember(document.title, current)
    }
    stopped = true
    for (const dispose of cleanups.reverse()) dispose()
    headObserver.disconnect()
    rootObserver.disconnect()
    restore(current)
  }
}
