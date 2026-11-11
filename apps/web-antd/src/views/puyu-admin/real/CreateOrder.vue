<script setup lang="ts">
import type { Order } from '#/data/operationsApi';
import type { Catalog, Sku } from '#/data/realAdminApi';

import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import {
  Alert,
  Button,
  Form,
  Input,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import {
  createOperationRequest,
  OperationsService,
  validateOrderItems,
} from '#/application/operationsService';
import { permission } from '#/infrastructure/permission/permission';

const emit = defineEmits<{
  busy: [value: boolean];
  cancel: [];
  created: [order: Order];
}>();
type DraftLine = {
  price: string;
  productName: string;
  quantity: string;
  skuCode: string;
  skuId: string;
  spec: string;
};
const form = reactive({ contact: '', phone: '', remark: '' });
const lines = ref<DraftLine[]>([]);
const keyword = ref('');
const products = ref<Catalog[]>([]);
const skus = ref<Sku[]>([]);
const productId = ref<string>();
const skuId = ref<string>();
const quantity = ref('1');
const productPage = ref(1);
const productTotal = ref(0);
const loading = ref(false);
const skuLoading = ref(false);
const saving = ref(false);
const error = ref('');
const command = createOperationRequest();
let productRevision = 0;
let skuRevision = 0;
const columns = [
  { title: '商品', dataIndex: 'productName' },
  { title: 'SKU编码', dataIndex: 'skuCode' },
  { title: '规格', dataIndex: 'spec' },
  { title: '参考零售价', dataIndex: 'price' },
  { title: '数量', key: 'quantity' },
  { title: '操作', key: 'action' },
];
function fail(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : '请求失败，请重试';
}
async function search(page = 1) {
  const revision = ++productRevision;
  ++skuRevision;
  productId.value = undefined;
  skuId.value = undefined;
  products.value = [];
  skus.value = [];
  loading.value = true;
  skuLoading.value = false;
  error.value = '';
  try {
    const result = await OperationsService.orderProducts(
      keyword.value.trim(),
      page,
    );
    if (revision === productRevision) {
      products.value = result.items;
      productPage.value = page;
      productTotal.value = Number(result.total);
    }
  } catch (error) {
    if (revision === productRevision) fail(error);
  } finally {
    if (revision === productRevision) loading.value = false;
  }
}
async function selectProduct(id: string) {
  const revision = ++skuRevision;
  productId.value = id;
  skuId.value = undefined;
  skus.value = [];
  skuLoading.value = true;
  error.value = '';
  try {
    const result = await OperationsService.orderSkus(id);
    if (revision === skuRevision) skus.value = result;
  } catch (error) {
    if (revision === skuRevision) fail(error);
  } finally {
    if (revision === skuRevision) skuLoading.value = false;
  }
}
function addLine() {
  error.value = '';
  const product = products.value.find((item) => item.id === productId.value);
  const sku = skus.value.find((item) => item.id === skuId.value);
  if (!product || !sku || sku.productId !== product.id) {
    error.value = '请先选择当前商品的SKU';
    return;
  }
  if (lines.value.some((item) => item.skuId === sku.id)) {
    error.value = '该SKU已在清单中，请直接修改数量';
    return;
  }
  const next = {
    productName: product.name,
    skuId: sku.id,
    skuCode: sku.code,
    spec: sku.spec,
    price: sku.price,
    quantity: quantity.value.trim(),
  };
  try {
    validateOrderItems([...lines.value, next]);
    lines.value.push(next);
    quantity.value = '1';
  } catch (error) {
    fail(error);
  }
}
async function submit() {
  if (saving.value || !permission.canManageOrders()) return;
  error.value = '';
  saving.value = true;
  emit('busy', true);
  try {
    const order = await OperationsService.createOrder(
      command({
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        remark: form.remark.trim(),
        items: lines.value.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity.trim(),
        })),
      }),
    );
    emit('created', order);
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
    emit('busy', false);
  }
}
onMounted(() => search());
onBeforeUnmount(() => {
  ++productRevision;
  ++skuRevision;
});
</script>

