const state = {
  userInfo: {},
  token: uni.getStorageSync('token') || '',
  tabParam: '',
  showDebugInfo: false,
  appInfo: {},
};

const getters = {};
Object.defineProperties(getters, {
  token: { get: () => state.token },
  userInfo: { get: () => state.userInfo },
  tabParam: { get: () => state.tabParam },
  showDebugInfo: { get: () => state.showDebugInfo },
  checkLogin: { get: () => Boolean(state.token) },
});

function commit(type, payload) {
  state[type] = payload;
}

export default {
  state,
  getters,
  commit,
};
