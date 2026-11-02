const TITLE = /(<title\b[^>]*>)([\s\S]*?)(<\/title\s*>)/i

function escapeText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

/** Replace the initial shell title and publish only the product-name bootstrap values. */
export function rewriteIndexTitle(html, name) {
  const title = name.replace(/[\t\n\f\r ]+/g, ' ').replace(/^ | $/g, '')
  if (!title) return html
  return html.replace(TITLE, (_whole, open, native, close) => {
    // Preserve existing title entities so the browser decodes the original name once.
    const nativeAttribute = native.replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    return `${open}${escapeText(title)}${close}`
      + `<meta name="dsh-branding-app-name" content="${escapeText(title)}">`
      + `<meta name="dsh-branding-native-title" content="${nativeAttribute}">`
  })
}

/** Attach to the supported index renderer when the WebServer service is present. */
export function installTitleShell(ctx, config) {
  return ctx.inject(['webServer'], scope => {
    scope.effect(() => scope.webServer.tapIndex(html => rewriteIndexTitle(html, config.appName.get())))
  })
}
