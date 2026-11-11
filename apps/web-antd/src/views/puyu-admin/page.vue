<script setup lang="ts">
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Button,
  Card,
  Descriptions,
  Input,
  message,
  Modal,
  Space,
  Statistic,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import { AdminPageService } from '#/application/adminPageService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';
import { PuyuAdminPageDefinitions } from '#/ui/pc-web-a/routes/pageDefinitions';

const route = useRoute();
const router = useRouter();
const page = computed(() => route.meta.page as any);
const state = ref<any>();
const loading = ref(true);
const errorOpen = ref(false);
const errorMessage = ref('');
const reason = ref('');
const skuOpen = ref(false);
const skuCode = ref('');
const skuSpec = ref('');
const skuPrice = ref('');
const keyword = ref('');
const detailEditing = ref(false);
const uploadFiles = ref<Record<string, UploadFile[]>>({});
type ProductParameter = {
  key: string;
  name: string;
  unit: string;
  value: string;
  visible: boolean;
};

const productParameters = ref<ProductParameter[]>([
  { key: 'material', name: '材质', value: '通体岩板', unit: '', visible: true },
  {
    key: 'waterAbsorption',
    name: '吸水率',
    value: '≤0.5%',
    unit: '',
    visible: true,
  },
  {
    key: 'size',
    name: '规格尺寸',
    value: '800×800mm',
    unit: '',
    visible: true,
  },
]);

const merchantFieldLabels = [
  '商户名称',
  '商户类型',
  '登录账号-手机号',
  '初始密码策略',
  'Logo 上传',
  '门店名称',
  '门店地址',
  '联系人',
  '联系电话',
  '联系人微信二维码',
  '门店介绍',
];
const designerFieldLabels = [
  '设计师姓名',
  '设计师等级',
  '登录账号-手机号',
  '初始密码策略',
  '头像上传',
  '服务城市',
  '擅长风格',
  '合作商户',
  '联系电话',
  '个人微信二维码',
  '设计师介绍',
  '认证资料',
];

async function loadPage() {
  loading.value = true;
  const value = await AdminPageService.getPage(page.value);
  state.value = value;
  loading.value = false;
}

void loadPage();
watch(page, () => {
  keyword.value = '';
  detailEditing.value = false;
  void loadPage();
});

const columns = computed(() => {
  const first = page.value?.id ?? '';
  const actionColumn = { title: '操作', dataIndex: 'actions', key: 'actions' };
  if (first.includes('merchant-list'))
    return [
      { title: '商户名称', dataIndex: 'c0' },
      { title: '商户编号', dataIndex: 'c1' },
      { title: '类型', dataIndex: 'c2' },
      { title: '联系人', dataIndex: 'c3' },
      { title: '地区', dataIndex: 'c4' },
      { title: '服务期限', dataIndex: 'c5' },
      { title: '状态', dataIndex: 'c6' },
      actionColumn,
    ];
  if (first.includes('designer-list'))
    return [
      { title: '设计师姓名', dataIndex: 'c0' },
      { title: '设计师等级', dataIndex: 'c1' },
      { title: '手机号', dataIndex: 'c2' },
      { title: '服务城市', dataIndex: 'c3' },
      { title: '擅长风格', dataIndex: 'c4' },
      { title: '合作商户', dataIndex: 'c5' },
      { title: '入驻状态', dataIndex: 'c6' },
      actionColumn,
    ];
  if (first.includes('product'))
    return [
      { title: '商品', dataIndex: 'c0' },
      { title: '所属商户/分类', dataIndex: 'c1' },
      { title: '审核状态', dataIndex: 'c2' },
      { title: '展示状态', dataIndex: 'c3' },
      actionColumn,
    ];
  if (first.includes('brand'))
    return [
      { title: '品牌', dataIndex: 'c0' },
      { title: '所属商户/编码', dataIndex: 'c1' },
      { title: '来源', dataIndex: 'c2' },
      { title: '状态', dataIndex: 'c4' },
      actionColumn,
    ];
  return [
    { title: '名称', dataIndex: 'c0' },
    { title: '关联对象', dataIndex: 'c1' },
    { title: '状态', dataIndex: 'c2' },
    { title: '更新时间', dataIndex: 'c3' },
    actionColumn,
  ];
});

