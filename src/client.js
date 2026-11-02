import { installBranding } from './branding.js'
import { installSettings } from './settings.js'
import { installTabTitle } from './title.js'

/** Standalone Web plugin for the host's favicon and sidebar banners. */
export function makePlugin(require) {
  const React = require('react')
  return {
    inject: ['slots', 'configForms', 'theme', 'sessions', 'layout'],
    apply(ctx) {
      const form = ctx.configForms.get('dsh-branding')
      const status = installBranding({ ctx, React, document, form })
      ctx.effect(() => installTabTitle({ ctx, document, form }))
      installSettings({ ctx, React, form, status })
    },
  }
}
