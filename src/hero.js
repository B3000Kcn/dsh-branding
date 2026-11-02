/** Replace native hero artwork while the VCP Agent portal owns its visible occurrence. */
export function createHeroBanner({ ctx, React, report }) {
  let current = ''
  let remove
  let generation = 0
  let failure = ''
  const fail = message => { failure = message; report(message) }
  const clearFailure = () => { if (failure) { report('', failure); failure = '' } }
  function dispose() {
    generation++
    remove?.()
    remove = undefined
    current = ''
  }
  return {
    set(url) {
      if (!url) clearFailure()
      if (url === current) return
      dispose()
      current = url
      if (!url) return
      const epoch = generation
      const Banner = () => React.createElement('img', {
        className: 'dsh-branding-hero-banner', src: url, alt: '', draggable: false,
        onLoad: () => { if (epoch === generation) clearFailure() },
        onError: () => {
          if (epoch !== generation) return
          dispose()
          fail('主界面横幅无法加载，已恢复原图，请重新上传。')
        },
      })
      try {
        remove = ctx.slots.inject('conversation.hero.brand.mark', () => {
          try {
            return ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: -1 }, Banner)
          } catch (error) {
            fail(`主界面横幅插槽不可用：${error.message}`)
            return () => {}
          }
        })
      } catch (error) {
        dispose()
        fail(`主界面横幅插槽不可用：${error.message}`)
      }
    },
    dispose,
  }
}