const dataSource = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return (state.value?.rows ?? [])
    .filter(
      (row: string[]) => !query || row.join(' ').toLowerCase().includes(query),
    )
    .map((row: string[], index: number) => ({
      key: index,
      ...Object.fromEntries(row.map((value, i) => [`c${i}`, value])),
    }));
});

async function refreshList() {
  await loadPage();
  message.success('列表已刷新（当前为 local mock）');
}

async function saveDetail() {
  await AdminPageService.execute(page.value.id, 'detail-save');
  detailEditing.value = false;
  message.success('详情已保存（当前为 local mock）');
}
const showProductActions = computed(
  () =>
    page.value?.id === 'product-list' ||
    page.value?.id === 'platform-product-management',
);

const fieldLabels = computed(() => {
  const id = page.value?.id ?? '';
  if (id === 'platform-merchant-form' || id === 'platform-merchant-detail')
    return merchantFieldLabels;
  if (
    id === 'platform-designer-onboarding' ||
    id === 'platform-designer-detail'
  )
    return designerFieldLabels;
  if (id.includes('merchant'))
    return ['商户名称', '商户编号', '联系人', '状态'];
  if (id.includes('designer'))
    return ['设计师名称', '联系方式', '授权状态', '备注'];
  if (id.includes('category'))
    return ['分类名称', '上级分类', '排序', '审核状态'];
  if (id.includes('brand'))
    return ['品牌名称', '品牌编码', '品牌 Logo', '状态'];
  if (id.includes('workorder') || id.includes('ticket'))
    return ['需求类型', '关联商品', '模型文件', '处理说明'];
  if (id.includes('credit')) return ['商户', '充值额度', '用途说明', '备注'];
  if (id.includes('product'))
    return ['商品名称', '商品分类', '品牌', '零售价 / 合作价'];
  if (id.includes('order')) return ['订单编号', '客户', '核销状态', '备注'];
  return ['名称', '编码', '状态', '备注'];
});

function isUploadField(label: string) {
  return /上传|二维码|认证资料/.test(label);
}

function detailFieldValue(label: string) {
  const values: Record<string, string> = {
    'Logo 上传': '已上传：puyu-logo.png',
    商户名称: '锦程建材',
    商户类型: '经销商',
    '登录账号-手机号': '138****8821',
    初始密码策略: '系统生成',
    门店名称: '锦程建材杭州旗舰店',
    门店地址: '浙江省杭州市西湖区',
    联系人: '陈经理',
    联系电话: '138****8821',
    联系人微信二维码: '已上传',
    门店介绍: '主营瓷砖、卫浴和装修辅材。',
    设计师姓名: '林予安',
    设计师等级: '主案',
    头像上传: '已上传',
    服务城市: '杭州',
    擅长风格: '现代简约 / 奶油风',
    合作商户: '锦程建材',
    个人微信二维码: '已上传',
    设计师介绍: '住宅与商业空间设计服务。',
    认证资料: '身份证明、合作协议已归档',
  };
  return values[label] ?? '待补充';
}

function beforeMockUpload() {
  return false;
}

function handleUploadChange(label: string, info: UploadChangeParam) {
  uploadFiles.value[label] = info.fileList.slice(-1);
  if (info.file.status !== 'removed') {
    message.success(`${label}已选择（当前为 local mock）`);
  }
}

function addProductParameter() {
  productParameters.value.push({
    key: `parameter-${productParameters.value.length + 1}`,
    name: '新参数',
    value: '',
    unit: '',
    visible: true,
  });
}

function parameterCellValue(
  record: ProductParameter | Record<string, any>,
  dataIndex: unknown,
): string {
  const key = String(dataIndex ?? '');
  if (key === 'visible') return record.visible ? '展示' : '隐藏';
  if (key === 'name') return String(record.name ?? '');
  if (key === 'unit') return String(record.unit ?? '');
  if (key === 'value') return String(record.value ?? '');
  return '';
}

