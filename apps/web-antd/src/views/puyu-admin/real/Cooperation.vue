<script setup lang="ts">
import type {
  Candidate,
  Event,
  ExportFile,
  Qr,
  Relation,
  RelationInput,
  Scan,
  Visit,
} from '#/data/adminBusinessApi';

import { computed, onMounted, reactive, ref } from 'vue';
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
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import { AdminBusinessService as service } from '#/application/adminBusinessService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import {
  businessEvents,
  downloadExport,
  labelOf,
  relationTypes,
  useBusinessUi,
} from './businessUi';
import { displayTime } from './operationsUi';
const props = defineProps<{ pageId: string }>();
const route = useRoute();
const router = useRouter();
const { busy, error, run } = useBusinessUi();
const qrMode = computed(() => props.pageId === 'cooperation-qrcode');
const detail = computed(() => props.pageId === 'cooperation-detail');
const rows = ref<Relation[]>([]);
const old = ref<Relation>();
const editing = ref(false);
const page = ref(1);
const total = ref(0);
const visits = ref<Visit[]>([]);
const visitPage = ref(1);
const visitTotal = ref(0);
const query = reactive({
  keyword: '',
  type: undefined as string | undefined,
  enabled: undefined as number | undefined,
  partnerPriceVisible: undefined as number | undefined,
});
const form = reactive<RelationInput>({
  enabled: true,
  partnerPriceVisible: false,
  modelPermission: false,
  remark: '',
});
const binding = ref(false);
const phone = ref('');
const partnerName = ref('');
const candidate = ref<Candidate | null | undefined>();
const bindType = ref<'create' | 'lookup'>('lookup');
const qrs = ref<Qr[]>([]);
const qrType = ref<Qr['type']>('DESIGNER');
const expires = ref('');
const qrPanel = ref(false);
const selectedQr = ref<Qr>();
const qrImage = ref<ExportFile>();
const scans = ref<Scan[]>([]);
const history = ref<Event[]>([]);
const historyPage = ref(1);
const historyTotal = ref(0);
const confirmation = ref('');
let pending: (() => Promise<unknown>) | undefined;
function confirm(text: string, action: () => Promise<unknown>) {
  confirmation.value = text;
  pending = action;
}
async function apply() {
  if (!pending) return;
  await run(async () => {
    const action = pending;
    if (!action) throw new Error('操作未确认');
    await action();
    confirmation.value = '';
    pending = undefined;
    message.success('操作已完成');
  });
}
function go(id: string, record?: string) {
  return router.push({
    name: `PuyuAdmin_${id}`,
    query: record ? { id: record } : {},
  });
}
async function load() {
  if (qrMode.value) qrs.value = await service.qrs();
  else if (detail.value) {
    if (typeof route.query.id !== 'string') return;
    old.value = await service.relation(route.query.id);
    Object.assign(form, old.value);
    await loadVisits();
  } else {
    const result = await service.relations(
      {
        ...query,
        enabled: query.enabled === undefined ? undefined : query.enabled === 1,
        partnerPriceVisible:
          query.partnerPriceVisible === undefined
            ? undefined
            : query.partnerPriceVisible === 1,
      },
      page.value,
    );
    rows.value = result.items;
    total.value = Number(result.total);
  }
}
async function loadVisits() {
  if (!old.value) return;
  const result = await service.visits(old.value.id, visitPage.value);
  visits.value = result.items;
  visitTotal.value = Number(result.total);
}
async function qrLogs(row: Qr) {
  selectedQr.value = row;
  qrImage.value = undefined;
  qrPanel.value = true;
  historyPage.value = 1;
  [scans.value] = await Promise.all([service.qrScans(row.id), loadQrHistory()]);
}
async function loadQrHistory() {
  if (!selectedQr.value) return;
  const result = await service.qrHistory(
    selectedQr.value.id,
    historyPage.value,
  );
  history.value = result.items;
  historyTotal.value = Number(result.total);
}
function saveRelation() {
  if (!old.value) return;
  const record = old.value;
  const content = {
    enabled: form.enabled,
    partnerPriceVisible: form.partnerPriceVisible,
    modelPermission: form.modelPermission,
    remark: form.remark,
  };
  confirm(
    `${record.name}：${content.enabled ? '保持/启用关系' : '停用关系'}；合作价${content.partnerPriceVisible ? '可见' : '不可见'}；模型权限${content.modelPermission ? '开启' : '关闭'}。停用将停止授权展示，商品公开零售价不因此隐藏。`,
    async () => {
      old.value = await service.updateRelation(record, content);
      editing.value = false;
      Object.assign(form, old.value);
    },
  );
}
const columns = [
  { title: '账号名称', dataIndex: 'name' },
  { title: '类型', key: 'type' },
  { title: '手机号', dataIndex: 'phone' },
  { title: '合作状态', key: 'enabled' },
  { title: '合作价展示', key: 'partnerPriceVisible' },
  { title: '模型权限', key: 'modelPermission' },
  { title: '最近访问', key: 'lastVisitedAt' },
  { title: '操作', key: 'action' },
];
onMounted(() => run(load));
</script>
<template>
  <template v-if="qrMode">
    <Card title="合作二维码">
      <Alert
        class="mb-4"
        type="info"
        message="仅合作商/设计师绑定，不自动获得合作价或模型权限。合作码和二维码仅交给预期绑定人。"
      />
      <Space wrap class="mb-4">
        <Select
          v-model:value="qrType"
          :options="relationTypes"
          style="width: 140px"
        /><Input
          v-model:value="expires"
          type="datetime-local"
          aria-label="二维码到期时间"
        /><Button
          v-if="permission.canManageCooperation()"
          type="primary"
          :disabled="busy"
          @click="
            confirm(
              '确认生成绑定码？创建超时请先刷新列表核对，勿反复生成。',
              async () => {
                await service.createQr(qrType, expires || null);
                await load();
              },
            )
          "
        >
          生成二维码
