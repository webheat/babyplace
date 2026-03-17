<script>
function getH5FallbackTargetRoute() {
  // #ifdef H5
  const params = new URLSearchParams(window.location.search || '')
  let target = params.get('target') || ''
  if (!target) {
    return ''
  }

  const code = params.get('code') || ''
  const state = params.get('state') || ''

  if (code && !target.includes('code=')) {
    target += `${target.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}`
    if (state) {
      target += `&state=${encodeURIComponent(state)}`
    }
  }

  if (target.startsWith('/admin')) {
    return target.replace('/admin', '/pages/admin/index')
  }

  if (target.startsWith('/wechat-login')) {
    return target.replace('/wechat-login', '/pages/auth/wechat-h5')
  }

  if (target.startsWith('/auth')) {
    return target.replace('/auth', '/pages/auth/index')
  }
  // #endif

  return ''
}

export default {
  async onLaunch() {
    console.log('App Launch')

    const fallbackRoute = getH5FallbackTargetRoute()
    if (fallbackRoute) {
      uni.reLaunch({
        url: fallbackRoute,
      })
    }
  },
  onShow() {
    console.log('App Show')
  },
  onHide() {
    console.log('App Hide')
  },
}
</script>

<style>
/*每个页面公共css */
</style>
