const bannerPath = '[data-slot="sidebar.brand.name"] > .dsh-branding-banner'
const bannerRow = `[data-window-drag]:has(> :is(button, span) > span > span > ${bannerPath})`
// Agent heroes live beside the brand anchor. Its hidden image must not alter their layout.
const heroBox = 'span:has(> [data-slot="conversation.hero.brand.mark"] > .dsh-branding-hero-banner):not(:has(> .dsh-vcp-agent-portal > .dsh-vcp-agent-hero))'

export const STYLES = `
/* Hide the adjacent native mark only while our full banner occupies the name slot.
   The collapsed rail has no name slot and retains its native expand control. */
span:has(> [data-slot="sidebar.brand.mark"]):has(+ span > [data-slot="sidebar.brand.name"] > .dsh-branding-banner) { display: none; }
/* Center in the space remaining after the native toggle, including its caption-row variant. */
${bannerRow} { --dsh-branding-base-height: 60px; position: relative; height: calc(var(--dsh-branding-base-height) * max(1, var(--dsh-branding-scale, 1))); }
html[data-windows-titlebar] ${bannerRow} { --dsh-branding-base-height: 40px; }
${bannerRow} > :is(button, span):first-child { position: absolute; inset: 0 36px 0 0; height: auto; padding: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; transform: translateX(var(--dsh-branding-offset, 0px)); }
${bannerRow}:not(:has(> :is(button, span):first-child + button)) > :is(button, span):first-child { inset: 0; }
html[data-windows-titlebar] ${bannerRow} > :is(button, span):first-child { inset: 0 0 0 36px; }
${bannerRow} > :is(button, span):first-child > span { width: 100%; height: 100%; justify-content: center; gap: 0; transform: none; }
${bannerRow} > :is(button, span):first-child > span > span:has(> ${bannerPath}) { width: 100%; height: 100%; justify-content: center; }
.dsh-branding-banner { display: block; width: 100%; height: var(--dsh-branding-base-height); flex: none; min-width: 0; max-width: none; object-fit: contain; object-position: center; transform: scale(var(--dsh-branding-scale, 1)); pointer-events: none; }
.dsh-branding-mark { display: block; flex: none; object-fit: contain; pointer-events: none; }
${heroBox} { width: min(480px, 100%); min-width: 0; height: calc(80px * max(1, var(--dsh-branding-hero-scale, 1))); overflow: hidden; }
${heroBox} + span { display: none; }
.dsh-branding-hero-banner { display: block; width: 100%; height: 80px; flex: none; object-fit: contain; object-position: center; transform: translateX(var(--dsh-branding-hero-offset, 0px)) scale(var(--dsh-branding-hero-scale, 1)); pointer-events: none; }
.dsh-branding-settings { display: grid; gap: 16px; color: var(--dsw-alias-label-primary); }
.dsh-branding-settings h3, .dsh-branding-settings p { margin: 0; }
.dsh-branding-settings fieldset { display: grid; gap: 10px; min-width: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 12px; }
.dsh-branding-preview { display: flex; align-items: center; justify-content: center; min-height: 72px; padding: 12px; border-radius: 6px; overflow: hidden; }
.dsh-branding-preview img { display: block; max-width: 100%; max-height: 120px; width: auto; height: auto; object-fit: contain; }
.dsh-branding-preview[data-scheme="light"] { background: #f7f8fa; color: #242629; }
.dsh-branding-preview[data-scheme="dark"] { background: #202225; color: #e5e7eb; }
.dsh-branding-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.dsh-branding-settings input[type="text"] { width: 100%; box-sizing: border-box; }
.dsh-branding-settings [role="alert"] { color: var(--dsw-alias-status-warning-foreground, #c66a13); }
`

/** Apply the selected mode's validated zoom and pixel offset. */
export function scaleStyles(scale, offset = 0) {
  return `${bannerRow} { --dsh-branding-scale: ${scale / 100}; --dsh-branding-offset: ${offset}px; }`
}

/** Hero positioning is independent of sidebar positioning, including on theme changes. */
export function heroScaleStyles(scale, offset = 0) {
  return `${heroBox} { --dsh-branding-hero-scale: ${scale / 100}; --dsh-branding-hero-offset: ${offset}px; }`
}
