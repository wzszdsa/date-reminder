import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.date.reminder',
  appName: '纪念日',
  webDir: 'dist',
  server: {
    url: 'https://date-reminder-pwa.netlify.app',
    cleartext: false,
  },
}

export default config