function setParameterValue(
  record: ProductParameter | Record<string, any>,
  dataIndex: unknown,
  value: string,
) {
  const key = String(dataIndex ?? '');
  if (key === 'name') record.name = value;
  if (key === 'unit') record.unit = value;
  if (key === 'value') record.value = value;
}

function cellValue(record: Record<string, string>, dataIndex?: unknown) {
  return dataIndex === undefined ? '-' : record[String(dataIndex)] || '-';
}

async function handleAction(action: string) {
  if (action === 'error') {
    errorMessage.value = '当前为本地 Mock，真实 Admin BFF 尚未接入。';
    errorOpen.value = true;
    return;
  }
  if (action === 'offline') {
    if (!reason.value.trim()) {
      errorMessage.value = '驳回或下架必须填写处理原因。';
      errorOpen.value = true;
      return;
    }
    Modal.confirm({
      title: '下架商品',
      content: `处理原因：${reason.value}`,
      onOk: async () => {
        await AdminPageService.execute(
          page.value.id,
          `${action}:${reason.value}`,
        );
        await loadPage();
        message.success('已下架，处理原因已同步到商户侧 Mock 数据');
      },
    });
    return;
  }
  await AdminPageService.execute(page.value.id, action);
  await loadPage();
  message.success('操作已记录（当前为 local mock）');
}

function openSkuEditor() {
  skuCode.value = '';
  skuSpec.value = '';
  skuPrice.value = '';
  skuOpen.value = true;
}

async function saveSku() {
  if (
    !skuCode.value.trim() ||
    !skuSpec.value.trim() ||
    !skuPrice.value.trim()
  ) {
    errorMessage.value = 'SKU 编码、规格组合和零售价均为必填项。';
    errorOpen.value = true;
    return;
  }
  await AdminPageService.execute(page.value.id, `sku-create:${skuCode.value}`);
  skuOpen.value = false;
  message.success('SKU 已保存（当前为 local mock）');
}

function pageSubgroup(id: string) {
  if (id === 'platform-dashboard') return 'overview';
  if (id.startsWith('platform-merchant')) return 'merchants';
  if (id.startsWith('platform-designer')) return 'designers';
  if (id.startsWith('platform-category')) return 'categories';
  if (id === 'platform-product-management') return 'products';
  if (id === 'platform-brand-management') return 'brands';
  if (id.startsWith('platform-ticket')) return 'workorders';
  if (id.startsWith('platform-credit') || id === 'platform-billing-management')
    return 'credits';
  if (id === 'platform-system-settings') return 'settings';
  if (id.startsWith('cooperation')) return 'cooperation';
  if (id === 'inventory-list') return 'inventory';
  if (id === 'order-management') return 'orders';
  if (id.startsWith('merchant-workorder')) return 'workorders';
  return 'catalog';
}

function openPage(id: string) {
  const definition = PuyuAdminPageDefinitions.find((item) => item.id === id);
  const section = definition?.group === '平台后台' ? 'platform' : 'merchant';
  const subgroup = pageSubgroup(id);
  void router.push(
    definition
      ? `/admin/${section}/${subgroup}/${definition.path}`
      : '/admin/platform/overview/platform-dashboard',
  );
}

function rowPageTarget(id: string) {
  if (id === 'platform-merchant-list') return 'platform-merchant-detail';
  if (id === 'platform-designer-list') return 'platform-designer-detail';
  if (id === 'platform-category-review') return 'platform-category-form';
  if (id === 'platform-ticket-list') return 'platform-ticket-detail';
  if (id === 'merchant-workorder-list') return 'merchant-workorder-detail';
  if (id === 'brand-list') return 'brand-form';
  return 'product-detail';
}

