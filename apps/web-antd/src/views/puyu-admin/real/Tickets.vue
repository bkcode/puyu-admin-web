<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';

import type {
  ModelRules,
  Ticket,
  TicketAction,
  TicketEvent,
  TicketInput,
  TicketPriority,
} from '#/data/operationsApi';
import type { Catalog, Merchant, Sku } from '#/data/realAdminApi';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Descriptions,
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
  canTransitionTicket,
  createOperationRequest,
  OperationsService,
} from '#/application/operationsService';
import { RealAdminService } from '#/application/realAdminService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import BusinessFiles from './BusinessFiles.vue';
import { displayTime, labels, options } from './operationsUi';
const props = defineProps<{ pageId: string }>();
const route = useRoute();
const router = useRouter();
const platform = computed(() => props.pageId.startsWith('platform-'));
const fullForm = computed(() => props.pageId.endsWith('-form'));
const fullDetail = computed(() => props.pageId.endsWith('-detail'));
const rows = ref<Ticket[]>([]);
const currentTicket = ref<Ticket>();
const events = ref<TicketEvent[]>([]);
const handlers = ref<{ accountId: string; name: string }[]>([]);
const merchants = ref<Merchant[]>([]);
const products = ref<Catalog[]>([]);
const skus = ref<Sku[]>([]);
const rules = ref<ModelRules>();
const current = ref(1);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const uploadBusy = ref(false);
const error = ref('');
const formRef = ref<FormInstance>();
const query = reactive({
  keyword: '',
  status: undefined as string | undefined,
  type: undefined as string | undefined,
  priority: undefined as string | undefined,
  operatorId: undefined as string | undefined,
  merchantId: undefined as string | undefined,
});
const form = reactive<TicketInput>({
  type: 'PRODUCT_ASSISTANCE',
  description: '',
  contact: '',
  phone: '',
  productId: null,
  skuId: null,
  attachmentIds: [],
});
const balance = ref<string>();
const action = ref<TicketAction>();
const commandForm = reactive({
  reason: '',
  handlerId: undefined as string | undefined,
  priority: 'NORMAL' as TicketPriority,
  deliveryFileIds: [] as string[],
});
const required = [{ required: true, message: '请填写此项' }];
let createRequest = createOperationRequest();
let transitionRequest = createOperationRequest();
let revision = 0;
let productRevision = 0;
const columns = computed(() => [
  { title: '工单编号', dataIndex: 'code' },
  { title: '类型', key: 'type' },
  ...(platform.value ? [{ title: '商户', key: 'merchant' }] : []),
  { title: '状态', key: 'status' },
  { title: '优先级', key: 'priority' },
  { title: '处理人', key: 'handler' },
  { title: '更新时间', key: 'updatedAt' },
  { title: '操作', key: 'action' },
]);
const eventColumns = [
  { title: '操作', key: 'action' },
  { title: '处理人ID', dataIndex: 'operatorId' },
  { title: '说明', dataIndex: 'reason' },
  { title: '时间', key: 'createdAt' },
];
const platformActions: TicketAction[] = [
  'ACCEPT',
  'ASSIGN',
  'SET_PRIORITY',
  'DELIVER',
  'REJECT',
];
const merchantActions: TicketAction[] = ['CONFIRM', 'CANCEL'];
function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : '请求失败';
}
function go(kind: 'detail' | 'form' | 'list', id?: string) {
  return router.push({
    name: `PuyuAdmin_${platform.value ? 'platform-ticket' : 'merchant-workorder'}-${kind}`,
    query: id ? { id } : {},
  });
}
async function load(page = current.value) {
  const request = ++revision;
  loading.value = true;
  current.value = page;
  try {
    if (fullDetail.value) {
      currentTicket.value = undefined;
      events.value = [];
      if (typeof route.query.id !== 'string') return;
      const [ticket, history] = await Promise.all([
        OperationsService.ticket(route.query.id),
        OperationsService.ticketHistory(route.query.id),
      ]);
      if (request === revision) {
        currentTicket.value = ticket;
        events.value = history;
      }
    } else if (!fullForm.value) {
      const data = await OperationsService.tickets({ ...query }, page);
      if (request === revision) {
        rows.value = data.items;
        total.value = Number(data.total);
      }
    }
  } catch (error) {
    if (request === revision) fail(error);
  } finally {
    if (request === revision) loading.value = false;
  }
}
async function searchProducts(keyword = '') {
  const token = ++productRevision;
  try {
    const result = await RealAdminService.catalog(
      'PRODUCT',
      { keyword },
      1,
      50,
    );
    if (token === productRevision) products.value = result.items;
  } catch (error) {
    fail(error);
  }
}
watch(
  () => form.productId,
  async (id) => {
    form.skuId = null;
    skus.value = [];
    if (id) {
      try {
        const result = await RealAdminService.skus(id);
        if (form.productId === id) skus.value = result;
      } catch (error) {
        fail(error);
      }
    }
  },
);
async function create() {
  if (saving.value || uploadBusy.value) return;
  try {
    await formRef.value?.validate();
  } catch {
    error.value = '请完善必填信息';
    return;
  }
  saving.value = true;
  try {
    const result = await OperationsService.createTicket(
      createRequest({ ...form, attachmentIds: [...form.attachmentIds] }),
    );
    message.success('工单已提交');
    await go('detail', result.id);
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
function choose(next: TicketAction) {
  if (!currentTicket.value) return;
  action.value = next;
  Object.assign(commandForm, {
    reason: '',
    handlerId: currentTicket.value.handlerId ?? undefined,
    priority: currentTicket.value.priority,
    deliveryFileIds: [],
  });
  transitionRequest = createOperationRequest();
}
async function transition() {
  const ticket = currentTicket.value;
  const next = action.value;
  if (!ticket || !next || saving.value || uploadBusy.value) return;
  if (!canTransitionTicket(platform.value, ticket.status, next)) {
    error.value = '当前状态不可执行此操作，请刷新';
    return;
  }
  if (
    next === 'DELIVER' &&
    ticket.type === 'MODEL_CREATION' &&
    commandForm.deliveryFileIds.length === 0
  ) {
    error.value = '模型工单必须上传模型文件';
    return;
  }
  saving.value = true;
  try {
    await OperationsService.transitionTicket(
      ticket.id,
      transitionRequest({
        version: ticket.version,
        action: next,
        reason: commandForm.reason,
        ...(next === 'DELIVER'
          ? { deliveryFileIds: [...commandForm.deliveryFileIds] }
          : {}),
        ...(next === 'ASSIGN' ? { handlerId: commandForm.handlerId } : {}),
        ...(next === 'SET_PRIORITY' ? { priority: commandForm.priority } : {}),
      }),
    );
    action.value = undefined;
    message.success('工单状态已更新');
    await load();
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
onMounted(async () => {
  await load(1);
  try {
    if (platform.value) {
      [handlers.value, merchants.value] = await Promise.all([
        OperationsService.handlers(),
        RealAdminService.merchants('', 1, 200).then((r) => r.items),
      ]);
    }
    if (fullForm.value) {
      await searchProducts();
      const dashboard = await RealAdminService.dashboard();
      balance.value = dashboard.creditBalance;
    }
    rules.value = await OperationsService.modelRules();
  } catch (error) {
    fail(error);
  }
});
</script>
<template>
  <Alert
    v-if="rules"
    class="mb-4"
    type="info"
    :message="`工单提交不扣额度。模型确认完成后免费期${rules.freeMonths}个月、免费${rules.freeDownloads}次；超过后每次${rules.creditsPerDownload ?? '未配置'}额度。来源：${rules.source}（只读）`"
  />
  <Card v-if="!fullForm && !fullDetail">
    <Space wrap class="mb-4">
      <Input
        v-model:value="query.keyword"
        aria-label="工单搜索"
        placeholder="工单编号 / 需求"
        @press-enter="load(1)"
      />
      <Select
        v-model:value="query.status"
        aria-label="工单状态"
        placeholder="全部状态"
        :options="
          options([
            'SUBMITTED',
            'PROCESSING',
            'READY_CONFIRM',
            'COMPLETED',
            'REJECTED',
            'CANCELLED',
          ])
        "
        allow-clear
        style="width: 160px"
      />
      <Select
        v-model:value="query.type"
        aria-label="工单类型筛选"
        placeholder="全部类型"
        :options="
          options([
            'IMAGE_OPTIMIZATION',
            'PRODUCT_ASSISTANCE',
            'MODEL_CREATION',
          ])
        "
        allow-clear
        style="width: 150px"
      />
      <Select
        v-model:value="query.priority"
        aria-label="优先级筛选"
        placeholder="全部优先级"
        :options="options(['NORMAL', 'HIGH', 'URGENT'])"
        allow-clear
        style="width: 130px"
      />
      <Select
        v-if="platform"
        v-model:value="query.operatorId"
        aria-label="工单处理人筛选"
        placeholder="全部处理人"
        :options="handlers.map((h) => ({ value: h.accountId, label: h.name }))"
        allow-clear
        style="width: 160px"
      />
      <Select
        v-if="platform"
        v-model:value="query.merchantId"
        aria-label="工单商户筛选"
        placeholder="全部商户（前200条）"
        :options="
          merchants.map((m) => ({ value: m.id, label: m.content.name }))
        "
        allow-clear
        show-search
        option-filter-prop="label"
        style="width: 200px"
      />
      <Button :loading="loading" @click="load(1)">查询</Button><Button :loading="loading" @click="load()">刷新</Button><Button
        v-if="permission.canSubmitWorkorder()"
        type="primary"
        @click="go('form')"
      >
        新建工单
      </Button>
    </Space>
    <Table
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 1000 }"
      :pagination="{ current, total, pageSize: 20, showSizeChanger: false }"
      @change="(p) => load(p.current)"
    >
      <template #bodyCell="{ column, record }">
        <Tag v-if="['status', 'type', 'priority'].includes(String(column.key))">
          {{
            labels[record[String(column.key)]] ?? record[String(column.key)]
          }}
</Tag><template v-else-if="column.key === 'merchant'">
          {{
            merchants.find((m) => m.id === record.merchantId)?.content.name ??
            `商户 ${record.merchantId}`
          }}
</template><template v-else-if="column.key === 'handler'">
          {{
            handlers.find((h) => h.accountId === record.handlerId)?.name ??
            record.handlerId ??
            '未指派'
          }}
</template><template v-else-if="column.key === 'updatedAt'">
          {{ displayTime(record.updatedAt) }}
</template><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="go('detail', record.id)"
        >
          详情
        </Button>
      </template>
    </Table>
  </Card>
  <Card v-if="fullForm" title="提交工单">
    <p class="mb-4">
      当前服务额度余额：{{ balance ?? '尚未加载' }}；提交工单不扣减额度。
    </p>
    <Form ref="formRef" :model="form" layout="vertical" name="ticket">
      <Form.Item label="工单类型" name="type" :rules="required">
        <Select
          v-model:value="form.type"
          :options="
            options([
              'IMAGE_OPTIMIZATION',
              'PRODUCT_ASSISTANCE',
              'MODEL_CREATION',
            ])
          "
        />
      </Form.Item>
      <Form.Item
        label="关联商品"
        name="productId"
        :rules="form.type === 'MODEL_CREATION' ? required : []"
      >
        <Select
          :value="form.productId ?? undefined"
          @change="
            (value) =>
              (form.productId = typeof value === 'string' ? value : null)
          "
          show-search
          :filter-option="false"
          allow-clear
          placeholder="搜索商品名称或编码（每次最多50条）"
          :options="
            products.map((p) => ({
              value: p.id,
              label: `${p.name}（${p.code}）`,
            }))
          "
          @search="searchProducts"
        />
      </Form.Item>
      <Form.Item label="关联SKU" name="skuId">
        <Select
          :value="form.skuId ?? undefined"
          @change="
            (value) => (form.skuId = typeof value === 'string' ? value : null)
          "
          :disabled="!form.productId"
          allow-clear
          :options="
            skus.map((s) => ({ value: s.id, label: `${s.code} / ${s.spec}` }))
          "
        />
      </Form.Item>
      <Form.Item label="需求描述" name="description" :rules="required">
        <Input.TextArea
          v-model:value="form.description"
          :rows="5"
          :maxlength="5000"
        />
      </Form.Item>
      <Form.Item label="联系人" name="contact" :rules="required">
        <Input v-model:value="form.contact" :maxlength="160" />
      </Form.Item>
      <Form.Item
        label="手机号"
        name="phone"
        :rules="[
          {
            required: true,
            pattern: /^1[3-9]\d{9}$/,
            message: '请输入11位手机号',
          },
        ]"
      >
        <Input v-model:value="form.phone" :maxlength="11" />
      </Form.Item>
      <Form.Item label="需求附件">
        <BusinessFiles
          v-model="form.attachmentIds"
          editable
          :disabled="saving"
          @busy="uploadBusy = $event"
          @error="error = $event"
        />
      </Form.Item>
    </Form>
    <Space>
      <Button
        v-if="permission.canSubmitWorkorder()"
        type="primary"
        :loading="saving"
        :disabled="uploadBusy"
        @click="create"
      >
        提交工单
</Button><Button :disabled="saving || uploadBusy" @click="go('list')">
        返回列表
      </Button>
    </Space>
  </Card>
  <Card v-if="fullDetail" :loading="loading" title="工单详情">
    <template v-if="currentTicket">
      <Descriptions bordered :column="2">
        <Descriptions.Item label="工单编号">
          {{ currentTicket.code }}
</Descriptions.Item><Descriptions.Item label="状态">
          {{ labels[currentTicket.status] }}
        </Descriptions.Item>
        <Descriptions.Item label="类型">
          {{ labels[currentTicket.type] }}
</Descriptions.Item><Descriptions.Item label="优先级">
          {{ labels[currentTicket.priority] }}
        </Descriptions.Item>
        <Descriptions.Item label="商户">
          {{
            merchants.find((m) => m.id === currentTicket?.merchantId)?.content
              .name ?? currentTicket.merchantId
          }}
</Descriptions.Item><Descriptions.Item label="平台处理人">
          {{
            handlers.find((h) => h.accountId === currentTicket?.handlerId)
              ?.name ??
            currentTicket.handlerId ??
            '未指派'
          }}
        </Descriptions.Item>
        <Descriptions.Item label="发起人ID">
          {{ currentTicket.submitterId ?? '—' }}
</Descriptions.Item><Descriptions.Item label="指派人ID">
          {{ currentTicket.assignedBy ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="关联商品ID">
          {{ currentTicket.productId ?? '—' }}
</Descriptions.Item><Descriptions.Item label="关联SKU ID">
          {{ currentTicket.skuId ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="联系人">
          {{ currentTicket.contact }}
</Descriptions.Item><Descriptions.Item label="手机号">
          {{ currentTicket.phone }}
        </Descriptions.Item>
        <Descriptions.Item label="需求描述" :span="2">
          {{ currentTicket.description }}
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">
          {{ displayTime(currentTicket.createdAt) }}
</Descriptions.Item><Descriptions.Item label="确认完成时间">
          {{ displayTime(currentTicket.confirmedAt) }}
        </Descriptions.Item>
      </Descriptions>
      <h3 class="my-4">需求附件</h3>
      <BusinessFiles
        :model-value="currentTicket.attachmentIds"
        @error="error = $event"
      />
      <h3 class="my-4">交付结果</h3>
      <BusinessFiles
        :model-value="currentTicket.deliveryFileIds"
        @error="error = $event"
      />
      <h3 class="my-4">处理记录</h3>
      <Table
        row-key="id"
        :columns="eventColumns"
        :data-source="events"
        :scroll="{ x: 650 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            {{ labels[record.action] ?? record.action }}
</template><template v-else-if="column.key === 'createdAt'">
            {{ displayTime(record.createdAt) }}
          </template>
        </template>
      </Table>
      <Space wrap class="mt-4">
        <template
          v-if="
            platform
              ? permission.canProcessWorkorder()
              : permission.canSubmitWorkorder()
          "
        >
          <Button
            v-for="next in platform ? platformActions : merchantActions"
            v-show="canTransitionTicket(platform, currentTicket.status, next)"
            :key="next"
            :danger="['REJECT', 'CANCEL'].includes(next)"
            @click="choose(next)"
          >
            {{ labels[next] }}
          </Button>
        </template>
        <Button @click="load()">刷新详情</Button><Button @click="go('list')">返回列表</Button>
      </Space>
    </template>
    <Alert
      v-else-if="!loading"
      type="info"
      message="请从工单列表进入有效的工单详情。"
    >
      <template #action>
        <Button @click="go('list')">返回列表</Button>
      </template>
    </Alert>
  </Card>
  <Modal
    :open="!!action"
    :title="action ? labels[action] : ''"
    :footer="null"
    :mask-closable="false"
    :closable="!saving && !uploadBusy"
    @cancel="action = undefined"
  >
    <p class="mb-4">工单：{{ currentTicket?.code }}</p>
    <Form layout="vertical">
      <Form.Item v-if="action === 'ASSIGN'" label="平台处理人" required>
        <Select
          v-model:value="commandForm.handlerId"
          aria-label="指派处理人"
          :options="
            handlers.map((h) => ({ value: h.accountId, label: h.name }))
          "
        />
      </Form.Item>
      <Form.Item v-if="action === 'SET_PRIORITY'" label="优先级" required>
        <Select
          v-model:value="commandForm.priority"
          aria-label="工单优先级"
          :options="options(['NORMAL', 'HIGH', 'URGENT'])"
        />
      </Form.Item>
      <Form.Item
        label="处理原因 / 交付说明"
        :required="!['ACCEPT', 'CONFIRM'].includes(action ?? '')"
      >
        <Input.TextArea
          v-model:value="commandForm.reason"
          aria-label="工单处理说明"
          :maxlength="900"
        />
      </Form.Item>
      <Form.Item
        v-if="action === 'DELIVER'"
        label="交付文件"
        :required="currentTicket?.type === 'MODEL_CREATION'"
      >
        <BusinessFiles
          v-model="commandForm.deliveryFileIds"
          editable
          :purpose="
            currentTicket?.type === 'MODEL_CREATION' ? 'MODEL' : 'ATTACHMENT'
          "
          :merchant-id="currentTicket?.merchantId"
          :disabled="saving"
          @busy="uploadBusy = $event"
          @error="error = $event"
        />
      </Form.Item>
    </Form>
    <Space>
      <Button
        type="primary"
        :loading="saving"
        :disabled="uploadBusy"
        @click="transition"
      >
        确认操作
</Button><Button :disabled="saving || uploadBusy" @click="action = undefined">
        返回
      </Button>
    </Space>
  </Modal>
  <ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
