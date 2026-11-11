<script setup lang="ts">
import type {
  CreditAccount,
  CreditDraft,
  CreditInput,
  CreditQuery,
  Ledger,
} from '#/data/adminBusinessApi';

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
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { AdminBusinessService as service } from '#/application/adminBusinessService';
import {
  createOperationRequest,
  OperationsService,
} from '#/application/operationsService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import BusinessFiles from './BusinessFiles.vue';
import BusinessPicker from './BusinessPicker.vue';
import {
  accountKinds,
  creditTypes,
  downloadExport,
  draftStatuses,
  labelOf,
  useBusinessUi,
} from './businessUi';
import { displayTime } from './operationsUi';
const props = defineProps<{ pageId: string }>();
const route = useRoute();
const router = useRouter();
const { error, busy, run } = useBusinessUi();
const uploadBusy = ref(false);
const formMode = computed(() => props.pageId === 'platform-credit-recharge');
const tab = ref('accounts');
const accounts = ref<CreditAccount[]>([]);
const ledgers = ref<Ledger[]>([]);
const drafts = ref<CreditDraft[]>([]);
const page = ref(1);
const total = ref(0);
const stat = ref<Awaited<ReturnType<typeof service.creditStatistics>>>();
const rules = ref<Awaited<ReturnType<typeof OperationsService.modelRules>>>();
const query = reactive({ keyword: '', type: undefined as string | undefined });
const ledgerQuery = reactive<CreditQuery>({});
const exportedLedger = ref<{
  name: string;
  query: CreditQuery;
  rowCount: number;
}>();
const exportFileName = (value: string) =>
  Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? Number.NaN;
    return character === '/' ||
      character === '\\' ||
      (codePoint >= 0 && codePoint <= 31)
      ? '_'
      : character;
  }).join('');