<template>
  <Form layout="vertical" :disabled="saving" @finish="submit">
    <Alert
      class="mb-4"
      type="info"
      message="创建本人门店无支付订单。商品与价格以提交时后台校验为准，创建后为待确认。"
    />
    <Form.Item label="联系人" required>
      <Input
        v-model:value="form.contact"
        aria-label="新订单联系人"
        :maxlength="160"
      />
    </Form.Item>
    <Form.Item label="联系电话" required>
      <Input
        v-model:value="form.phone"
        aria-label="新订单联系电话"
        :maxlength="11"
      />
    </Form.Item>
    <Form.Item label="选择商品" required>
      <Space wrap class="mb-3">
        <Input
          v-model:value="keyword"
          aria-label="下单商品搜索"
          placeholder="商品名称或编码"
          :maxlength="200"
          @press-enter.prevent="search(1)"
        /><Button :loading="loading" @click="search(1)">搜索商品</Button>
      </Space>
      <Select
        :value="productId"
        aria-label="下单商品"
        placeholder="选择已审核发布商品"
        :loading="loading"
        :disabled="saving || loading"
        style="width: 100%"
        :options="
          products.map((item) => ({
            value: item.id,
            label: `${item.name} · ${item.code}`,
          }))
        "
        @change="(value) => selectProduct(String(value))"
      />
      <Space class="mt-2">
        <Button
          :disabled="saving || loading || productPage <= 1"
          @click="search(productPage - 1)"
        >
          商品上一页
</Button><span>第{{ productPage }}页 / 共{{ productTotal }}件</span><Button
          :disabled="saving || loading || productPage * 20 >= productTotal"
          @click="search(productPage + 1)"
        >
          商品下一页
        </Button>
      </Space>
      <p v-if="!loading && !products.length" class="mt-2">
        没有符合条件的可下单商品，请调整搜索或先完成商品审核发布。
      </p>
    </Form.Item>
    <Form.Item label="选择SKU" required>
      <Select
        v-model:value="skuId"
        aria-label="下单SKU"
        :disabled="saving || !productId || skuLoading"
        :loading="skuLoading"
        placeholder="先选商品，再选SKU"
        style="width: 100%"
        :options="
          skus.map((item) => ({
            value: item.id,
            label: `${item.code} · ${item.spec} · 参考零售价 ¥${item.price}`,
          }))
        "
      />
      <p v-if="productId && !skuLoading && !skus.length" class="mt-2">
        当前商品没有启用SKU，请先在商品详情维护。
      </p>
    </Form.Item>
    <Form.Item label="数量" required>
      <Space>
        <Input
          v-model:value="quantity"
          aria-label="添加SKU数量"
          inputmode="decimal"
          placeholder="大于0，最多4位小数"
        /><Button
          :disabled="saving || !skuId || skuLoading || loading"
          @click="addLine"
        >
          添加明细
        </Button>
      </Space>
    </Form.Item>
    <Table
      row-key="skuId"
      :columns="columns"
      :data-source="lines"
      :pagination="false"
      :scroll="{ x: 850 }"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <Input
          v-if="column.key === 'quantity'"
          v-model:value="record.quantity"
          :aria-label="`数量 ${record.skuCode}`"
          inputmode="decimal"
          :disabled="saving"
          style="width: 140px"
        />
        <Button
          v-else-if="column.key === 'action'"
          danger
          type="link"
          :disabled="saving"
          @click="lines = lines.filter((item) => item.skuId !== record.skuId)"
        >
          移除
        </Button>
      </template>
    </Table>
    <Form.Item class="mt-4" label="备注">
      <Input.TextArea
        v-model:value="form.remark"
        aria-label="新订单备注"
        :maxlength="500"
        show-count
      />
    </Form.Item>
    <Alert v-if="error" class="my-4" type="error" show-icon :message="error" />
    <Space class="mt-4">
      <Button
        type="primary"
        :loading="saving"
        :disabled="!lines.length"
        @click="submit"
      >
        创建订单
</Button><Button :disabled="saving" @click="emit('cancel')">取消</Button>
    </Space>
  </Form>
</template>
