<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { Alert, Tag } from 'ant-design-vue';

import { realPageIds } from '#/router/routes/modules/puyu-admin';

import Billing from './real/Billing.vue';
import Catalog from './real/Catalog.vue';
import Cooperation from './real/Cooperation.vue';
import Credits from './real/Credits.vue';
import Dashboard from './real/Dashboard.vue';
import Designers from './real/Designers.vue';
import Inventory from './real/Inventory.vue';
import Merchants from './real/Merchants.vue';
import Orders from './real/Orders.vue';
import Settings from './real/Settings.vue';
import Tickets from './real/Tickets.vue';
const route = useRoute();
const page = computed(
  () => route.meta.page as undefined | { id: string; title: string },
);
</script>
<template>
  <section class="real-page">
    <div class="page-heading">
      <h1>{{ page?.title }}</h1>
      <Tag color="cyan">真实数据</Tag>
    </div>
    <Dashboard
      v-if="
        page?.id === 'platform-dashboard' || page?.id === 'merchant-dashboard'
      "
      :key="route.fullPath"
      :platform="page.id === 'platform-dashboard'"
    />
    <Designers
      v-else-if="page?.id.startsWith('platform-designer-')"
      :key="route.fullPath"
      :page-id="page.id"
    />
    <Cooperation
      v-else-if="page?.id.startsWith('cooperation-')"
      :key="route.fullPath"
      :page-id="page.id"
    />
    <Credits
      v-else-if="page?.id.startsWith('platform-credit-')"
      :key="route.fullPath"
      :page-id="page.id"
    />
    <Billing
      v-else-if="page?.id === 'platform-billing-management'"
      :key="route.fullPath"
    />
    <Settings
      v-else-if="page?.id === 'platform-system-settings'"
      :key="route.fullPath"
    />
    <Merchants
      v-else-if="page?.id.startsWith('platform-merchant-')"
      :page-id="page.id"
    />
    <Inventory v-else-if="page?.id === 'inventory-list'" />
    <Orders v-else-if="page?.id === 'order-management'" />
    <Tickets
      v-else-if="
        page?.id.startsWith('platform-ticket-') ||
        page?.id.startsWith('merchant-workorder-')
      "
      :key="route.fullPath"
      :page-id="page.id"
    />
    <Catalog v-else-if="page && realPageIds.has(page.id)" :page-id="page.id" />
    <Alert
      v-else
      type="info"
      show-icon
      message="此页面尚未接入真实数据"
      description="已接入商户、商品目录、库存、订单及工单；其他页面不在此展示模拟保存结果。"
    />
  </section>
</template>
<style scoped>
.real-page {
  min-width: 0;
  padding: 20px;
}

.page-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
}

.page-heading h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1000px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
<style scoped>
:deep(.business-grid) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}

:deep(.business-metrics) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 900px) {
  :deep(.business-grid) {
    grid-template-columns: 1fr;
  }

  :deep(.business-metrics) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
