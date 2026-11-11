import { fileURLToPath } from 'node:url';

import Vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [Vue()],
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('../apps/web-antd/src', import.meta.url)),
    },
  },
  define: { 'import.meta.env.VITE_PUYU_DATA_MODE': JSON.stringify('real') },
  test: {
    environment: 'happy-dom',
    include: [
      'apps/web-antd/src/data/__tests__/real-admin.test.ts',
      'apps/web-antd/src/data/__tests__/merchant-service-end.test.ts',
      'apps/web-antd/src/data/__tests__/operations.test.ts',
      'apps/web-antd/src/data/__tests__/local-proxy.test.ts',
      'apps/web-antd/src/data/__tests__/admin-business.test.ts',
      'apps/web-antd/src/data/__tests__/billing-page.test.ts',
      'apps/web-antd/src/data/__tests__/designer-page.test.ts',
      'apps/web-antd/src/data/__tests__/credit-page.test.ts',
      'apps/web-antd/src/data/__tests__/credit-export-service.test.ts',
      'apps/web-antd/src/data/__tests__/credit-export-page.test.ts',
      'apps/web-antd/src/data/__tests__/download-helper.test.ts',
      'apps/web-antd/src/data/__tests__/qr-page.test.ts',
      'apps/web-antd/src/data/__tests__/workbook.test.ts',
      'apps/web-antd/src/data/__tests__/workbook-page.test.ts',
      'apps/web-antd/src/data/__tests__/catalog-batch.test.ts',
      'apps/web-antd/src/data/__tests__/catalog-batch-page.test.ts',
      'apps/web-antd/src/data/__tests__/catalog-batch-list.test.ts',
      'apps/web-antd/src/data/__tests__/business-ui.test.ts',
    ],
  },
});
