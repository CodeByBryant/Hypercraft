import { defineConfig } from '@playwright/test';

// E2E runs against a production build served by `vite preview`. WebGL2 runs on SwiftShader
// (software) in CI containers, which is slow (~1-3 s per 360p frame), so tests render on
// demand (window.__hc.manual) and use small internal resolutions where possible.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 600_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npx vite build --logLevel warn && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
