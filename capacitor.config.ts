import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wuregstore.app',
  appName: 'WuregStore',
  webDir: 'out',
  server: {
    cleartext: true
  }
};
export default config;