import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: process.env.SKY_TEST_URL || 'http://127.0.0.1:5173/stars/', viewport: { width:1440,height:900 }, launchOptions: { args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] } },
  webServer: process.env.SKY_TEST_URL ? undefined : { command:'npm run dev',url:'http://127.0.0.1:5173/stars/',reuseExistingServer:true },
});
