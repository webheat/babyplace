<script>
import uniIdPageInit from '@/uni_modules/uni-id-pages/init.js'

export default {
  async onLaunch() {
    console.log('App Launch')

    try {
      await uniIdPageInit()
      console.log('uni-id-pages init success')
    } catch (error) {
      console.error('uni-id-pages init failed', error)
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
