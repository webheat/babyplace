import { createApp } from 'vue';
import GlobeStory from './GlobeStory.vue';

createApp(GlobeStory, { episode: window.__EPISODE__ }).mount('#app');