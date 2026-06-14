import { createSSRApp } from "vue";
import App from "./App.vue";
import store from "./store";
import { logError } from '@/utils/logger'

function installReadonlySlotsRuntimeGuard() {
  // #ifdef H5
  const rawDefineProperty = Object.defineProperty;
  Object.defineProperty = function patchedDefineProperty(target, key, descriptor) {
    if (
      key === '_' &&
      descriptor &&
      descriptor.writable === false &&
      descriptor.enumerable === false &&
      typeof descriptor.value === 'number'
    ) {
      descriptor = {
        ...descriptor,
        writable: true,
      };
    }
    return rawDefineProperty(target, key, descriptor);
  };
  // #endif
}

export function createApp() {
  installReadonlySlotsRuntimeGuard();
  const app = createSSRApp(App);

  // Vue 全局错误处理
  app.config.errorHandler = (err, instance, info) => {
    console.error('[Vue Error]', err, info)
    logError('vue_error', err, {
      component: instance?.$options?.name || instance?.$?.type?.name || '',
      info,
    })
  }

  app.config.globalProperties.$store = store;
  app.config.globalProperties.$onLaunched = Promise.resolve();
  return {
    app,
  };
}
