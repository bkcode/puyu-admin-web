<script setup lang="ts">
import type { Order, OrderAction, OrderPrint } from '#/data/operationsApi';

import { onMounted, reactive, ref } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
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
  canTransitionOrder,
  createOperationRequest,
  OperationsService,
} from '#/application/operationsService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import CreateOrder from './CreateOrder.vue';
import {
  displayTime,
  labels,
  options,
  printOrderElement,
} from './operationsUi';
const printElement = ref<HTMLElement>();
const rows = ref<Order[]>([]);
const selected = ref<Order>();
const printData = ref<OrderPrint>();
const query = reactive({
  keyword: '',
  status: undefined as string | undefined,
});
const current = ref(1);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const detailOpen = ref(false);
const detailLoading = ref(false);
const action = ref<OrderAction>();
const reason = ref('');
const createOpen = ref(false);
const creating = ref(false);
let command = createOperationRequest();
let revision = 0;
const actionLabels: Record<OrderAction, string> = {
  CONFIRM: '确认订单',
  REDEEM: '核销订单',
  CANCEL: '取消订单',
};
const columns = [
  { title: '订单编号', dataIndex: 'code' },
  { title: '联系人', dataIndex: 'contact' },
  { title: '电话', dataIndex: 'phone' },
  { title: '金额', dataIndex: 'amount' },
  { title: '状态', key: 'status' },
  { title: '创建时间', key: 'createdAt' },
  { title: '操作', key: 'action' },
];
const lineColumns = [
  { title: '商品', dataIndex: 'productName' },
  { title: 'SKU', dataIndex: 'skuCode' },
  { title: '规格', dataIndex: 'spec' },
  { title: '数量', dataIndex: 'quantity' },
  { title: '单价', dataIndex: 'unitPrice' },
  { title: '小计', dataIndex: 'amount' },
];
function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : '请求失败';
}
async function load(page = current.value) {
  const request = ++revision;
  current.value = page;
  loading.value = true;
  try {
    const data = await OperationsService.orders({ ...query }, page);
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
async function detail(row: Order) {
  detailLoading.value = true;
  detailOpen.value = true;
  selected.value = undefined;
  printData.value = undefined;
  try {
    selected.value = await OperationsService.order(row.id);
  } catch (error) {
    fail(error);
  } finally {
    detailLoading.value = false;
  }
}
function choose(next: OrderAction) {
  action.value = next;
  reason.value = '';
  command = createOperationRequest();
}
async function transition() {
  if (!selected.value || !action.value || saving.value) return;
  if (!canTransitionOrder(selected.value.status, action.value)) {
    error.value = '订单状态已变化，请刷新';
    return;
  }
  if (action.value === 'CANCEL' && !reason.value.trim()) {
    error.value = '请填写取消原因';
    return;
  }
  saving.value = true;
  try {
    selected.value = await OperationsService.transitionOrder(
      selected.value.id,
      command({
        version: selected.value.version,
        action: action.value,
        reason: reason.value,
      }),
    );
    action.value = undefined;
    printData.value = undefined;
    message.success('订单状态已更新');
    await load();
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
async function preparePrint() {
  if (!selected.value) return;
  detailLoading.value = true;
  try {
    printData.value = await OperationsService.printOrder(selected.value.id);
  } catch (error) {
    fail(error);
  } finally {
    detailLoading.value = false;
  }
}
function print() {
  try {
    if (printElement.value) printOrderElement(printElement.value);
  } catch (error) {
    fail(error);
  }
}
async function created(order: Order) {
  createOpen.value = false;
  selected.value = order;
  printData.value = undefined;
  detailOpen.value = true;
  message.success('订单已创建');
  query.keyword = '';
  query.status = undefined;
  await load(1);
}
onMounted(() => load(1));
</script>
<template>
  <Card>
    <Alert
      class="mb-4"
      type="info"
      message="无支付订单：支持创建、确认、核销及取消。"
    />
    <Button
      v-if="permission.canManageOrders()"
      class="mb-4"
      type="primary"
      @click="createOpen = true"
    >
      新增订单
    </Button>
    <Space wrap class="mb-4">
      <Input
        v-model:value="query.keyword"
        aria-label="订单搜索"
        placeholder="订单编号 / 联系人 / 手机号"
        @press-enter="load(1)"
      /><Select
        v-model:value="query.status"
        aria-label="订单状态"
        placeholder="全部状态"
        :options="
          options([
            'PENDING_CONFIRMATION',
            'CONFIRMED',
            'REDEEMED',
            'CANCELLED',
          ])
        "
        allow-clear
        style="width: 160px"
      /><Button :loading="loading" @click="load(1)">查询</Button><Button :loading="loading" @click="load()">刷新</Button>
    </Space>
    <Table
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 950 }"
      :pagination="{ current, total, pageSize: 20, showSizeChanger: false }"
      @change="(p) => load(p.current)"
    >
      <template #bodyCell="{ column, record }">
        <Tag v-if="column.key === 'status'">{{ labels[record.status] }}</Tag><template v-else-if="column.key === 'createdAt'">
          {{ displayTime(record.createdAt) }}
</template><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="detail(record as Order)"
        >
          详情
        </Button>
      </template>
    </Table>
  </Card>
  <Drawer
    :open="createOpen"
    title="新增无支付订单"
    width="min(1000px, 100vw)"
    :mask-closable="false"
    :closable="!creating"
    :keyboard="!creating"
    @close="createOpen = false"
  >
    <CreateOrder
      v-if="createOpen"
      @created="created"
      @cancel="createOpen = false"
      @busy="(value) => (creating = value)"
    />
  </Drawer>
  <Drawer
    :open="detailOpen"
    title="订单详情"
    width="min(1000px, 100vw)"
    @close="
      detailOpen = false;
      printData = undefined;
    "
  >
    <Card :loading="detailLoading" :bordered="false">
      <template v-if="selected">
        <Descriptions bordered :column="1">
          <Descriptions.Item label="编号">
            {{ selected.code }}
</Descriptions.Item><Descriptions.Item label="状态">
            {{ labels[selected.status] }}
</Descriptions.Item><Descriptions.Item label="联系人">
            {{ selected.contact }} / {{ selected.phone }}
</Descriptions.Item><Descriptions.Item label="金额">
            {{ selected.amount }}
</Descriptions.Item><Descriptions.Item label="备注">
            {{ selected.remark || '—' }}
          </Descriptions.Item>
        </Descriptions>
        <Table
          class="my-4"
          row-key="skuId"
          :columns="lineColumns"
          :data-source="selected.items"
          :pagination="false"
          :scroll="{ x: 700 }"
        />
        <Space wrap>
          <template v-if="permission.canManageOrders()">
            <Button
              v-for="next in ['CONFIRM', 'REDEEM', 'CANCEL'] as OrderAction[]"
              v-show="canTransitionOrder(selected.status, next)"
              :key="next"
              :danger="next === 'CANCEL'"
              @click="choose(next)"
            >
              {{ actionLabels[next] }}
            </Button>
          </template>
          <Button @click="preparePrint">打单预览</Button><Button @click="detail(selected)">刷新详情</Button>
        </Space>
        <section v-if="printData" ref="printElement" class="order-print mt-5">
          <h2 class="mb-3 text-lg">
            {{ printData.storeName }} · 订单 {{ printData.order.code }}
          </h2>
          <p>
            {{ printData.merchantName }} / {{ printData.address }} /
            {{ printData.contactPhone }}
          </p>
          <p>
            客户：{{ printData.order.contact }} / {{ printData.order.phone }} ·
            {{ labels[printData.order.status] }}
          </p>
          <table class="print-lines">
            <thead>
              <tr>
                <th>商品 / SKU</th>
                <th>规格</th>
                <th>数量</th>
                <th>单价</th>
                <th>小计</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in printData.order.items" :key="line.skuId">
                <td>{{ line.productName }} / {{ line.skuCode }}</td>
                <td>{{ line.spec }}</td>
                <td>{{ line.quantity }}</td>
                <td>{{ line.unitPrice }}</td>
                <td>{{ line.amount }}</td>
              </tr>
            </tbody>
          </table>
          <p>
            合计：{{ printData.order.amount }} · {{ printData.order.remark }}
          </p>
          <Button class="no-print" @click="print">打印此订单</Button>
        </section>
      </template>
      <Alert
        v-else-if="!detailLoading"
        type="warning"
        message="详情加载失败，请关闭后重新打开。"
      />
    </Card>
  </Drawer>
  <Modal
    :open="!!action"
    :title="action ? actionLabels[action] : ''"
    :footer="null"
    :mask-closable="false"
    :closable="!saving"
    @cancel="action = undefined"
  >
    <p class="mb-4">操作对象：{{ selected?.code }}；请确认后提交。</p>
    <Form layout="vertical">
      <Form.Item label="原因 / 说明" :required="action === 'CANCEL'">
        <Input.TextArea
          v-model:value="reason"
          aria-label="订单操作原因"
          :maxlength="1000"
        />
      </Form.Item>
    </Form>
    <Space>
      <Button type="primary" :loading="saving" @click="transition">
        确认操作
</Button><Button :disabled="saving" @click="action = undefined"> 返回 </Button>
    </Space>
  </Modal>
  <ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
<style scoped>
.print-lines {
  width: 100%;
  margin: 16px 0;
  border-collapse: collapse;
}

.print-lines th,
.print-lines td {
  padding: 8px;
  text-align: left;
  border: 1px solid #ddd;
}
</style>