watch(
  [
    () => ledgerQuery.accountId,
    () => ledgerQuery.type,
    () => ledgerQuery.from,
    () => ledgerQuery.to,
  ],
  () => {
    exportedLedger.value = undefined;
  },
);
async function exportLedger() {
  if (busy.value || permission.canManageCredits() !== true) return;
  const scope = { ...ledgerQuery };
  exportedLedger.value = undefined;
  await run(async () => {
    const value = await service.exportLedger(scope);
    downloadExport(value);
    exportedLedger.value = {
      name: exportFileName(value.name),
      rowCount: value.rowCount,
      query: scope,
    };
  });
}
const exportedScope = computed(() => {
  const scope = exportedLedger.value?.query;
  return scope
    ? `本次请求条件：${scope.accountId ? `账户 ${scope.accountId}` : '全部账户'}；${scope.type ? labelOf(creditTypes, scope.type) : '全部流水类型'}；上海时间 ${scope.from?.replace('T', ' ') || '不限开始'} 至 ${scope.to?.replace('T', ' ') || '不限结束'}`
    : '';
});
const draftStatus = ref<string>();
const old = ref<CreditDraft>();
const form = reactive<CreditInput>({
  accountId: null,
  type: 'RECHARGE',
  amount: null,
  reason: '',
  voucherFileId: null,
  receivedAmount: null,
});
const editable = computed(() => !old.value || old.value.status === 'DRAFT');
const dirty = computed(
  () =>
    !old.value || JSON.stringify(form) !== JSON.stringify(old.value.content),
);
const confirmation = ref('');
let pending: (() => Promise<unknown>) | undefined;
const saveCommand = createOperationRequest();
let actionCommand = createOperationRequest();
const viewLedger = ref<Ledger>();
const accountCols = [
  { title: '账户ID', dataIndex: 'accountId' },
  { title: '名称', dataIndex: 'name' },
  { title: '账户类型', key: 'kind' },
  { title: '服务额度余额', dataIndex: 'balance' },
  { title: '操作', key: 'action' },
];
const ledgerCols = [
  { title: '流水ID', dataIndex: 'id' },
  { title: '账户ID', dataIndex: 'accountId' },
  { title: '类型', key: 'type' },
  { title: '变动额度', dataIndex: 'amount' },
  { title: '变更后余额', dataIndex: 'balance' },
  { title: '线下金额摘要', dataIndex: 'receivedAmount' },
  { title: '原因', dataIndex: 'reason' },
  { title: '时间', key: 'createdAt' },
  { title: '操作', key: 'action' },
];
function goDraft(id?: string) {
  return router.push({
    name: 'PuyuAdmin_platform-credit-recharge',
    query: id ? { id } : {},
  });
}
async function load() {
  if (formMode.value) {
    if (typeof route.query.id === 'string') {
      old.value = await service.draft(route.query.id);
      Object.assign(form, old.value.content);
    }
    return;
  }
  if (tab.value === 'accounts') {
    const r = await service.creditAccounts({ ...query }, page.value);
    accounts.value = r.items;
    total.value = Number(r.total);
  } else if (tab.value === 'ledger') {
    const r = await service.ledger({ ...ledgerQuery }, page.value);
    ledgers.value = r.items;
    total.value = Number(r.total);
  } else {
    const r = await service.drafts(
      { accountId: ledgerQuery.accountId, status: draftStatus.value },
      page.value,
    );
    drafts.value = r.items;
    total.value = Number(r.total);
  }
}
function confirm(text: string, action: () => Promise<unknown>) {
  confirmation.value = text;
  pending = action;
  actionCommand = createOperationRequest();
}
async function apply() {
  if (!pending || uploadBusy.value) return;
  await run(async () => {
    const action = pending;
    if (!action) throw new Error('操作未确认');
    await action();
    confirmation.value = '';
    pending = undefined;
    message.success('操作已完成');
  });
}
async function save() {
  await run(async () => {
    const content = { ...form };
    old.value = await service.saveDraft(
      saveCommand({ id: old.value?.id, version: old.value?.version, content })
        .requestId,
      content,
      old.value,
    );
    Object.assign(form, old.value.content);
    if (!route.query.id) await goDraft(old.value.id);
    message.success('草稿已保存，尚未变更余额');
  });
}
function submit(action: 'cancel' | 'submit') {
  const record = old.value;
  if (!record) return;
  confirm(
    action === 'submit'
      ? `确认将账户 ${record.content.accountId} 的 ${labelOf(creditTypes, record.content.type ?? '')} ${record.content.amount} 额度入账？这不是支付，会立即影响真实余额。`
      : '确认取消此草稿？取消不变更余额。',
    async () => {
      old.value = await service.draftAction(
        record,
        action,
        actionCommand({ id: record.id, version: record.version, action })
          .requestId,
      );
      Object.assign(form, old.value.content);
      stat.value = await service.creditStatistics();
    },
  );
}
onMounted(() =>
  run(async () => {
    await load();
    [stat.value, rules.value] = await Promise.all([
      service.creditStatistics(),
      OperationsService.modelRules(),
    ]);
  }),
);
</script>
<template>
  <Alert
    class="mb-4"
    type="info"
    message="服务额度用于模型下载等功能消耗，不是支付或钱包。工单提交不扣额度，规则由Nacos固定配置，本页只读。"
  />
  <Space v-if="stat" wrap class="mb-4">
    <Card>
      <Statistic title="平台账户额度总余额" :value="stat.totalBalance" />
</Card><Card>
      <Statistic
        title="今日充值额度"
        :value="stat.todayRechargedCredits"
      />
</Card><Card>
      <Statistic title="今日充值笔数" :value="stat.todayRechargeCount" />
    </Card>
  </Space>
  <Card
    v-if="formMode"
    :title="
      old
        ? `额度草稿 ${old.id} · ${labelOf(draftStatuses, old.status)}`
        : '新增额度草稿'
    "
  >
    <Form layout="vertical">
      <div class="business-grid">
        <Form.Item label="额度账户（商户/设计师）">
          <BusinessPicker
            v-model="form.accountId"
            kind="account"
            :disabled="!editable || busy || uploadBusy"
            @error="error = $event"
          />
</Form.Item><Form.Item label="操作类型">
          <Select
            :value="form.type ?? undefined"
            @change="(v) => (form.type = v as CreditInput['type'])"
            :options="creditTypes.filter((t) => t.value !== 'MODEL_DOWNLOAD')"
            :disabled="!editable || busy"
          />
</Form.Item><Form.Item label="额度整数（调整允许负数）">
          <Input
            :value="form.amount ?? ''"
            @update:value="(v) => (form.amount = String(v) || null)"
            :disabled="!editable || busy"
            aria-label="变动额度"
          />
</Form.Item><Form.Item label="线下金额摘要（可空，不发起支付）">
          <Input
            :value="form.receivedAmount ?? ''"
            @update:value="(v) => (form.receivedAmount = String(v) || null)"
            :disabled="!editable || busy"
          />
        </Form.Item>
      </div>
      <Form.Item label="原因（人工调整必填）">
        <Input.TextArea
          v-model:value="form.reason"
          :disabled="!editable || busy"
          :maxlength="1000"
        />