</Button><Button :loading="busy" @click="run(load)">刷新</Button>
      </Space>
      <Table
        row-key="id"
        :data-source="qrs"
        :loading="busy"
        :columns="[
          { title: '编号', dataIndex: 'id' },
          { title: '类型', key: 'type' },
          { title: '状态', key: 'enabled' },
          { title: '到期时间（上海）', key: 'expiresAt' },
          { title: '创建时间', key: 'createdAt' },
          { title: '操作', key: 'action' },
        ]"
        :pagination="{ pageSize: 20 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            {{ labelOf(relationTypes, record.type) }}
</template><Tag v-else-if="column.key === 'enabled'">
            {{ record.enabled ? '启用' : '停用' }}
</Tag><template
            v-else-if="column.key === 'expiresAt' || column.key === 'createdAt'"
          >
            {{ displayTime(record[column.key]) }}
</template><Space v-else-if="column.key === 'action'">
            <Button
              type="link"
              :disabled="busy"
              @click="run(() => qrLogs(record as Qr))"
            >
              查看/扫码记录
</Button><Button
              v-if="permission.canManageCooperation()"
              type="link"
              :disabled="busy"
              @click="
                confirm(
                  `确认${record.enabled ? '停用' : '启用'}二维码 ${record.id}？已建立关系不受此开关影响。`,
                  async () => {
                    await service.setQr(record.id, !record.enabled);
                    await load();
                  },
                )
              "
            >
              {{ record.enabled ? '停用' : '启用' }}
            </Button>
          </Space>
        </template>
      </Table>
      <Button class="mt-4" @click="go('cooperation-list')">返回合作关系</Button>
    </Card>
  </template>
  <Card v-else-if="!detail">
    <Space wrap class="mb-4">
      <Input
        v-model:value="query.keyword"
        aria-label="搜索合作关系"
        placeholder="名称或手机号"
      /><Select
        v-model:value="query.type"
        :options="relationTypes"
        placeholder="全部类型"
        allow-clear
        style="width: 130px"
      /><Select
        v-model:value="query.enabled"
        :options="[
          { value: 1, label: '合作中' },
          { value: 0, label: '已停用' },
        ]"
        placeholder="全部状态"
        allow-clear
        style="width: 130px"
      /><Select
        v-model:value="query.partnerPriceVisible"
        :options="[
          { value: 1, label: '合作价可见' },
          { value: 0, label: '合作价不可见' },
        ]"
        placeholder="合作价权限"
        allow-clear
        style="width: 150px"
      /><Button
        :loading="busy"
        @click="
          page = 1;
          run(load);
        "
      >
        查询
</Button><Button
        v-if="permission.canManageCooperation()"
        type="primary"
        @click="
          binding = true;
          candidate = undefined;
          phone = '';
          partnerName = '';
        "
      >
        绑定账号
