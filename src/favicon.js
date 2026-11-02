/** Temporarily replace every native tab icon and restore the same nodes on clear/unload. */
export function createFavicon(document) {
  let custom
  let originals = []
  function restore() {
    custom?.remove()
    custom = undefined
    for (const { node, anchor } of originals) {
      if (anchor.parentNode) anchor.replaceWith(node)
    }
    originals = []
  }
  return {
    set(url) {
      if (!url) { restore(); return }
      if (!custom) {
        originals = [...document.head.querySelectorAll('link')]
          .filter(node => node.rel.toLowerCase().split(/\s+/).includes('icon'))
          .map(node => {
            const anchor = document.createComment('dsh-branding: original favicon')
            node.replaceWith(anchor)
            return { node, anchor }
          })
        custom = document.createElement('link')
        custom.rel = 'icon'
        custom.dataset.dshBranding = ''
        document.head.append(custom)
      }
      custom.type = url.slice(5, url.indexOf(';'))
      if (custom.href !== url) custom.href = url
    },
    dispose: restore,
  }
}