</Form.Item><Form.Item label="线下凭证（最多一个）">
        <BusinessFiles
          :model-value="form.voucherFileId ? [form.voucherFileId] : []"
          :editable="editable && !form.voucherFileId"
          purpose="VOUCHER"
          :disabled="busy"
          @update:model-value="(v) => (form.voucherFileId = v[0] ?? null)"
          @busy="uploadBusy = $event"
          @error="error = $event"
        /><Button
          v-if="editable && form.voucherFileId"
          :disabled="busy || uploadBusy"
          @click="form.voucherFileId = null"
        >
          解除凭证关联
        </Button>
      </Form.Item>
    </Form>
    <Alert
      v-if="old && dirty && editable"
      class="my-3"
      type="info"
      message="资料有改动，请先保存草稿再提交额度。"
    />
    <Space class="mt-4" wrap>
      <Button
        v-if="editable && permission.canManageCredits()"
        type="primary"
        :loading="busy"
        :disabled="uploadBusy"
        @click="save"
      >
        保存草稿
</Button><Button
        v-if="old && editable && permission.canManageCredits()"
        :disabled="busy || uploadBusy || dirty"
        @click="submit('submit')"
      >
        提交额度
</Button><Button
        v-if="old && editable && permission.canManageCredits()"
        danger
        :disabled="busy || uploadBusy"
        @click="submit('cancel')"
      >
        取消草稿
</Button><Button
        :disabled="busy || uploadBusy"
        @click="router.push({ name: 'PuyuAdmin_platform-credit-management' })"
      >
        返回额度管理
      </Button>
    </Space>
  </Card>
  <Card v-else>
    <Tabs
      v-model:active-key="tab"
      @change="
        page = 1;
        run(load);
      "
    >
      <Tabs.TabPane key="accounts" tab="额度账户" /><Tabs.TabPane
        key="ledger"
        tab="充值/消耗流水"
      /><Tabs.TabPane key="drafts" tab="额度草稿" />
    </Tabs>
    <Space class="mb-4" wrap>
      <template v-if="tab === 'accounts'">
        <Input
          v-model:value="query.keyword"
          aria-label="搜索额度账户"
          placeholder="账户名称"
        /><Select
          v-model:value="query.type"
          :options="accountKinds"
          allow-clear
          placeholder="全部账户类型"
          style="width: 150px"
        />
</template><template v-else>
        <BusinessPicker
          v-model="ledgerQuery.accountId"
          kind="account"
          :disabled="busy"
          style="width: 260px"
          @error="error = $event"
        /><Select
          v-if="tab === 'ledger'"
          v-model:value="ledgerQuery.type"
          :disabled="busy"
          :options="creditTypes"
          allow-clear
          placeholder="全部流水类型"
          style="width: 160px"
        /><Select
          v-else
          v-model:value="draftStatus"
          :options="draftStatuses"
          allow-clear
          placeholder="全部草稿状态"
          style="width: 150px"
        /><template v-if="tab === 'ledger'">
          <Input
            v-model:value="ledgerQuery.from"
            :disabled="busy"
            type="datetime-local"
            aria-label="流水开始时间"
          /><Input
            v-model:value="ledgerQuery.to"
            :disabled="busy"
            type="datetime-local"
            aria-label="流水结束时间"
          />
        </template>
</template><Button
        :loading="busy"
        @click="
          page = 1;
          run(load);
        "
      >
        查询
</Button><Button
        v-if="permission.canManageCredits()"
        type="primary"
        @click="goDraft()"
      >
        新增额度草稿
