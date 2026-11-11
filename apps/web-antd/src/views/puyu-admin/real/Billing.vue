<script setup lang="ts">
import type { Bill, BillInput, Event, Monthly } from '#/data/adminBusinessApi';

import { computed, onMounted, reactive, ref } from 'vue';

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

import { AdminBusinessService as service } from '#/application/adminBusinessService';
import { createOperationRequest } from '#/application/operationsService';
import { permission } from '#/infrastructure/permission/permission';
import { shanghaiDate } from '#/infrastructure/time/shanghaiTime';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import BusinessFiles from './BusinessFiles.vue';
import BusinessPicker from './BusinessPicker.vue';
import {
  billStatuses,
  billTypes,
  entryMethods,
  labelOf,
  useBusinessUi,
} from './businessUi';
import { displayTime } from './operationsUi';
const { error, busy, run } = useBusinessUi();
const uploadBusy = ref(false);
const rows = ref<Bill[]>([]);
const page = ref(1);
const total = ref(0);
const month = ref(shanghaiDate().slice(0, 7));
const merchantId = ref<null | string>();
const status = ref<string>();
const monthly = ref<Monthly>();
const old = ref<Bill>();
const events = ref<Event[]>([]);
const open = ref(false);
const editing = ref(false);
const action = ref<'CONFIRM' | 'VOID'>();
const reason = ref('');
const receivedAt = ref('');
let saveCommand = createOperationRequest();
let actionCommand = createOperationRequest();
const blank = (): BillInput => ({
  merchantId: '',
  type: 'OTHER',
  amount: '0.00',
  method: 'OFFLINE_OTHER',
  remark: '',
  voucherFileId: null,
  newServiceEnd: null,
  creditAmount: '0',
});
const form = reactive<BillInput>(blank());
const saveConfirm = ref(false);
const editable = computed(() => !old.value || old.value.status === 'PENDING');
async function load() {
  const [r, s] = await Promise.all([
    service.bills(
      {
        merchantId: merchantId.value || undefined,
        status: status.value,
        month: month.value,
      },
      page.value,
    ),
    service.monthly(month.value),
  ]);
  rows.value = r.items;
  total.value = Number(r.total);
  monthly.value = s;
}
async function show(row: Bill) {
  const record = await service.bill(row.id);
  old.value = record;
  Object.assign(form, record.content);
  events.value = await service.billHistory(record.id);
  editing.value = false;
  open.value = true;
}
function create() {
  old.value = undefined;
  Object.assign(form, blank());
  events.value = [];
  editing.value = true;
  open.value = true;
}
async function save() {
  if (uploadBusy.value) return;
  await run(async () => {
    const content = { ...form };
    old.value = await service.saveBill(
      saveCommand({ id: old.value?.id, version: old.value?.version, content })
        .requestId,
      content,
      old.value,
    );
    // The write is acknowledged; later refresh failures must not revive its command.
    saveCommand = createOperationRequest();
    Object.assign(form, old.value.content);
    saveConfirm.value = false;
    editing.value = false;
    events.value = await service.billHistory(old.value.id);
    await load();
    message.success('待入账记录已保存，尚未修改额度或服务期限');
  });
}
function choose(next: 'CONFIRM' | 'VOID') {
  action.value = next;
  reason.value = '';
  receivedAt.value = '';
  actionCommand = createOperationRequest();
}
async function transition() {
  if (!old.value || !action.value) return;
  const record = old.value;
  const next = action.value;
  await run(async () => {
    old.value = await service.billAction(
      record,
      next,
      reason.value,
      receivedAt.value || null,
      actionCommand({
        id: record.id,
        version: record.version,
        action: next,
        reason: reason.value,
        receivedAt: receivedAt.value,
      }).requestId,
    );
    action.value = undefined;
    Object.assign(form, old.value.content);
    events.value = await service.billHistory(old.value.id);
    await load();
    message.success('入账状态已更新');
  });
}
onMounted(() => run(load));
</script>
<template>
  <Alert
    class="mb-4"
    type="info"
    message="记录线下入账与零元调整，不发起支付。确认入账可能增加服务额度或调整服务期；已入账记录不能作废抵消历史。"
  />
  <Space v-if="monthly" wrap class="mb-4">
    <Card>
      <p>当月已入账金额</p>
      <p class="text-2xl">{{ monthly.confirmedAmount }}</p>
      <p>{{ monthly.confirmedCount }} 笔</p>
