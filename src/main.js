import { createSSRApp } from "vue";
import App from "./App.vue";
import store from "./store";

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
  app.config.globalProperties.$store = store;
  app.config.globalProperties.$onLaunched = Promise.resolve();
  return {
    app,
  };
}