</Button><Button
        v-if="tab === 'ledger' && permission.canManageCredits()"
        :disabled="busy"
        :loading="busy"
        @click="exportLedger"
      >
        导出当前流水
      </Button>
    </Space>
    <Alert
      v-if="tab === 'ledger' && exportedLedger"
      class="mb-4"
      type="success"
      show-icon
      :message="`已生成 ${exportedLedger.name}（${exportedLedger.rowCount} 条流水）`"
      :description="`${exportedScope}。已发起浏览器下载，请在浏览器中确认保存结果；此提示不表示文件已保存到磁盘。`"
    />
    <Alert
      v-if="tab === 'ledger' && error"
      class="mb-4"
      type="error"
      show-icon
      message="导出或查询失败，筛选条件已保留"
      description="请核对账户和上海日期范围；超出10000条时缩小范围后重试。未确认服务结果前不要重复点击，不会自动重试导出。"
    />
    <Table
      v-if="tab === 'accounts'"
      row-key="accountId"
      :columns="accountCols"
      :data-source="accounts"
      :loading="busy"
      :pagination="{
        current: page,
        total,
        pageSize: 20,
        showSizeChanger: false,
      }"
      @change="
        (p) => {
          page = p.current ?? 1;
          run(load);
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'kind'">
          {{ labelOf(accountKinds, record.kind) }}
</template><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="
            ledgerQuery.accountId = record.accountId;
            tab = 'ledger';
            page = 1;
            run(load);
          "
        >
          查看流水
        </Button>
      </template>
    </Table>
    <Table
      v-else-if="tab === 'ledger'"
      row-key="id"
      :columns="ledgerCols"
      :data-source="ledgers"
      :loading="busy"
      :scroll="{ x: 1100 }"
      :pagination="{
        current: page,
        total,
        pageSize: 20,
        showSizeChanger: false,
      }"
      @change="
        (p) => {
          page = p.current ?? 1;
          run(load);
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          {{ labelOf(creditTypes, record.type) }}
</template><template v-else-if="column.key === 'createdAt'">
          {{ displayTime(record.createdAt) }}
</template><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="viewLedger = record as Ledger"
        >
          详情
        </Button>
      </template>
    </Table>
    <Table
      v-else
      row-key="id"
      :data-source="drafts"
      :loading="busy"
      :columns="[
        { title: '草稿ID', dataIndex: 'id' },
        { title: '账户ID', key: 'accountId' },
        { title: '额度', key: 'amount' },
        { title: '状态', key: 'status' },
        { title: '更新时间', key: 'updatedAt' },
        { title: '操作', key: 'action' },
      ]"
      :pagination="{
        current: page,
        total,
        pageSize: 20,
        showSizeChanger: false,
      }"
      @change="
        (p) => {
          page = p.current ?? 1;
          run(load);
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <Tag v-if="column.key === 'status'">
          {{ labelOf(draftStatuses, record.status) }}
</Tag><template v-else-if="column.key === 'updatedAt'">
          {{ displayTime(record.updatedAt) }}
</template><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="goDraft(record.id)"
        >
          查看/编辑
</Button><template v-else-if="column.key">
          {{ record.content[column.key] ?? '未填写' }}
        </template>
      </template>
    </Table>
  </Card>
  <Card v-if="rules" class="mt-4" title="消耗规则（只读）">
    <p>
      确认后免费 {{ rules.freeMonths }} 个月 /
      {{ rules.freeDownloads }} 次；超出每次
      {{ rules.creditsPerDownload ?? '未配置' }} 额度。{{ rules.source }}
    </p>
    <p>没有独立工单提交扣费规则，不虚构“工单消费”。实际模型下载消耗见流水。</p>
  </Card>
  <Modal
    :open="!!viewLedger"
    title="额度流水详情"
    :footer="null"
    @cancel="viewLedger = undefined"
  >
    <template v-if="viewLedger">
      <Descriptions bordered :column="1">
        <Descriptions.Item label="账户">
          {{ viewLedger.accountId }}
</Descriptions.Item><Descriptions.Item label="变动 / 余额">
          {{ viewLedger.amount }} / {{ viewLedger.balance }}
</Descriptions.Item><Descriptions.Item label="原因">
          {{ viewLedger.reason }}
</Descriptions.Item><Descriptions.Item label="业务单号">
          {{ viewLedger.businessRef }}
</Descriptions.Item><Descriptions.Item label="操作人">
          {{ viewLedger.operatorId }}
</Descriptions.Item><Descriptions.Item label="时间">
          {{ displayTime(viewLedger.createdAt) }}
        </Descriptions.Item>
</Descriptions><BusinessFiles
        v-if="viewLedger.voucherFileId"
        :model-value="[viewLedger.voucherFileId]"
        @error="error = $event"
      />
    </template>
  </Modal>
  <Modal
    :open="!!confirmation"
    title="确认额度操作"
    :confirm-loading="busy"
    @ok="apply"
    @cancel="
      confirmation = '';
      pending = undefined;
    "
  >
    <p>{{ confirmation }}</p>
</Modal><ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