function openRowPage() {
  const id = page.value?.id ?? '';
  const target = rowPageTarget(id);
  openPage(target);
}
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline -->
  <div class="puyu-page">
    <div class="page-heading">
      <div>
        <h1>{{ page?.title }}</h1>
      </div>
      <Space>
        <Button
          v-if="page?.id === 'product-list'"
          type="primary"
          @click="openPage('product-form')"
        >
          新建商品
        </Button>
      </Space>
    </div>

    <div v-if="loading" class="state-card">加载中…</div>
    <template v-else>
      <div v-if="state.metrics.length" class="metric-grid">
        <Card v-for="metric in state.metrics" :key="metric[0]">
          <Statistic :title="metric[0]" :value="metric[1]" />
        </Card>
      </div>
      <Card v-if="page?.id === 'platform-dashboard'" class="quick-entry-card">
        <div class="quick-entry-heading">
          <div>
            <h3>运营快捷入口</h3>
            <p>模型文件使用统计为额度消耗数据，不涉及在线支付。</p>
          </div>
          <Space>
            <Button @click="openPage('platform-credit-management')">
              模型文件使用统计
            </Button>
            <Button type="primary" @click="openPage('platform-merchant-form')">
              商户入驻
            </Button>
          </Space>
        </div>
      </Card>

      <Card
        v-if="page?.kind === 'form' || page?.kind === 'detail'"
        title="基础信息"
        class="section-card"
      >
        <div v-if="page?.kind === 'form' || detailEditing" class="form-grid">
          <label v-for="label in fieldLabels" :key="label">
            <span>{{ label }}</span>
            <Upload
              v-if="isUploadField(label)"
              :before-upload="beforeMockUpload"
              :file-list="uploadFiles[label] ?? []"
              :max-count="1"
              @change="(info) => handleUploadChange(label, info)"
            >
              <Button>选择文件</Button>
            </Upload>
            <small v-if="isUploadField(label)" class="field-help">
              仅选择文件，不会发起真实上传
            </small>
            <Input v-else :placeholder="`请输入${label}`" />
          </label>
        </div>
        <div
          v-if="page?.kind === 'detail' && !detailEditing"
          class="detail-grid"
        >
          <div v-for="label in fieldLabels" :key="label" class="detail-field">
            <span>{{ label }}</span>
            <strong>{{ detailFieldValue(label) }}</strong>
          </div>
        </div>
        <div
          v-if="page?.id === 'product-detail' || page?.id === 'product-form'"
          class="parameter-panel"
        >
          <div class="sku-heading">
            <div>
              <h3>商品参数</h3>
              <p>商品参数属于 SPU，与 SKU 可售规格分开维护。</p>
            </div>
            <Button
              v-if="page?.kind === 'form' || detailEditing"
              size="small"
              @click="addProductParameter"
            >
              新增参数
            </Button>
          </div>
          <Table
            :data-source="productParameters"
            :pagination="false"
            :columns="[
              { title: '参数名称', dataIndex: 'name' },
              { title: '参数值', dataIndex: 'value' },
              { title: '单位', dataIndex: 'unit' },
              { title: '商城展示', dataIndex: 'visible' },
            ]"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <Input
                v-if="
                  (page?.kind === 'form' || detailEditing) &&
                  column.dataIndex !== 'visible'
                "
                :value="parameterCellValue(record, column.dataIndex)"
                size="small"
                @update:value="
                  setParameterValue(record, column.dataIndex, $event)
                "
              />
              <Tag v-else-if="column.dataIndex === 'visible'" color="green">
                {{ parameterCellValue(record, column.dataIndex) }}
              </Tag>
              <span v-else>{{
                parameterCellValue(record, column.dataIndex) || '—'
              }}</span>
            </template>
          </Table>
        </div>
        <div v-if="page?.id === 'product-detail'" class="sku-panel">
          <div class="sku-heading">
            <h3>SKU 明细</h3>
            <Button
              v-if="permission.canEditProduct()"
              size="small"
              type="primary"
              @click="openSkuEditor"
            >
              新增 SKU
            </Button>
          </div>
          <p>
            SKU 只能在商品详情内维护，使用详情内抽屉/弹窗，不建立独立 SKU 路由。
          </p>
          <Table
            :data-source="[
              {
                key: 'sku-1',
                code: 'SKU-800-W',
                spec: '800×800 / 柔光',
                price: '¥268',
                stock: 420,
              },
              {
                key: 'sku-2',
                code: 'SKU-800-G',
                spec: '800×800 / 灰色',
                price: '¥288',
                stock: 86,
              },
            ]"
            :columns="[
              { title: 'SKU 编码', dataIndex: 'code' },
              { title: '规格组合', dataIndex: 'spec' },
              { title: '零售价', dataIndex: 'price' },
              { title: '库存', dataIndex: 'stock' },
            ]"
            :pagination="false"
            size="small"
          />
        </div>
      </Card>
      <div
        v-if="page?.kind === 'form' || page?.kind === 'detail'"
        class="page-footer-actions"
      >
        <Button @click="handleAction('error')">模拟 API 错误</Button>
        <Button
          v-if="page?.kind === 'detail' && !detailEditing"
          @click="detailEditing = true"
        >
          编辑详情
        </Button>
        <Button
          v-if="page?.kind === 'form'"
          type="primary"
          @click="handleAction('save')"
        >
          保存
        </Button>
        <Button
          v-if="page?.kind === 'detail' && detailEditing"
          type="primary"
          @click="saveDetail"
        >
          保存详情
        </Button>
      </div>

      <Card
        v-if="page?.kind === 'list' || page?.kind === 'dashboard'"
        title="数据列表"
        class="section-card"
      >
        <div class="filter-row">
          <Input
            v-model:value="keyword"
            placeholder="搜索名称、编码或商户"
          /><Button type="primary" @click="refreshList"> 查询 </Button>
        </div>
        <Table
          :columns="columns"
          :data-source="dataSource"
          :pagination="{ pageSize: 10 }"
          bordered
        >
          <template #bodyCell="{ column, record }">
            <Space v-if="column.dataIndex === 'actions'">
              <Button size="small" @click="openRowPage">
                {{ page?.id?.includes('review') ? '处理' : '查看' }}
              </Button>
            </Space>
            <Tag
              v-else-if="
                column.dataIndex === 'c2' ||
                column.dataIndex === 'c3' ||
                column.dataIndex === 'c4' ||
                column.dataIndex === 'c6'
              "
              color="blue"
            >
              {{ cellValue(record, column.dataIndex) }}
            </Tag>
            <template v-else>
              {{ cellValue(record, column.dataIndex) }}
            </template>
          </template>
        </Table>
        <div v-if="showProductActions" class="action-row">
          <Button
            v-if="permission.canViewProductList()"
            @click="openPage('product-detail')"
          >
            查看商品详情
          </Button>
          <Button
            v-if="permission.canEditProduct()"
            @click="openPage('product-form')"
          >
            编辑商品
          </Button>
          <Button
            v-if="permission.canOfflineProduct()"
            danger
            @click="handleAction('offline')"
          >
            下架
          </Button>
        </div>
      </Card>
      <Card
        v-if="
          page?.id === 'order-management' ||
          page?.id === 'platform-ticket-detail' ||
          page?.id === 'merchant-workorder-detail'
        "
        title="状态操作"
        class="section-card"
      >
        <Descriptions :column="2" bordered>
          <Descriptions.Item label="当前状态">
            {{ state.rows?.[0]?.[2] ?? state.rows?.[0]?.[3] ?? '待处理' }}
          </Descriptions.Item>
          <Descriptions.Item label="Mock 数据范围">
            当前商户 / 当前工单
          </Descriptions.Item>
          <Descriptions.Item label="处理记录" :span="2">
            {{
              page?.id?.includes('workorder') || page?.id?.includes('ticket')
                ? '平台接单 → 处理中 → 待商户确认'
                : '待确认 → 已确认 → 已核销'
            }}
          </Descriptions.Item>
        </Descriptions>
        <Space class="action-row">
          <Button
            v-if="page?.id === 'order-management'"
            type="primary"
            @click="handleAction('status:已确认')"
          >
            确认订单
          </Button>
          <Button
            v-if="page?.id === 'order-management'"
            @click="handleAction('status:已核销')"
          >
            核销订单
          </Button>
          <Button
            v-if="page?.id === 'merchant-workorder-detail'"
            type="primary"
            @click="handleAction('status:已确认完成')"
          >
            确认工单完成
          </Button>
          <Button
            v-if="page?.id === 'platform-ticket-detail'"
            type="primary"
            @click="handleAction('status:处理中')"
          >
            接单并开始处理
          </Button>
          <Button
            v-if="page?.id === 'platform-ticket-detail'"
            @click="handleAction('model-upload')"
          >
            上传模型文件
          </Button>
          <Button
            v-if="page?.id === 'order-management'"
            @click="handleAction('print-order')"
          >
            打印订单
          </Button>
        </Space>
      </Card>

      <Card
        v-if="
          page?.id === 'platform-product-management' ||
          page?.id === 'platform-brand-management' ||
          page?.id === 'platform-category-review'
        "
        title="平台治理规则"
        class="governance-card"
      >
        <p>
          仅处理商家提交的数据。驳回或下架必须填写处理原因，处理状态和原因同步到商户后台。
        </p>
        <Input v-model:value="reason" placeholder="处理原因（驳回/下架必填）" />
        <Space class="governance-actions">
          <Button
            v-if="permission.canReviewCategory()"
            type="primary"
            @click="handleAction('publish')"
          >
            通过并发布
          </Button>
          <Button
            v-if="permission.canReviewCategory()"
            danger
            @click="handleAction('offline')"
          >
            驳回/下架
          </Button>
        </Space>
      </Card>
    </template>
    <ApiErrorDialog
      :open="errorOpen"
      :message="errorMessage"
      code="LOCAL_MOCK"
      @close="errorOpen = false"
    />
    <Modal
      v-model:open="skuOpen"
      title="新增 SKU"
      ok-text="保存 SKU"
      cancel-text="取消"
      @ok="saveSku"
    >
      <div class="sku-form">
        <label><span>SKU 编码</span><Input v-model:value="skuCode" /></label>
        <label><span>规格组合</span><Input v-model:value="skuSpec" /></label>
        <label><span>零售价</span><Input v-model:value="skuPrice" /></label>
      </div>
    </Modal>
    <!-- eslint-enable vue/multiline-html-element-content-newline -->
  </div>
