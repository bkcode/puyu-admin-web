<script setup lang="ts">
import type { ModelUsage, Todo } from '#/data/adminBusinessApi';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Select,
  Space,
  Statistic,
  Table,
} from 'ant-design-vue';

import { AdminBusinessService as service } from '#/application/adminBusinessService';
import { RealAdminService } from '#/application/realAdminService';
import { shanghaiDate } from '#/infrastructure/time/shanghaiTime';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import { businessEvents, useBusinessUi } from './businessUi';
import { displayTime } from './operationsUi';
const props = defineProps<{ platform: boolean }>();
const router = useRouter();
const { error, busy, run } = useBusinessUi();
const metrics = ref<Record<string, string>>({});
const todos = ref<Todo[]>([]);
const todoPage = ref(1);
const todoTotal = ref(0);
const kind = ref<string>();
const models = ref<ModelUsage[]>([]);
const modelPage = ref(1);
const modelTotal = ref(0);
const showModels = ref(false);
const cards = computed(() =>
  props.platform
    ? [
        ['merchantCount', '商户数量'],
        ['designerCount', '设计师数量'],
        ['productCount', '商品数量'],
        ['ticketCount', '工单数量'],
        ['pendingTicketCount', '待处理工单'],
        ['expiringMerchantCount', '即将到期商户'],
        ['modelFileCount', '模型文件'],
        ['modelDownloadCount', '模型下载次数'],
      ]
    : [
        ['productCount', '商品数'],
        ['orderCount', '订单数'],
        ['customerCount', '合作客户数'],
        ['ticketCount', '工单数'],
        ['modelFileCount', '模型文件'],
        ['modelDownloadCount', '模型下载次数'],
        ['consumedCredits', '模型消耗额度'],
        ['creditBalance', '服务额度余额'],
      ],
);
const kinds = [
  { value: 'MERCHANT_SERVICE_EXPIRING', label: '商户服务到期' },
  { value: 'TICKET_PROCESSING', label: '平台待处理工单' },
  { value: 'TICKET_CONFIRMATION', label: '商户待确认工单' },
];
async function loadTodos() {
  const r = await service.todos({ kind: kind.value }, todoPage.value);
  todos.value = r.items;
  todoTotal.value = Number(r.total);
}
async function loadModels() {
  const r = await service.models({}, modelPage.value);
  models.value = r.items;
  modelTotal.value = Number(r.total);
  showModels.value = true;
}
async function load() {
  metrics.value = await RealAdminService.dashboard();
  await loadTodos();
  if (showModels.value) await loadModels();
}
function openTodo(row: Todo) {
  const id = row.referenceId;
  return router.push({
    name:
      row.kind === 'MERCHANT_SERVICE_EXPIRING'
        ? 'PuyuAdmin_platform-merchant-detail'
        : `PuyuAdmin_${props.platform ? 'platform-ticket' : 'merchant-workorder'}-detail`,
    query: { id },
  });
}
onMounted(() => run(load));
</script>
<template>
  <Alert
    class="mb-4"
    type="info"
    :message="
      platform
        ? '平台范围统计，模型使用数据只读。'
        : '仅本人商户范围统计；合作客户数不代表装修客户资料授权。'
    "
  /><Space class="mb-4">
    <Button :loading="busy" @click="run(load)">刷新统计</Button><Button :disabled="busy" @click="run(loadModels)">
      模型文件使用统计
    </Button>
  </Space>
  <div class="business-metrics">
    <Card v-for="[key, title] in cards" :key="key" :loading="busy">
      <Statistic :title="title" :value="metrics[key!] ?? '0'" />
    </Card>
  </div>
  <Card class="mt-4" title="待办事项">
    <Space class="mb-3">
      <Select
        v-model:value="kind"
        allow-clear
        placeholder="全部待办"
        style="width: 220px"
        :options="
          kinds.filter((k) =>
            platform
              ? k.value !== 'TICKET_CONFIRMATION'
              : k.value !== 'MERCHANT_SERVICE_EXPIRING',
          )
        "
      /><Button
        :disabled="busy"
        @click="
          todoPage = 1;
          run(loadTodos);
        "
      >
        筛选
      </Button>
</Space><Table
      :row-key="(r) => `${r.kind}:${r.referenceId}`"
      :data-source="todos"
      :columns="[
        { title: '事项', dataIndex: 'title' },
        { title: '类型', key: 'kind' },
        { title: '状态', key: 'status' },
        { title: '到期日', key: 'dueDate' },
        { title: '操作', key: 'action' },
      ]"
      :pagination="{
        current: todoPage,
        total: todoTotal,
        pageSize: 20,
        showSizeChanger: false,
      }"
      @change="
        (p) => {
          todoPage = p.current ?? 1;
          run(loadTodos);
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'kind'">
          {{ businessEvents[record.kind] ?? record.kind }}
</template><template v-else-if="column.key === 'status'">
          {{
            record.status === 'SUBMITTED'
              ? '待接单'
              : record.status === 'PROCESSING'
                ? '处理中'
                : record.status === 'READY_CONFIRM'
                  ? '待确认'
                  : (businessEvents[record.status] ?? record.status)
          }}
</template><template v-else-if="column.key === 'dueDate'">
          {{ record.dueDate ? shanghaiDate(record.dueDate) : '—' }}
</template><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="openTodo(record as Todo)"
        >
          处理
        </Button>
      </template>
    </Table>
  </Card>
  <Card v-if="showModels" class="mt-4" title="模型使用统计（只读）">
    <Table
      :row-key="(r) => `${r.merchantId}:${r.fileId}`"
      :data-source="models"
      :columns="[
        { title: '文件ID', dataIndex: 'fileId' },
        { title: '商品ID', dataIndex: 'productId' },
        { title: '商户ID', dataIndex: 'merchantId' },
        { title: '下载总次数', dataIndex: 'totalDownloads' },
        { title: '已用免费次数', dataIndex: 'freeUsed' },
        { title: '消耗额度', dataIndex: 'consumedCredits' },
        { title: '免费截止', key: 'freeUntil' },
      ]"
      :pagination="{
        current: modelPage,
        total: modelTotal,
        pageSize: 20,
        showSizeChanger: false,
      }"
      @change="
        (p) => {
          modelPage = p.current ?? 1;
          run(loadModels);
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'freeUntil'">
          {{ displayTime(record.freeUntil) }}
        </template>
      </template>
    </Table>
    <p>
      此入口不下载文件、不扣额度。实际模型下载请从有权限的工单交付文件进入。
    </p>
</Card><ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
