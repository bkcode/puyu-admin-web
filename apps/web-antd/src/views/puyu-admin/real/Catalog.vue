<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';

import type {
  Catalog,
  CatalogInput,
  Kind,
  Merchant,
  Sku,
  SkuInput,
} from '#/data/realAdminApi';
import type { SkuSpecificationEdit } from '#/data/skuSpecifications';

import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import { RealAdminService } from '#/application/realAdminService';
import {
  buildSkuInput,
  skuSpecificationLabels,
} from '#/data/skuSpecifications';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import CatalogBatch from './CatalogBatch.vue';
import CatalogWorkbook from './CatalogWorkbook.vue';
import ImageUpload from './ImageUpload.vue';

const props = defineProps<{ pageId: string }>();
const route = useRoute();
const router = useRouter();
const platform = computed(() => props.pageId.startsWith('platform-'));
const kind = computed<Kind>(() => {
  if (props.pageId.includes('category')) return 'CATEGORY';
  if (props.pageId.includes('brand')) return 'BRAND';
  return 'PRODUCT';
});
const noun = computed(
  () => ({ CATEGORY: '分类', BRAND: '品牌', PRODUCT: '商品' })[kind.value],
);
const fullForm = computed(
  () => !platform.value && props.pageId.endsWith('-form'),
);
const fullDetail = computed(() => props.pageId === 'product-detail');
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const rows = ref<Catalog[]>([]);
const current = ref<Catalog>();
const currentSku = ref<Sku>();
const skus = ref<Sku[]>([]);
const categories = ref<Catalog[]>([]);
const brands = ref<Catalog[]>([]);
const merchants = ref<Merchant[]>([]);
const pageNumber = ref(1);
const total = ref(0);
const keyword = ref('');
const review = ref<string>();
const owner = ref<string>();
const selectedKeys = ref<string[]>([]);
const batchBusy = ref(false);
const batchControls = ref<InstanceType<typeof CatalogBatch>>();
const supportsBatch = computed(() =>
  [
    'brand-list',
    'platform-brand-management',
    'platform-category-review',
    'platform-product-management',
    'product-category-list',
    'product-list',
  ].includes(props.pageId),
);
const selectedRows = computed(() =>
  rows.value.filter((row) => selectedKeys.value.includes(row.id)),
);
const canBatchSelect = computed(() => {
  if (!platform.value) return canEdit.value;
  if (kind.value === 'CATEGORY') return permission.canReviewCategory() === true;
  return (
    permission.canPublishProduct() === true ||
    permission.canOfflineProduct() === true
  );
});
const rowSelection = computed(() =>
  supportsBatch.value && canBatchSelect.value
    ? {
        selectedRowKeys: selectedKeys.value,
        preserveSelectedRowKeys: false,
        onChange: (keys: (number | string)[]) => {
          if (!batchBusy.value)
            selectedKeys.value = keys.filter(
              (key): key is string =>
                typeof key === 'string' &&
                rows.value.some((row) => row.id === key),
            );
        },
        getCheckboxProps: () => ({
          disabled: loading.value || saving.value || batchBusy.value,
        }),
      }
    : undefined,
);
const editorOpen = ref(false);
const detailOpen = ref(false);
const skuOpen = ref(false);
const decisionOpen = ref(false);
const decision = ref<'OFFLINE' | 'PUBLISH' | 'REJECT'>('PUBLISH');
const decisionReason = ref('');
const actionItem = ref<Catalog>();
const formRef = ref<FormInstance>();
const skuRef = ref<FormInstance>();
const required = [{ required: true, message: '请填写此项' }];
const money = [
  { pattern: /^\d+(\.\d{1,2})?$/, message: '请输入非负金额，最多两位小数' },
];
const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  HIDDEN: '未展示',
  PUBLISHED: '已发布',
  OFFLINE: '已下架',
};
const blank = (): CatalogInput => ({
  code: '',
  name: '',
  parentId: null,
  categoryId: null,
  brandId: null,
  imageUrls: [],
  imageFileIds: [],
  parameters: [],
  enabled: true,
  sortOrder: 0,
  showInMenu: true,
  remark: '',
  description: '',
  retailPrice: null,
  partnerPrice: null,
  wholesalePrice: null,
  costPrice: null,
  modelFileMark: 'UNCONFIRMED',
});
const form = reactive<CatalogInput>(blank());
const sku = reactive<SkuInput>({
  code: '',
  spec: '',
  price: '',
  stock: '0',
  partnerPrice: null,
  wholesalePrice: null,
  costPrice: null,
  enabled: true,
});
const skuDimensions = reactive<SkuSpecificationEdit>({
  rows: [],
  dirty: false,
  confirmed: false,
});
const supportsSkuDimensions = computed(
  () => current.value?.skuSpecificationSchemaVersion === 1,
);
const skuDimensionError = ref('');
const changedSkuSpec = computed(
  () => !!currentSku.value && sku.spec.trim() !== currentSku.value.spec.trim(),
);
const canEdit = computed(() => {
  if (kind.value === 'CATEGORY') return permission.canEditCategory() === true;
  if (kind.value === 'BRAND') return permission.canEditBrand() === true;
  return permission.canEditProduct() === true;
});
const canToggleSingle = computed(
  () => supportsBatch.value && !platform.value && canEdit.value,
);
const canGovern = computed(() => permission.canReviewCategory() === true);
const columns = computed(() => [
  { title: `${noun.value}名称`, dataIndex: 'name' },
  { title: '编码', dataIndex: 'code' },
  ...(platform.value ? [{ title: '提交商户', key: 'merchant' }] : []),
  ...(kind.value === 'PRODUCT'
    ? [
        { title: 'SKU数', dataIndex: 'skuCount' },
        { title: '零售价', dataIndex: 'retailPrice' },
      ]
    : []),
  { title: '启用状态', key: 'enabled' },
  { title: '审核状态', key: 'review' },
  { title: '展示状态', key: 'display' },
  { title: '处理原因', dataIndex: 'processReason' },
  { title: '操作', key: 'action', width: platform.value ? 290 : 250 },
]);
const skuColumns = [
  { title: 'SKU编码', dataIndex: 'code' },
  { title: '规格组合', dataIndex: 'spec' },
  { title: '规格维度', key: 'specifications' },
  { title: '维度核对', key: 'specificationStatus' },
  { title: '零售价', dataIndex: 'price' },
  { title: '合作价', dataIndex: 'partnerPrice' },
  { title: '批发价', dataIndex: 'wholesalePrice' },
  { title: '成本价', dataIndex: 'costPrice' },
  { title: '库存', dataIndex: 'stock' },
  { title: '状态', key: 'enabled' },
  { title: '操作', key: 'action' },
];
const categoryOptions = computed(() =>
  categories.value
    .filter((item) => item.id !== current.value?.id)
    .map((item) => ({
      label: `${'　'.repeat((item.level ?? 1) - 1)}${item.name}（${item.code}）`,
      value: item.id,
    })),
);
const brandOptions = computed(() =>
  brands.value.map((item) => ({
    label: `${item.name}（${item.code}）`,
    value: item.id,
  })),
);
function go(id: string, recordId?: string) {
  return router.push({
    name: `PuyuAdmin_${id}`,
    query: recordId ? { id: recordId } : {},
  });
}
function fail(exception: unknown) {
  errorMessage.value =
    exception instanceof Error ? exception.message : '请求失败，请重试';
}
function fill(item?: Catalog) {
  const next = blank();
  if (item)
    for (const key of Object.keys(next) as (keyof CatalogInput)[])
      Object.assign(next, { [key]: item[key] });
  else if (kind.value === 'PRODUCT')
    next.parameters = [
      { key: 'material', name: '材质', value: '', unit: '', visible: true },
    ];
  Object.assign(form, JSON.parse(JSON.stringify(next)));
}
async function refreshList() {
  if (batchBusy.value) return;
  selectedKeys.value = [];
  loading.value = true;
  try {
    const result = await RealAdminService.catalog(
      kind.value,
      {
        keyword: keyword.value,
        reviewStatus: review.value,
        merchantId: owner.value,
      },
      pageNumber.value,
    );
    rows.value = result.items;
    total.value = Number(result.total);
  } catch (error) {
    fail(error);
  } finally {
    loading.value = false;
  }
}
async function completedBatch(count = selectedRows.value.length) {
  selectedKeys.value = [];
  message.success(
    `操作已成功（${count}条）；正在重新读取列表，若读取失败请刷新，不要重复提交`,
  );
  await refreshList();
}
async function refreshWorkbook(_result: unknown, productId: null | string) {
  if (productId === null) {
    await refreshList();
    return;
  }
  if (!fullDetail.value || current.value?.id !== productId) return;
  loading.value = true;
  try {
    current.value = await RealAdminService.item('PRODUCT', productId);
    skus.value = await RealAdminService.skus(productId);
  } catch (error) {
    fail(error);
  } finally {
    loading.value = false;
  }
}
async function load() {
  selectedKeys.value = [];
  current.value = undefined;
  editorOpen.value = false;
  detailOpen.value = false;
  skuOpen.value = false;
  decisionOpen.value = false;
  pageNumber.value = 1;
  loading.value = true;
  try {
    if (platform.value) {
      const merchantPage = await RealAdminService.merchants('', 1, 200);
      merchants.value = merchantPage.items;
    } else {
      [categories.value, brands.value] = await Promise.all([
        RealAdminService.catalogChoices('CATEGORY'),
        RealAdminService.catalogChoices('BRAND'),
      ]);
    }
    if (
      (fullDetail.value ||
        fullForm.value ||
        props.pageId === 'platform-category-form') &&
      typeof route.query.id === 'string'
    ) {
      current.value = await RealAdminService.item(kind.value, route.query.id);
      fill(current.value);
      if (kind.value === 'PRODUCT')
        skus.value = await RealAdminService.skus(current.value.id);
    } else fill();
    if (!fullForm.value && !fullDetail.value) await refreshList();
  } catch (error) {
    fail(error);
  } finally {
    loading.value = false;
  }
}
async function showDetail(item: Catalog) {
  if (!platform.value && item.kind === 'PRODUCT') {
    await go('product-detail', item.id);
    return;
  }
  loading.value = true;
  try {
    current.value = await RealAdminService.item(item.kind, item.id);
    if (item.kind === 'PRODUCT')
      skus.value = await RealAdminService.skus(item.id);
    detailOpen.value = true;
  } catch (error) {
    fail(error);
  } finally {
    loading.value = false;
  }
}
async function editItem(item?: Catalog) {
  if (kind.value === 'PRODUCT') {
    await go('product-form', item?.id);
    return;
  }
  if (kind.value === 'BRAND') {
    await go('brand-form', item?.id);
    return;
  }
  current.value = item;
  fill(item);
  editorOpen.value = true;
}
async function save() {
  try {
    await formRef.value?.validate();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '请完善必填字段并检查价格格式';
    return;
  }
  saving.value = true;
  try {
    const content = JSON.parse(JSON.stringify(form)) as CatalogInput;
    for (const key of [
      'retailPrice',
      'partnerPrice',
      'wholesalePrice',
      'costPrice',
    ] as const)
      if (content[key] === '') content[key] = null;
    const saved = await RealAdminService.saveCatalog(
      kind.value,
      content,
      current.value,
    );
    message.success(`${noun.value}已保存`);
    editorOpen.value = false;
    if (kind.value === 'PRODUCT') await go('product-detail', saved.id);
    else if (fullForm.value) await go('brand-list');
    else await refreshList();
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
async function submit(item: Catalog) {
  saving.value = true;
  try {
    const updated = await RealAdminService.submit(item);
    message.success('已提交平台审核');
    if (fullDetail.value) current.value = updated;
    else await refreshList();
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
function showDecision(item: Catalog, action: 'OFFLINE' | 'PUBLISH' | 'REJECT') {
  actionItem.value = item;
  decision.value = action;
  decisionReason.value = '';
  decisionOpen.value = true;
}
async function applyDecision() {
  if (!actionItem.value) return;
  if (decision.value !== 'PUBLISH' && !decisionReason.value.trim()) {
    errorMessage.value = '驳回或下架必须填写处理原因';
    return;
  }
  saving.value = true;
  try {
    await RealAdminService.decide(
      actionItem.value,
      decision.value,
      decisionReason.value,
    );
    decisionOpen.value = false;
    message.success('平台处理结果已保存');
    await refreshList();
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
function openSku(item?: Sku) {
  currentSku.value = item;
  Object.assign(
    sku,
    item
      ? {
          code: item.code,
          spec: item.spec,
          price: item.price,
          stock: item.stock,
          enabled: item.enabled,
          partnerPrice: item.partnerPrice,
          wholesalePrice: item.wholesalePrice,
          costPrice: item.costPrice,
        }
      : {
          code: '',
          spec: '',
          price: '',
          stock: '0',
          enabled: true,
          partnerPrice: null,
          wholesalePrice: null,
          costPrice: null,
        },
  );
  Object.assign(skuDimensions, {
    rows: (item?.specifications ?? []).map((row) => ({ ...row })),
    dirty: false,
    confirmed: false,
  });
  skuDimensionError.value = '';
  skuOpen.value = true;
}
function changeSkuDimension() {
  skuDimensions.dirty = true;
  skuDimensions.confirmed = false;
  skuDimensionError.value = '';
}
function addSkuDimension() {
  if (!supportsSkuDimensions.value || skuDimensions.rows.length >= 6) return;
  skuDimensions.rows.push({ name: '', value: '' });
  changeSkuDimension();
}
function removeSkuDimension(index: number) {
  if (!supportsSkuDimensions.value) return;
  skuDimensions.rows.splice(index, 1);
  changeSkuDimension();
}
async function saveSku() {
  if (!current.value || saving.value) return;
  try {
    await skuRef.value?.validate();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : '请完善SKU必填字段并检查价格和库存格式';
    return;
  }
  try {
    buildSkuInput(
      sku,
      current.value.skuSpecificationSchemaVersion,
      skuDimensions,
    );
  } catch (error) {
    skuDimensionError.value =
      error instanceof Error ? error.message : '请检查规格维度';
    return;
  }
  saving.value = true;
  try {
    const content = { ...sku };
    for (const key of ['partnerPrice', 'wholesalePrice', 'costPrice'] as const)
      if (content[key] === '') content[key] = null;
    await RealAdminService.saveProductSku(
      current.value,
      content,
      currentSku.value,
      skuDimensions,
    );
    current.value = await RealAdminService.item('PRODUCT', current.value.id);
    skus.value = await RealAdminService.skus(current.value.id);
    skuOpen.value = false;
    message.success('SKU已保存，商品需重新提交审核');
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
watch(() => [props.pageId, route.query.id], load, { immediate: true });
</script>

<template>
  <Card v-if="!fullForm && !fullDetail" :inert="batchBusy ? true : undefined">
    <Space class="mb-4" wrap>
      <Input
        v-model:value="keyword"
        aria-label="目录搜索"
        placeholder="输入名称或编码"
        @press-enter="
          pageNumber = 1;
          refreshList();
        "
      />
      <Select
        v-model:value="review"
        aria-label="审核状态筛选"
        placeholder="全部审核状态"
        allow-clear
        style="width: 150px"
        :options="
          ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'].map((value) => ({
            value,
            label: statusLabels[value],
          }))
        "
      />
      <Select
        v-if="platform"
        v-model:value="owner"
        aria-label="提交商户筛选"
        placeholder="全部提交商户"
        allow-clear
        show-search
        option-filter-prop="label"
        style="width: 220px"
        :options="
          merchants.map((item) => ({
            label: item.content.name,
            value: item.id,
          }))
        "
      />
      <Button
        @click="
          pageNumber = 1;
          refreshList();
        "
      >
        查询
</Button><Button @click="refreshList">刷新</Button>
      <Button v-if="canEdit" type="primary" @click="editItem()">
        新增{{ noun }}
      </Button>
    </Space>
    <CatalogWorkbook
      v-if="!platform && kind === 'PRODUCT'"
      :context="{ kind: 'product', query: { keyword, reviewStatus: review } }"
      :disabled="loading || saving"
      @imported="refreshWorkbook"
    />
    <CatalogBatch
      v-if="supportsBatch"
      ref="batchControls"
      :kind="kind"
      :platform="platform"
      :rows="selectedRows"
      :disabled="loading || saving"
      @clear="selectedKeys = []"
      @busy="(value) => (batchBusy = value)"
      @completed="completedBatch"
    />
    <Table
      row-key="id"
      :row-selection="rowSelection"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 1000 }"
      :pagination="{
        current: pageNumber,
        total,
        pageSize: 20,
        showSizeChanger: false,
      }"
      @change="
        (pagination) => {
          if (!batchBusy) {
            pageNumber = pagination.current ?? 1;
            refreshList();
          }
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'merchant'">
          {{
            merchants.find((item) => item.id === record.merchantId)?.content
              .name || record.merchantId
          }}
        </template>
        <Tag v-if="column.key === 'enabled'">
          {{ record.enabled ? '启用' : '停用' }}
        </Tag>
        <Tag
          v-if="column.key === 'review'"
          :color="
            record.reviewStatus === 'APPROVED'
              ? 'green'
              : record.reviewStatus === 'REJECTED'
                ? 'red'
                : 'blue'
          "
        >
          {{ statusLabels[record.reviewStatus] }}
        </Tag>
        <Tag v-if="column.key === 'display'">
          {{ statusLabels[record.displayStatus] }}
        </Tag>
        <Space v-if="column.key === 'action'" size="small" wrap>
          <Button type="link" @click="showDetail(record as Catalog)">
            详情
          </Button>
          <Button
            v-if="canEdit"
            type="link"
            @click="editItem(record as Catalog)"
          >
            编辑
          </Button>
          <Button
            v-if="canToggleSingle"
            type="link"
            :danger="record.enabled"
            :disabled="loading || saving || batchBusy"
            @click="batchControls?.openSingle(record as Catalog)"
          >
            {{ record.enabled ? '停用' : '启用' }}
          </Button>
          <Button
            v-if="
              permission.canSubmitCatalog() &&
              record.reviewStatus !== 'PENDING' &&
              record.displayStatus !== 'PUBLISHED'
            "
            type="link"
            :loading="saving"
            @click="submit(record as Catalog)"
          >
            提交审核
          </Button>
          <Button
            v-if="canGovern && record.reviewStatus === 'PENDING'"
            type="link"
            @click="showDecision(record as Catalog, 'PUBLISH')"
          >
            通过并发布
          </Button>
          <Button
            v-if="canGovern && record.reviewStatus === 'PENDING'"
            type="link"
            danger
            @click="showDecision(record as Catalog, 'REJECT')"
          >
            驳回
          </Button>
          <Button
            v-if="canGovern && record.displayStatus === 'PUBLISHED'"
            type="link"
            danger
            @click="showDecision(record as Catalog, 'OFFLINE')"
          >
            下架
          </Button>
        </Space>
      </template>
    </Table>
  </Card>

  <component
    :is="fullForm ? Card : Drawer"
    v-if="fullForm || editorOpen"
    :open="editorOpen"
    :title="`${current ? '编辑' : '新增'}${noun}`"
    width="min(760px, 100vw)"
    @close="editorOpen = false"
  >
    <Form ref="formRef" :model="form" layout="vertical" name="catalog">
      <div class="form-grid">
        <Form.Item :label="`${noun}名称`" name="name" :rules="required">
          <Input v-model:value="form.name" :maxlength="160" />
        </Form.Item>
        <Form.Item :label="`${noun}编码`" name="code" :rules="required">
          <Input v-model:value="form.code" :maxlength="64" />
        </Form.Item>
        <Form.Item v-if="kind === 'CATEGORY'" label="上级分类" name="parentId">
          <Select
            :value="form.parentId ?? undefined"
            @change="
              (value) =>
                (form.parentId = typeof value === 'string' ? value : null)
            "
            :options="categoryOptions"
            placeholder="无上级（一级分类）"
            allow-clear
          />
        </Form.Item>
        <Form.Item
          v-if="kind === 'PRODUCT'"
          label="商品分类"
          name="categoryId"
          :rules="required"
        >
          <Select
            :value="form.categoryId ?? undefined"
            @change="
              (value) =>
                (form.categoryId = typeof value === 'string' ? value : null)
            "
            :options="categoryOptions"
            placeholder="请选择分类"
          />
        </Form.Item>
        <Form.Item v-if="kind === 'PRODUCT'" label="商品品牌" name="brandId">
          <Select
            :value="form.brandId ?? undefined"
            @change="
              (value) =>
                (form.brandId = typeof value === 'string' ? value : null)
            "
            :options="brandOptions"
            placeholder="请选择品牌"
            allow-clear
          />
        </Form.Item>
        <Form.Item label="启用状态" name="enabled">
          <Switch
            v-model:checked="form.enabled"
            checked-children="启用"
            un-checked-children="停用"
          />
        </Form.Item>
        <Form.Item label="排序" name="sortOrder">
          <InputNumber v-model:value="form.sortOrder" :min="0" :precision="0" />
        </Form.Item>
        <Form.Item
          v-if="kind === 'CATEGORY'"
          label="商城菜单展示"
          name="showInMenu"
        >
          <Switch v-model:checked="form.showInMenu" />
        </Form.Item>
        <template v-if="kind === 'PRODUCT'">
          <Form.Item label="零售价" name="retailPrice" :rules="money">
            <Input
              :value="form.retailPrice ?? ''"
              @update:value="(value) => (form.retailPrice = String(value))"
              placeholder="例如100.00"
            />
          </Form.Item>
          <Form.Item label="合作价" name="partnerPrice" :rules="money">
            <Input
              :value="form.partnerPrice ?? ''"
              @update:value="(value) => (form.partnerPrice = String(value))"
            />
          </Form.Item>
          <Form.Item
            label="批发价（预留）"
            name="wholesalePrice"
            :rules="money"
          >
            <Input
              :value="form.wholesalePrice ?? ''"
              @update:value="(value) => (form.wholesalePrice = String(value))"
            />
          </Form.Item>
          <Form.Item label="成本价" name="costPrice" :rules="money">
            <Input
              :value="form.costPrice ?? ''"
              @update:value="(value) => (form.costPrice = String(value))"
            />
          </Form.Item>
          <Form.Item label="模型文件标记" name="modelFileMark">
            <Select
              v-model:value="form.modelFileMark"
              :options="[
                { label: '待确认', value: 'UNCONFIRMED' },
                { label: '有', value: 'PRESENT' },
                { label: '无', value: 'NONE' },
              ]"
            />
          </Form.Item>
        </template>
      </div>
      <Form.Item
        :label="
          kind === 'PRODUCT'
            ? '商品图片'
            : kind === 'BRAND'
              ? '品牌Logo'
              : '分类图标'
        "
      >
        <ImageUpload
          v-model="form.imageFileIds"
          :multiple="kind === 'PRODUCT'"
          @error="errorMessage = $event"
        />
      </Form.Item>
      <template v-if="kind === 'PRODUCT'">
        <h3 class="mb-3 font-medium">商品参数</h3>
        <div
          v-for="(parameter, index) in form.parameters"
          :key="index"
          class="parameter-row"
        >
          <Form.Item
            label="参数标识"
            :name="['parameters', index, 'key']"
            :rules="required"
          >
            <Input v-model:value="parameter.key" />
          </Form.Item>
          <Form.Item
            label="参数名称"
            :name="['parameters', index, 'name']"
            :rules="required"
          >
            <Input v-model:value="parameter.name" />
          </Form.Item>
          <Form.Item
            label="参数值"
            :name="['parameters', index, 'value']"
            :rules="required"
          >
            <Input v-model:value="parameter.value" />
          </Form.Item>
          <Form.Item label="单位">
            <Input v-model:value="parameter.unit" />
          </Form.Item>
          <Checkbox v-model:checked="parameter.visible">商城展示</Checkbox>
        </div>
        <Button
          class="mb-5"
          @click="
            form.parameters.push({
              key: '',
              name: '',
              value: '',
              unit: '',
              visible: true,
            })
          "
        >
          添加参数
        </Button>
        <Alert
          class="mb-4"
          type="info"
          show-icon
          message="保存商品后，在商品详情内创建SKU。提交审核前须有图片、有效分类和至少一个启用的SKU。"
        />
      </template>
      <Form.Item
        :label="kind === 'PRODUCT' ? '商品详情' : '简介'"
        name="description"
      >
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item label="备注" name="remark">
        <Input.TextArea v-model:value="form.remark" :rows="2" />
      </Form.Item>
    </Form>
    <Space>
      <Button type="primary" :loading="saving" @click="save">
        保存{{ noun }}
</Button><Button
        :disabled="saving"
        @click="
          fullForm
            ? go(kind === 'PRODUCT' ? 'product-list' : 'brand-list')
            : (editorOpen = false)
        "
      >
        取消
      </Button>
    </Space>
  </component>

  <component
    :is="fullDetail ? Card : Drawer"
    v-if="(fullDetail || detailOpen) && current"
    :open="detailOpen"
    :title="`${noun}详情`"
    width="min(1000px, 100vw)"
    @close="detailOpen = false"
  >
    <Descriptions bordered :column="2">
      <Descriptions.Item label="名称">{{ current.name }}</Descriptions.Item><Descriptions.Item label="编码">{{ current.code }}</Descriptions.Item>
      <Descriptions.Item label="审核状态">
        {{ statusLabels[current.reviewStatus] }}
</Descriptions.Item><Descriptions.Item label="展示状态">
        {{ statusLabels[current.displayStatus] }}
      </Descriptions.Item>
      <Descriptions.Item label="启用状态">
        {{ current.enabled ? '启用' : '停用' }}
</Descriptions.Item><Descriptions.Item label="排序">
        {{ current.sortOrder }}
      </Descriptions.Item>
      <Descriptions.Item label="平台处理原因" :span="2">
        {{ current.processReason || '—' }}
      </Descriptions.Item>
      <Descriptions.Item label="图片文件ID" :span="2">
        {{ current.imageFileIds.join('、') || '未上传' }}
      </Descriptions.Item>
      <Descriptions.Item label="详情 / 简介" :span="2">
        {{ current.description || '—' }}
      </Descriptions.Item>
      <template v-if="current.kind === 'PRODUCT'">
        <Descriptions.Item label="零售价">
          {{ current.retailPrice || '—' }}
</Descriptions.Item><Descriptions.Item label="合作价">
          {{ current.partnerPrice || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="批发价">
          {{ current.wholesalePrice || '—' }}
</Descriptions.Item><Descriptions.Item label="成本价">
          {{ current.costPrice || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="商品参数" :span="2">
          <span
            v-for="parameter in current.parameters"
            :key="parameter.key"
            class="mr-4"
            >{{ parameter.name }}：{{ parameter.value }}
            {{ parameter.unit }}</span>
        </Descriptions.Item>
      </template>
    </Descriptions>
    <template v-if="current.kind === 'PRODUCT'">
      <div class="sku-title">
        <h3>SKU 明细</h3>
        <Button
          v-if="permission.canEditProduct()"
          type="primary"
          @click="openSku()"
        >
          新增 SKU
        </Button>
      </div>
      <CatalogWorkbook
        v-if="fullDetail && !platform"
        :key="current.id"
        :context="{
          kind: 'sku',
          productId: current.id,
          productName: current.name,
        }"
        :disabled="loading || saving || skuOpen"
        @imported="refreshWorkbook"
      />
      <Table
        row-key="id"
        :columns="skuColumns"
        :data-source="skus"
        :pagination="false"
        :scroll="{ x: 800 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'enabled'">
            {{ record.enabled ? '启用' : '停用' }}
          </template>
          <template v-if="column.key === 'specifications'">
            {{
              (record.specifications ?? [])
                .map(
                  (row: { name: string; value: string }) =>
                    `${row.name}：${row.value}`,
                )
                .join(' / ') || '未维护维度'
            }}
          </template>
          <Tag
            v-if="column.key === 'specificationStatus'"
            :color="
              record.specificationStatus === 'REVIEW_REQUIRED'
                ? 'orange'
                : record.specificationStatus === 'VERIFIED'
                  ? 'green'
                  : undefined
            "
          >
            {{
              skuSpecificationLabels[
                (record as Sku).specificationStatus ?? 'LEGACY'
              ]
            }}
          </Tag>
          <Button
            v-if="column.key === 'action' && permission.canEditProduct()"
            type="link"
            @click="openSku(record as Sku)"
          >
            编辑 SKU
          </Button>
        </template>
      </Table>
    </template>
    <Space class="mt-5" v-if="fullDetail">
      <Button
        v-if="permission.canEditProduct()"
        @click="go('product-form', current.id)"
      >
        编辑商品
      </Button>
      <Button
        v-if="
          permission.canSubmitCatalog() &&
          current.reviewStatus !== 'PENDING' &&
          current.displayStatus !== 'PUBLISHED'
        "
        type="primary"
        :loading="saving"
        @click="submit(current)"
      >
        提交审核
      </Button>
      <Button @click="go('product-list')">返回商品列表</Button>
    </Space>
  </component>
  <Alert
    v-if="fullDetail && !current && !loading"
    type="info"
    message="请从商品列表进入详情"
  />

  <Modal
    :open="skuOpen"
    :title="currentSku ? '编辑 SKU' : '新增 SKU'"
    :footer="null"
    @cancel="skuOpen = false"
  >
    <Form ref="skuRef" :model="sku" layout="vertical" name="sku">
      <Form.Item label="SKU编码" name="code" :rules="required">
        <Input v-model:value="sku.code" />
      </Form.Item>
      <Form.Item label="规格组合" name="spec" :rules="required">
        <Input
          v-model:value="sku.spec"
          aria-label="自由规格组合"
          placeholder="例如：原木色 / 120cm"
          @update:value="skuDimensions.confirmed = false"
        />
      </Form.Item>
      <section class="mb-5" aria-label="SKU规格维度">
        <h3 class="mb-3 font-medium">
          规格维度
          <Tag>
            {{
              skuSpecificationLabels[
                currentSku?.specificationStatus ?? 'LEGACY'
              ]
            }}
          </Tag>
        </h3>
        <Alert
          v-if="!supportsSkuDimensions"
          type="info"
          show-icon
          message="后端尚未支持规格维度维护；仍可保存自由规格和价格，本次不会发送规格维度。"
        />
        <template v-else>
          <Alert
            v-if="currentSku?.specificationStatus === 'REVIEW_REQUIRED'"
            class="mb-3"
            type="warning"
            show-icon
            message="规格维度待复核：请按自由规格核对名称和值；只保存价格不会自动完成核对。未核对维度不参与商城分组匹配。"
          />
          <p class="mb-3">
            维度与自由规格分别维护，不会自动解析。最多6组，名称40字、值80字；删除全部行并保存会明确清空维度，恢复为“未维护维度”。
          </p>
          <div
            v-for="(dimension, index) in skuDimensions.rows"
            :key="index"
            class="sku-dimension-row"
          >
            <Form.Item :label="`规格名称 ${index + 1}`">
              <Input
                v-model:value="dimension.name"
                :aria-label="`规格名称 ${index + 1}`"
                :maxlength="40"
                :disabled="saving"
                @update:value="changeSkuDimension"
              />
            </Form.Item>
            <Form.Item :label="`规格值 ${index + 1}`">
              <Input
                v-model:value="dimension.value"
                :aria-label="`规格值 ${index + 1}`"
                :maxlength="80"
                :disabled="saving"
                @update:value="changeSkuDimension"
              />
            </Form.Item>
            <Button
              :aria-label="`删除第${index + 1}组规格维度`"
              :disabled="saving"
              @click="removeSkuDimension(index)"
            >
              删除
            </Button>
          </div>
          <Button
            class="mb-3"
            :disabled="saving || skuDimensions.rows.length >= 6"
            @click="addSkuDimension"
          >
            添加规格维度
          </Button>
          <div>
            <Checkbox
              v-model:checked="skuDimensions.confirmed"
              :disabled="saving || !skuDimensions.rows.length"
            >
              已核对规格维度
            </Checkbox>
          </div>
          <Alert
            v-if="skuDimensions.dirty && !skuDimensions.rows.length"
            class="mt-3"
            type="warning"
            show-icon
            message="保存后将清空该 SKU 的全部规格维度；自由规格保留。"
          />
          <Alert
            v-if="
              changedSkuSpec &&
              !skuDimensions.dirty &&
              !skuDimensions.confirmed &&
              currentSku?.specifications.length
            "
            class="mt-3"
            type="warning"
            show-icon
            message="仅修改自由规格会保留原维度并标记待复核；请重新核对维度，或保留待复核状态保存。"
          />
          <p v-if="skuDimensionError" class="mt-3" role="alert">
            {{ skuDimensionError }}
          </p>
        </template>
      </section>
      <div class="form-grid">
        <Form.Item
          label="SKU零售价"
          name="price"
          :rules="[...required, ...money]"
        >
          <Input v-model:value="sku.price" />
        </Form.Item>
        <Form.Item label="SKU合作价" name="partnerPrice" :rules="money">
          <Input
            :value="sku.partnerPrice ?? ''"
            @update:value="(value) => (sku.partnerPrice = String(value))"
          />
        </Form.Item>
        <Form.Item label="SKU批发价" name="wholesalePrice" :rules="money">
          <Input
            :value="sku.wholesalePrice ?? ''"
            @update:value="(value) => (sku.wholesalePrice = String(value))"
          />
        </Form.Item>
        <Form.Item label="SKU成本价" name="costPrice" :rules="money">
          <Input
            :value="sku.costPrice ?? ''"
            @update:value="(value) => (sku.costPrice = String(value))"
          />
        </Form.Item>
      </div>
      <Form.Item
        :label="currentSku ? '库存（请通过库存调整修改）' : '初始库存'"
        name="stock"
        :rules="[
          {
            required: true,
            pattern: /^\d+(\.\d{1,4})?$/,
            message: '请输入非负库存，最多四位小数',
          },
        ]"
      >
        <Input v-model:value="sku.stock" :disabled="!!currentSku" />
      </Form.Item>
      <Form.Item label="SKU启用状态">
        <Switch v-model:checked="sku.enabled" />
      </Form.Item>
    </Form>
    <Space>
      <Button type="primary" :loading="saving" @click="saveSku">
        保存 SKU
</Button><Button @click="skuOpen = false">取消</Button>
    </Space>
  </Modal>
  <Modal
    :open="decisionOpen"
    :title="
      decision === 'PUBLISH'
        ? `发布${noun}`
        : decision === 'REJECT'
          ? `驳回${noun}`
          : `下架${noun}`
    "
    :footer="null"
    @cancel="decisionOpen = false"
  >
    <p class="mb-4">
      处理对象：{{ actionItem?.name }}（{{ actionItem?.code }}）
    </p>
    <Form layout="vertical">
      <Form.Item
        :label="
          decision === 'PUBLISH' ? '处理说明（选填）' : '处理原因（必填）'
        "
      >
        <Input.TextArea
          v-model:value="decisionReason"
          :rows="3"
          aria-label="平台处理原因"
        />
      </Form.Item>
    </Form>
    <Space>
      <Button
        type="primary"
        :danger="decision !== 'PUBLISH'"
        :loading="saving"
        @click="applyDecision"
      >
        确认{{
          decision === 'PUBLISH'
            ? '发布'
            : decision === 'REJECT'
              ? '驳回'
              : '下架'
        }}
</Button><Button @click="decisionOpen = false">取消</Button>
    </Space>
  </Modal>
  <ApiErrorDialog
    :open="!!errorMessage"
    :message="errorMessage"
    @close="errorMessage = ''"
  />
</template>
<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.parameter-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 80px auto;
  gap: 12px;
  align-items: center;
}

.sku-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 24px 0 12px;
  font-weight: 600;
}

.sku-dimension-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

@media (max-width: 900px) {
  .form-grid,
  .parameter-row {
    grid-template-columns: 1fr;
  }
}
</style>
