/** Use the configured favicon in native sidebar mark slots without changing their controls. */
export function createSidebarMark({ ctx, React, report }) {
  let current = ''
  let remove
  let generation = 0
  function dispose() {
    generation++
    remove?.()
    remove = undefined
    current = ''
  }
  return {
    set(url) {
      if (url === current) return
      dispose()
      current = url
      if (!url) return
      const epoch = generation
      const Mark = ({ size = 24 } = {}) => React.createElement('img', {
        className: 'dsh-branding-mark', src: url, alt: '', draggable: false,
        width: size, height: size,
        onError: () => {
          if (epoch !== generation) return
          dispose()
          report('侧栏图标无法加载，已恢复原图，请重新上传 favicon。')
        },
      })
      try {
        remove = ctx.slots.inject('sidebar.brand.mark', () => {
          try {
            return ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, Mark)
          } catch (error) {
            report(`侧栏图标插槽不可用：${error.message}`)
            return () => {}
          }
        })
      } catch (error) {
        dispose()
        report(`侧栏图标插槽不可用：${error.message}`)
      }
    },
    dispose,
  }
}