</Button><Button @click="go('cooperation-qrcode')">二维码管理</Button>
    </Space>
    <Table
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :loading="busy"
      :scroll="{ x: 1050 }"
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
        <Button
          v-if="column.key === 'action'"
          type="link"
          @click="go('cooperation-detail', record.id)"
        >
          详情
</Button><template v-else-if="column.key === 'type'">
          {{ labelOf(relationTypes, record.type) }}
</template><template v-else-if="column.key === 'lastVisitedAt'">
          {{ displayTime(record.lastVisitedAt) }}
</template><Tag v-else-if="column.key">
          {{ record[column.key] ? '是' : '否' }}
        </Tag>
      </template>
    </Table>
  </Card>
  <template v-else-if="old">
    <Card title="合作关系详情">
      <Descriptions bordered :column="2">
        <Descriptions.Item label="名称">{{ old.name }}</Descriptions.Item><Descriptions.Item label="类型">
          {{ labelOf(relationTypes, old.type) }}
</Descriptions.Item><Descriptions.Item label="手机号">{{ old.phone }}</Descriptions.Item><Descriptions.Item label="合作状态">
          {{ old.enabled ? '合作中' : '已停用' }}
</Descriptions.Item><Descriptions.Item label="合作价展示">
          {{
            old.partnerPriceVisible ? '已授权' : '未授权'
          }}
</Descriptions.Item><Descriptions.Item label="模型权限">
          {{ old.modelPermission ? '已授权' : '未授权' }}
</Descriptions.Item><Descriptions.Item label="绑定时间">
          {{ displayTime(old.boundAt) }}
</Descriptions.Item><Descriptions.Item label="最近访问">
          {{ displayTime(old.lastVisitedAt) }}
</Descriptions.Item><Descriptions.Item label="备注">
          {{ old.remark || '—' }}
        </Descriptions.Item>
      </Descriptions>
      <Form v-if="editing" class="mt-4" layout="vertical">
        <Form.Item label="关系启用">
          <Switch v-model:checked="form.enabled" />
</Form.Item><Form.Item label="合作价可见">
          <Switch v-model:checked="form.partnerPriceVisible" />
</Form.Item><Form.Item label="模型权限">
          <Switch v-model:checked="form.modelPermission" />
</Form.Item><Form.Item label="备注">
          <Input.TextArea v-model:value="form.remark" :maxlength="1000" />
        </Form.Item>
      </Form>
</Card><Space class="my-4">
      <template v-if="permission.canManageCooperation()">
        <Button v-if="!editing" type="primary" @click="editing = true">
          编辑授权
</Button><Button v-else type="primary" :disabled="busy" @click="saveRelation">
          保存授权
</Button><Button
          v-if="editing"
          @click="
            Object.assign(form, old);
            editing = false;
          "
        >
          取消编辑
        </Button>
</template><Button @click="go('cooperation-list')">返回合作关系</Button>
    </Space>
    <Card title="访问记录（只读）">
      <Table
        row-key="id"
        :data-source="visits"
        :columns="[
          { title: '事件', key: 'event' },
          { title: '商品ID', dataIndex: 'productId' },
          { title: '访问时间', key: 'createdAt' },
        ]"
        :pagination="{
          current: visitPage,
          total: visitTotal,
          pageSize: 20,
          showSizeChanger: false,
        }"
        @change="
          (p) => {
            visitPage = p.current ?? 1;
            run(loadVisits);
          }
        "
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            {{ displayTime(record.createdAt) }}
</template><template
            v-else-if="column.key === 'event' || column.key === 'action'"
          >
            {{ businessEvents[record[column.key]] ?? record[column.key] }}
          </template>
        </template>
      </Table>
    </Card>
  </template>
  <Alert v-else-if="!busy" type="info" message="请从合作关系列表选择记录">
    <template #action>
      <Button @click="go('cooperation-list')">返回列表</Button>
    </template>
  </Alert>
  <Modal
    :open="binding"
    title="绑定合作账号"
    :footer="null"
    :mask-closable="false"
    @cancel="binding = false"
  >
    <Alert
      class="mb-3"
      type="info"
      message="仅绑定已存在设计师/合作商，或创建合作商。不会创建批发商或自动授予价格/模型权限。"
    /><Select
      v-model:value="bindType"
      :options="[
        { value: 'lookup', label: '查找已存在账号' },
        { value: 'create', label: '创建合作商并绑定' },
      ]"
      class="mb-3 w-full"
      @change="candidate = undefined"
    /><Input
      v-model:value="phone"
      aria-label="绑定账号手机号"
      placeholder="11位手机号"
      :disabled="busy"
      @change="candidate = undefined"
    /><Input
      v-if="bindType === 'create'"
      v-model:value="partnerName"
      class="mt-3"
      aria-label="合作商名称"
      placeholder="合作商名称"
      :disabled="busy"
    />
    <Space class="mt-4">
      <Button
        v-if="bindType === 'lookup'"
        :loading="busy"
        @click="
          run(async () => {
            candidate = await service.lookup(phone);
          })
        "
      >
        查找账号