</Card><Card>
      <p>当月待入账金额</p>
      <p class="text-2xl">{{ monthly.pendingAmount }}</p>
      <p>{{ monthly.pendingCount }} 笔</p>
</Card><Card>
      <p>当月已作废金额</p>
      <p class="text-2xl">{{ monthly.voidAmount }}</p>
      <p>{{ monthly.voidCount }} 笔</p>
    </Card>
  </Space>
  <Card>
    <Space wrap class="mb-4">
      <Input
        v-model:value="month"
        type="month"
        aria-label="入账月份"
      /><BusinessPicker
        v-model="merchantId"
        kind="merchant"
        style="width: 260px"
        @error="error = $event"
      /><Select
        v-model:value="status"
        :options="billStatuses"
        placeholder="全部状态"
        allow-clear
        style="width: 140px"
      /><Button
        :loading="busy"
        @click="
          page = 1;
          run(load);
        "
      >
        查询
</Button><Button
        v-if="permission.canManageBilling()"
        type="primary"
        @click="create"
      >
        新增待入账
      </Button>
    </Space>
    <p class="mb-3">
      月份卡片为平台全商户汇总；下方商户/状态筛选仅作用于账单列表。
    </p>
    <Table
      row-key="id"
      :loading="busy"
      :data-source="rows"
      :columns="[
        { title: '账单编号', dataIndex: 'code' },
        { title: '商户ID', key: 'merchantId' },
        { title: '类型', key: 'type' },
        { title: '金额', key: 'amount' },
        { title: '状态', key: 'status' },
        { title: '入账时间', key: 'receivedAt' },
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
          {{ labelOf(billStatuses, record.status) }}
</Tag><template v-else-if="column.key === 'type'">
          {{ labelOf(billTypes, record.content.type) }}
</template><template v-else-if="column.key === 'receivedAt'">
          {{ displayTime(record.receivedAt) }}
</template><Button
          v-else-if="column.key === 'action'"
          type="link"
          @click="run(() => show(record as Bill))"
        >
          详情
</Button><template v-else-if="column.key">
          {{ record.content[column.key] }}
        </template>
      </template>
    </Table>
  </Card>
  <Drawer
    :open="open"
    :title="old ? `账单 ${old.code}` : '新增待入账'"
    width="min(900px,96vw)"
    :closable="!busy && !uploadBusy"
    :mask-closable="false"
    @close="open = false"
  >
    <template v-if="editing">
      <Form layout="vertical">
        <div class="business-grid">
          <Form.Item label="商户（必填）">
            <BusinessPicker
              v-model="form.merchantId"
              kind="merchant"
              :disabled="busy"
              @error="error = $event"
            />
</Form.Item><Form.Item label="账单类型">
            <Select
              v-model:value="form.type"
              :options="billTypes"
            />
</Form.Item><Form.Item label="线下金额">
            <Input
              v-model:value="form.amount"
              aria-label="入账金额"
            />
</Form.Item><Form.Item label="记录方式">
            <Select
              v-model:value="form.method"
              :options="entryMethods"
            />
</Form.Item><Form.Item v-if="form.type === 'CREDIT'" label="充值额度（正整数）">
            <Input v-model:value="form.creditAmount" />
</Form.Item><Form.Item v-if="form.type === 'SERVICE'" label="服务新到期日">
            <Input
              :value="form.newServiceEnd ?? ''"
              @update:value="(v) => (form.newServiceEnd = String(v) || null)"
              type="date"
            />
          </Form.Item>
        </div>
        <Form.Item label="备注（必填）">
          <Input.TextArea
            v-model:value="form.remark"
            :maxlength="1000"
          />
</Form.Item><Form.Item label="线下凭证（保存可后补，非零确认必填）">
          <BusinessFiles
            :model-value="form.voucherFileId ? [form.voucherFileId] : []"
            :editable="!form.voucherFileId"
            purpose="VOUCHER"
            :disabled="busy"
            @update:model-value="(v) => (form.voucherFileId = v[0] ?? null)"
            @busy="uploadBusy = $event"
            @error="error = $event"
          /><Button
            v-if="form.voucherFileId"
            :disabled="busy || uploadBusy"
            @click="form.voucherFileId = null"
          >
            解除凭证关联
          </Button>
        </Form.Item>
      </Form>
    </template>
    <Descriptions v-else-if="old" bordered :column="1">
      <Descriptions.Item label="状态">
        {{ labelOf(billStatuses, old.status) }}