</template>

<style scoped>
.puyu-page {
  padding: 24px;
}

.page-heading {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

h1 {
  margin: 0;
  font-size: 28px;
}

.page-heading p {
  margin: 8px 0 0;
  color: #64748b;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.section-card,
.governance-card {
  margin-bottom: 16px;
}

.quick-entry-card {
  margin-bottom: 16px;
}

.quick-entry-heading {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.quick-entry-heading h3 {
  margin: 0;
}

.quick-entry-heading p {
  margin: 6px 0 0;
  color: #64748b;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.form-grid label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  margin-top: 20px;
}

.detail-field {
  display: grid;
  gap: 6px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.detail-field span {
  font-size: 13px;
  color: #64748b;
}

.detail-field strong {
  font-weight: 500;
  color: #0f172a;
}

.filter-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-row .ant-input {
  max-width: 360px;
}

.action-row,
.governance-actions {
  margin-top: 16px;
}

.page-footer-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-start;
  padding: 16px 0 8px;
}

.sku-panel {
  padding-top: 16px;
  margin-top: 20px;
  border-top: 1px solid #e2e8f0;
}

.parameter-panel {
  padding-top: 16px;
  margin-top: 20px;
  border-top: 1px solid #e2e8f0;
}

.parameter-panel h3 {
  margin: 0;
}

.parameter-panel p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #64748b;
}

.sku-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sku-heading h3 {
  margin: 0;
}

.sku-panel p {
  color: #64748b;
}

.sku-form {
  display: grid;
  gap: 14px;
}

.sku-form label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.state-card {
  padding: 80px;
  text-align: center;
  background: #fff;
}

@media (max-width: 800px) {
  .page-heading {
    flex-direction: column;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
