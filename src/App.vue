<script>
import { logInfo, logError } from '@/utils/logger'

export default {
  onLaunch() {
    console.log('App Launch')
    logInfo('app_launch')
  },
  onShow() {
    console.log('App Show')
  },
  onHide() {
    console.log('App Hide')
  },
  onError(err) {
    console.error('App Error:', err)
    logError('app_error', err)
  },
  onUnhandledRejection(res) {
    console.error('Unhandled Rejection:', res?.reason)
    logError('unhandled_rejection', res?.reason || 'unknown')
  },
}
</script>

<style>
/* 每个页面公共 css */
page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji',
    'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>