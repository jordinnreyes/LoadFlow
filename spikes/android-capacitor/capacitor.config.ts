import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.cargawise.spike', appName: 'CargaWise Spike', webDir: 'www',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
};
export default config;
