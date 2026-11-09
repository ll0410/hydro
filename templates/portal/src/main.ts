import { createApp } from 'vue'
import App from './App.vue'
import { setupMonitoring } from './monitoring'

setupMonitoring()
createApp(App).mount('#app')
