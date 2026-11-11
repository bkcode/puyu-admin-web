<script setup lang="ts">
import type { Stock, StockHistory } from '#/data/operationsApi';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createOperationRequest,
  OperationsService,
} from '#/application/operationsService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import { displayTime, labels, options } from './operationsUi';

const router = useRouter();
const rows = ref<Stock[]>([]);
const history = ref<StockHistory[]>([]);
const selected = ref<Stock>();
const query = reactive({
  keyword: '',
  status: undefined as string | undefined,
});
const current = ref(1);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const adjusting = ref(false);
const historyOpen = ref(false);
const historyLoading = ref(false);
const form = reactive({ delta: '0', lowThreshold: '0', reason: '' });
let command = createOperationRequest();
let revision = 0;
const columns = [
  { title: '商品', dataIndex: 'productName' },
  { title: 'SKU编码', dataIndex: 'code' },
  { title: '规格', dataIndex: 'spec' },
  { title: '当前库存', dataIndex: 'stock' },
  { title: '可用', dataIndex: 'available' },
  { title: '锁定', dataIndex: 'locked' },
  { title: '预警阈值', dataIndex: 'lowThreshold' },
  { title: '状态', key: 'status' },
  { title: '更新时间', key: 'updatedAt' },
  { title: '操作', key: 'action', width: 240 },
];
const historyColumns = [
  { title: '调整前', dataIndex: 'before' },
  { title: '变化量', dataIndex: 'delta' },
  { title: '调整后', dataIndex: 'after' },
  { title: '原因', dataIndex: 'reason' },
  { title: '操作人ID', dataIndex: 'operatorId' },
  { title: '时间', key: 'createdAt' },
];
function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : '请求失败';
}
async function load(page = current.value) {
  const request = ++revision;
  loading.value = true;
  current.value = page;
  try {
    const data = await OperationsService.stocks({ ...query }, page);
    if (request === revision) {
      rows.value = data.items;
      total.value = Number(data.total);
    }
  } catch (error) {
    if (request === revision) fail(error);
  } finally {
    if (request === revision) loading.value = false;
  }
}
function openAdjust(row: Stock) {
  selected.value = row;
  Object.assign(form, {
    delta: '0',
    lowThreshold: row.lowThreshold,
    reason: '',
  });
  command = createOperationRequest();
  adjusting.value = true;
}
async function save() {
  if (!selected.value || saving.value) return;
  saving.value = true;
  try {
    await OperationsService.adjustStock(
      command({
        skuId: selected.value.skuId,
        version: selected.value.version,
        ...form,
      }),
    );
    adjusting.value = false;
    message.success('库存调整已保存');
    await load();
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
async function showHistory(row: Stock) {
  selected.value = row;
  history.value = [];
  historyOpen.value = true;
  historyLoading.value = true;
  try {
    history.value = await OperationsService.stockHistory(row.skuId);
  } catch (error) {
    fail(error);
  } finally {
    historyLoading.value = false;
  }
}
onMounted(() => load(1));
</script>
<template>
  <Card>
    <Space wrap class="mb-4">
      <Input
        v-model:value="query.keyword"
        aria-label="库存搜索"
        placeholder="商品名称 / SKU编码"
        @press-enter="load(1)"
      />
      <Select
        v-model:value="query.status"
        aria-label="库存状态"
        placeholder="全部状态"
        allow-clear
        :options="options(['AVAILABLE', 'LOW', 'OUT_OF_STOCK'])"
        style="width: 140px"
      />
      <Button :loading="loading" @click="load(1)">查询</Button><Button :loading="loading" @click="load()">刷新</Button>
    </Space>
    <Table
      row-key="skuId"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 1200 }"
      :pagination="{ current, total, pageSize: 20, showSizeChanger: false }"
      @change="(p) => load(p.current)"
    >
      <template #bodyCell="{ column, record }">
        <Tag
          v-if="column.key === 'status'"
          :color="record.status === 'AVAILABLE' ? 'green' : 'orange'"
        >
          {{ labels[record.status] ?? record.status }}
        </Tag>
        <template v-else-if="column.key === 'updatedAt'">
          {{ displayTime(record.updatedAt) }}
        </template>
        <Space v-else-if="column.key === 'action'">
          <Button
            type="link"
            @click="
              router.push({
                name: 'PuyuAdmin_product-detail',
                query: { id: record.productId },
              })
            "
          >
            商品
          </Button>
          <Button
            v-if="permission.canManageInventory()"
            type="link"
            @click="openAdjust(record as Stock)"
          >
            调整库存
          </Button>
          <Button type="link" @click="showHistory(record as Stock)">
            记录
          </Button>
        </Space>
      </template>
    </Table>
  </Card>
  <Modal
    :open="adjusting"
    title="调整库存"
    :footer="null"
    :closable="!saving"
    :mask-closable="false"
    @cancel="adjusting = false"
  >
    <p class="mb-4">
      {{ selected?.productName }} / {{ selected?.code }} · 当前库存
      {{ selected?.stock }}
    </p>
    <Alert
      class="mb-4"
      type="warning"
      message="此操作会修改真实库存并记录流水。输入变化量，不是目标库存；负数表示减少。"
    />
    <Form layout="vertical">
      <Form.Item label="库存变化量" required>
        <Input v-model:value="form.delta" aria-label="库存变化量" />
      </Form.Item>
      <Form.Item label="低库存阈值" required>
        <Input v-model:value="form.lowThreshold" aria-label="低库存阈值" />
      </Form.Item>
      <Form.Item label="调整原因" required>
        <Input.TextArea
          v-model:value="form.reason"
          aria-label="调整原因"
          :maxlength="1000"
        />
      </Form.Item>
    </Form>
    <Space>
      <Button type="primary" :loading="saving" @click="save">确认调整</Button><Button :disabled="saving" @click="adjusting = false"> 取消 </Button>
    </Space>
  </Modal>
  <Drawer
    :open="historyOpen"
    title="库存调整记录"
    width="min(900px, 100vw)"
    @close="historyOpen = false"
  >
    <Button
      :loading="historyLoading"
      class="mb-4"
      @click="selected && showHistory(selected)"
    >
      刷新记录
    </Button>
    <Table
      row-key="id"
      :columns="historyColumns"
      :data-source="history"
      :loading="historyLoading"
      :scroll="{ x: 760 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'createdAt'">
          {{ displayTime(record.createdAt) }}
        </template>
      </template>
    </Table>
  </Drawer>
  <ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