</Descriptions.Item><Descriptions.Item label="商户ID">
        {{ old.content.merchantId }}
</Descriptions.Item><Descriptions.Item label="类型">
        {{ labelOf(billTypes, old.content.type) }}
</Descriptions.Item><Descriptions.Item label="金额 / 记录方式">
        {{ old.content.amount }} /
        {{ labelOf(entryMethods, old.content.method) }}
</Descriptions.Item><Descriptions.Item label="额度变动">
        {{ old.content.creditAmount }}
</Descriptions.Item><Descriptions.Item label="服务期限">
        {{ old.oldServiceEnd }} →
        {{ old.content.newServiceEnd ?? '不调整' }}
</Descriptions.Item><Descriptions.Item label="备注">
        {{ old.content.remark }}
</Descriptions.Item><Descriptions.Item label="入账时间">
        {{ displayTime(old.receivedAt) }}
</Descriptions.Item><Descriptions.Item label="创建 / 更新时间">
        {{ displayTime(old.createdAt) }} /
        {{ displayTime(old.updatedAt) }}
</Descriptions.Item><Descriptions.Item label="凭证">
        <BusinessFiles
          :model-value="
            old.content.voucherFileId ? [old.content.voucherFileId] : []
          "
          @error="error = $event"
        />
      </Descriptions.Item>
    </Descriptions>
    <h3 v-if="old" class="my-4">操作历史</h3>
    <Table
      v-if="old"
      row-key="id"
      size="small"
      :data-source="events"
      :columns="[
        { title: '操作', dataIndex: 'action' },
        { title: '操作人', dataIndex: 'operatorId' },
        { title: '原因', dataIndex: 'reason' },
        { title: '时间', key: 'createdAt' },
      ]"
      :pagination="{ pageSize: 10 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'createdAt'">
          {{ displayTime(record.createdAt) }}
        </template>
      </template>
    </Table>
    <Space class="mt-5" wrap>
      <template v-if="permission.canManageBilling()">
        <Button
          v-if="editing"
          type="primary"
          :disabled="busy || uploadBusy"
          @click="saveConfirm = true"
        >
          保存待入账
</Button><template v-else-if="editable">
          <Button @click="editing = true">编辑记录</Button><Button type="primary" @click="choose('CONFIRM')">确认入账</Button><Button danger @click="choose('VOID')">作废记录</Button>
        </template>
</template><Button
        :disabled="busy || uploadBusy"
        @click="
          old && editing
            ? (Object.assign(form, old.content), (editing = false))
            : (open = false)
        "
      >
        取消/返回
      </Button>
    </Space>
  </Drawer>
  <Modal
    :open="saveConfirm"
    title="确认保存待入账"
    :confirm-loading="busy"
    @ok="save"
    @cancel="saveConfirm = false"
  >
    <p>
      仅保存账单草稿，不立即充值或修改服务期限。确认入账需要下一次独立确认。
    </p>
  </Modal>
  <Modal
    :open="!!action"
    :title="action === 'CONFIRM' ? '确认真实入账' : '作废待入账记录'"
    :confirm-loading="busy"
    @ok="transition"
    @cancel="action = undefined"
  >
    <p>
      {{ old?.code }} · {{ old?.content.amount }}。{{
        action === 'CONFIRM'
          ? '确认后会应用额度或服务期限，不能通过作废回退。'
          : '仅可作废待入账记录。'
      }}
    </p>
    <Alert
      v-if="action === 'CONFIRM'"
      class="my-3"
      type="info"
      message="非零金额须先在编辑记录中补齐凭证并保存，再确认入账；0元凭证可选，备注和确认原因仍必填。"
    />
    <Form layout="vertical">
      <Form.Item label="原因（必填）">
        <Input.TextArea v-model:value="reason" :maxlength="1000" />
</Form.Item><Form.Item
        v-if="action === 'CONFIRM'"
        label="实际入账时间（上海，不晚于现在）"
      >
        <Input v-model:value="receivedAt" type="datetime-local" />
      </Form.Item>
    </Form>
  </Modal>
  <ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