</Button><Button
        v-else
        :disabled="busy || !permission.canManageCooperation()"
        @click="
          confirm(
            `创建合作商 ${partnerName} 并绑定？新关系不自动授权。`,
            async () => {
              await service.createPartner(partnerName, phone);
              binding = false;
              await load();
            },
          )
        "
      >
        创建并绑定
      </Button>
    </Space>
    <p v-if="candidate === null" class="mt-3">
      未找到可绑定账号，请确认手机号或创建合作商。
    </p>
    <div v-if="candidate" class="mt-4">
      <p>
        {{ candidate.name }} · {{ labelOf(relationTypes, candidate.type) }} ·
        {{ candidate.phone }}
      </p>
      <p v-if="candidate.existingRelationId">
        已绑定，请从列表查看，不会重复新增关系。
      </p>
      <Button
        v-else
        type="primary"
        :disabled="busy || !permission.canManageCooperation()"
        @click="
          confirm(
            `确认绑定 ${candidate?.name}？合作价和模型权限默认关闭。`,
            async () => {
              if (candidate) {
                await service.bind(candidate.accountId);
                binding = false;
                await load();
              }
            },
          )
        "
      >
        确认绑定
      </Button>
    </div>
  </Modal>
  <Modal
    :open="qrPanel"
    title="二维码与绑定记录"
    :footer="null"
    width="min(900px,95vw)"
    @cancel="qrPanel = false"
  >
    <template v-if="selectedQr">
      <p>
        二维码 {{ selectedQr.id }} ·
        {{ labelOf(relationTypes, selectedQr.type) }} ·
        {{ selectedQr.enabled ? '启用' : '停用' }}
      </p>
      <p class="my-3 break-all">合作码：{{ selectedQr.code }}</p>
      <Button
        :loading="busy"
        @click="
          run(async () => {
            qrImage = await service.qrImage(selectedQr!.id);
            await loadQrHistory();
          })
        "
      >
        加载二维码预览（会记录操作）
      </Button>
      <div v-if="qrImage" class="my-3">
        <img
          :src="`data:image/png;base64,${qrImage.content}`"
          alt="合作绑定二维码"
          width="220"
        /><Button @click="downloadExport(qrImage)">保存二维码PNG</Button>
      </div>
      <h3 class="my-3">扫码绑定记录</h3>
      <Table
        row-key="id"
        :data-source="scans"
        :columns="[
          { title: '账号ID', dataIndex: 'accountId' },
          { title: '关系ID', dataIndex: 'relationId' },
          { title: '来源', key: 'source' },
          { title: '绑定时间', key: 'boundAt' },
        ]"
        :pagination="{ pageSize: 10 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'boundAt'">
            {{ displayTime(record.boundAt) }}
</template><template v-else-if="column.key === 'source'">
            {{ businessEvents[record.source] ?? record.source }}
          </template>
        </template>
      </Table>
      <h3 class="my-3">二维码操作历史</h3>
      <Table
        row-key="id"
        :data-source="history"
        :columns="[
          { title: '操作', key: 'action' },
          { title: '说明', dataIndex: 'reason' },
          { title: '时间', key: 'createdAt' },
        ]"
        :pagination="{
          current: historyPage,
          total: historyTotal,
          pageSize: 20,
          showSizeChanger: false,
        }"
        @change="
          (p) => {
            historyPage = p.current ?? 1;
            run(loadQrHistory);
          }
        "
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            {{ displayTime(record.createdAt) }}
</template><template v-else-if="column.key === 'action'">
            {{ businessEvents[record.action] ?? record.action }}
          </template>
        </template>
      </Table>
    </template>
  </Modal>
  <Modal
    :open="!!confirmation"
    title="确认业务操作"
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
