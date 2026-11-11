<script setup lang="ts">
import type {
  Designer,
  DesignerInput,
  DesignerOverview,
  Relation,
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
  Table,
  Tag,
} from 'ant-design-vue';

import { AdminBusinessService as service } from '#/application/adminBusinessService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import BusinessFiles from './BusinessFiles.vue';
import BusinessPicker from './BusinessPicker.vue';
import { maskPhone, useBusinessUi } from './businessUi';
import ImageUpload from './ImageUpload.vue';
import { displayTime } from './operationsUi';
const props = defineProps<{ pageId: string }>();
const route = useRoute();
const router = useRouter();
const { error, busy, run } = useBusinessUi();
const uploadCount = ref(0);
const trackUpload = (active: boolean) => {
  uploadCount.value = Math.max(0, uploadCount.value + (active ? 1 : -1));
};
const list = computed(() => props.pageId === 'platform-designer-list');
const editing = ref(props.pageId === 'platform-designer-onboarding');
const old = ref<Designer>();
const overview = ref<DesignerOverview>();
const relations = ref<Relation[]>([]);
const rows = ref<Designer[]>([]);
const page = ref(1);
const total = ref(0);
const confirm = ref(false);
const balances = ref<Record<string, string>>({});
const query = reactive({
  keyword: '',
  designerStatus: undefined as string | undefined,
  designerLevel: undefined as string | undefined,
  city: '',
});
const levels = [
  { value: 'NORMAL', label: '普通' },
  { value: 'SENIOR', label: '资深' },
  { value: 'LEAD', label: '主案' },
];
const statuses = [
  { value: 'PENDING', label: '待审核' },
  { value: 'COOPERATING', label: '合作中' },
  { value: 'DISABLED', label: '已停用' },
];
const label = (items: typeof levels, key: string) =>
  items.find((i) => i.value === key)?.label ?? key;
const form = reactive<DesignerInput>({
  name: '',
  loginPhone: '',
  level: 'NORMAL',
  avatarFileId: null,
  city: '',
  styles: '',
  phone: '',
  wechatFileId: null,
  introduction: '',
  certificationFileIds: [],
  status: 'PENDING',
  cooperatingMerchantId: null,
});
const required = [{ required: true, message: '请填写此项' }];
const mobile = [
  { required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入有效11位手机号' },
];
const formRef = ref();
const columns = [
  { title: '姓名', key: 'name' },
  { title: '等级', key: 'level' },
  { title: '登录手机号', key: 'loginPhone' },
  { title: '城市', key: 'city' },
  { title: '擅长风格', key: 'styles' },
  { title: '入驻状态', key: 'status' },
  { title: '主合作商户ID', key: 'primaryMerchant' },
  { title: '额度余额', key: 'balance' },
  { title: '入驻时间', key: 'createdAt' },
  { title: '操作', key: 'action' },
];
const fields: [keyof DesignerInput, string][] = [
  ['name', '姓名'],
  ['loginPhone', '登录手机号'],
  ['phone', '联系电话'],
  ['city', '服务城市'],
  ['styles', '擅长风格'],
  ['introduction', '简介'],
];
function go(id: string, record?: string) {
  return router.push({
    name: `PuyuAdmin_${id}`,
    query: record ? { id: record } : {},
  });
}
async function load() {
  if (list.value) {
    const result = await service.designers({ ...query }, page.value);
    rows.value = result.items;
    total.value = Number(result.total);
    const summaries =
      result.items.length > 0
        ? await service.designerCreditSummaries(result.items.map((d) => d.id))
        : [];
    balances.value = Object.fromEntries(
      summaries.map((c) => [c.accountId, c.balance]),
    );
  } else if (typeof route.query.id === 'string') {
    const record = await service.designer(route.query.id);
    old.value = record;
    Object.assign(form, record.content);
    [overview.value, relations.value] = await Promise.all([
      service.designerOverview(record.id),
      service.designerRelations(record.id),
    ]);
  }
}
async function check() {
  if (uploadCount.value) return;
  try {
    await formRef.value.validate();
    confirm.value = true;
  } catch {
    error.value = '请完善设计师资料和有效手机号';
  }
}
async function save() {
  if (uploadCount.value) return;
  await run(async () => {
    const value = await service.saveDesigner(
      { ...form, certificationFileIds: [...form.certificationFileIds] },
      old.value,
    );
    const sameDetail =
      props.pageId === 'platform-designer-detail' &&
      route.query.id === value.id;
    old.value = value;
    Object.assign(form, value.content);
    editing.value = false;
    confirm.value = false;
    message.success('设计师资料已保存');
    sameDetail ? await load() : await go('platform-designer-detail', value.id);
  });
}
onMounted(() => run(load));
</script>
<template>
  <Card v-if="list">
    <Space wrap class="mb-4">
      <Input
        v-model:value="query.keyword"
        aria-label="搜索设计师"
        placeholder="姓名、手机号或风格"
        @press-enter="
          page = 1;
          run(load);
        "
      /><Input
        v-model:value="query.city"
        aria-label="服务城市筛选"
        placeholder="服务城市"
      /><Select
        v-model:value="query.designerStatus"
        :options="statuses"
        placeholder="全部状态"
        allow-clear
        style="width: 140px"
      /><Select
        v-model:value="query.designerLevel"
        :options="levels"
        placeholder="全部等级"
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
        v-if="permission.canManageDesigners()"
        type="primary"
        @click="go('platform-designer-onboarding')"
      >
        设计师入驻
      </Button>
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
        <template v-if="column.key === 'action'">
          <Button
            type="link"
            @click="go('platform-designer-detail', record.id)"
          >
            详情
          </Button>
</template><template v-else-if="column.key === 'createdAt'">
          {{ displayTime(record.createdAt) }}
</template><Tag v-else-if="column.key === 'status'">
          {{ label(statuses, record.content.status) }}
</Tag><template v-else-if="column.key === 'level'">
          {{ label(levels, record.content.level) }}
</template><template v-else-if="column.key === 'balance'">
          {{ balances[record.accountId] ?? '—' }}
</template><template v-else-if="column.key === 'primaryMerchant'">
          {{ record.content.cooperatingMerchantId ?? '未选择' }}
</template><template v-else-if="column.key === 'loginPhone'">
          {{ maskPhone(record.content.loginPhone) }}
</template><template v-else>
          {{ record.content[String(column.key)] }}
        </template>
      </template>
    </Table>
  </Card>
  <template v-else-if="editing">
    <Card :title="old ? '编辑设计师' : '设计师入驻'" :loading="busy">
      <Alert
        class="mb-4"
        type="info"
        message="新账号初始密码为登录手机号后8位。主合作商户不自动授予价格或模型权限；状态变更会影响真实访问。"
      />
      <Form ref="formRef" :model="form" layout="vertical" name="designer">
        <div class="business-grid">
          <Form.Item
            v-for="[key, title] in fields"
            :key="key"
            :label="title"
            :name="key"
            :rules="
              ['phone', 'loginPhone'].includes(key)
                ? mobile
                : key === 'introduction'
                  ? []
                  : required
            "
          >
            <Input
              :value="String(form[key] ?? '')"
              :maxlength="
                key === 'introduction' ? 5000 : key === 'styles' ? 500 : 160
              "
              @update:value="
                (value) => Object.assign(form, { [key]: String(value) })
              "
            />
          </Form.Item>
          <Form.Item label="设计师等级">
            <Select v-model:value="form.level" :options="levels" />
</Form.Item><Form.Item label="入驻状态">
            <Select v-model:value="form.status" :options="statuses" />
          </Form.Item>
          <Form.Item label="主合作商户（可空）">
            <BusinessPicker
              v-model="form.cooperatingMerchantId"
              kind="merchant"
              @error="error = $event"
            />
          </Form.Item>
          <Form.Item label="头像">
            <ImageUpload
              :disabled="busy"
              @busy="trackUpload"
              :model-value="form.avatarFileId ? [form.avatarFileId] : []"
              @update:model-value="(v) => (form.avatarFileId = v[0] ?? null)"
              @error="error = $event"
            />
</Form.Item><Form.Item label="微信二维码">
            <ImageUpload
              :disabled="busy"
              @busy="trackUpload"
              :model-value="form.wechatFileId ? [form.wechatFileId] : []"
              @update:model-value="(v) => (form.wechatFileId = v[0] ?? null)"
              @error="error = $event"
            />
          </Form.Item>
        </div>
        <Form.Item label="认证附件">
          <BusinessFiles
            v-model="form.certificationFileIds"
            editable
            :disabled="busy"
            @busy="trackUpload"
            @error="error = $event"
          />
        </Form.Item>
      </Form>
</Card><Space class="mt-5">
      <Button
        v-if="permission.canManageDesigners()"
        type="primary"
        :loading="busy"
        :disabled="uploadCount > 0"
        @click="check"
      >
        保存设计师
</Button><Button
        :disabled="busy || uploadCount > 0"
        @click="
          old
            ? (Object.assign(form, old.content), (editing = false))
            : go('platform-designer-list')
        "
      >
        取消
      </Button>
    </Space>
  </template>
  <template v-else-if="old">
    <Card title="设计师详情">
      <Descriptions bordered :column="2">
        <Descriptions.Item
          v-for="[key, title] in fields"
          :key="key"
          :label="title"
        >
          {{ old.content[key] || '—' }}
</Descriptions.Item><Descriptions.Item label="等级">
          {{ label(levels, old.content.level) }}
</Descriptions.Item><Descriptions.Item label="入驻状态">
          {{ label(statuses, old.content.status) }}
</Descriptions.Item><Descriptions.Item label="主合作商户ID">
          {{
            old.content.cooperatingMerchantId ?? '未选择'
          }}
</Descriptions.Item><Descriptions.Item label="头像/微信文件">
          {{ old.content.avatarFileId ?? '未上传' }} /
          {{ old.content.wechatFileId ?? '未上传' }}
</Descriptions.Item><Descriptions.Item label="认证附件">
          {{
            old.content.certificationFileIds.join('、') || '无'
          }}
</Descriptions.Item><Descriptions.Item label="作品数量">
          {{ overview?.worksCount ?? '未接入（P0预留）' }}
</Descriptions.Item><Descriptions.Item label="服务额度">
          {{ overview?.credits.balance ?? '—' }}
</Descriptions.Item><Descriptions.Item label="更新时间">
          {{ displayTime(old.updatedAt) }}
        </Descriptions.Item>
      </Descriptions>
    </Card>
    <Card class="mt-4" title="授权关系（只读）">
      <Table
        row-key="id"
        :data-source="relations"
        :columns="[
          { title: '合作商户', key: 'merchantName' },
          { title: '关系状态', key: 'enabled' },
          { title: '合作价展示', key: 'partnerPriceVisible' },
          { title: '模型权限', key: 'modelPermission' },
        ]"
        :pagination="{ pageSize: 10 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'merchantName'">
            {{
              overview?.merchants.find(
                (m) => m.merchantId === record.merchantId,
              )?.name ?? record.merchantId
            }}
</template><template v-else-if="column.key">
            {{ record[column.key] ? '是' : '否' }}
          </template>
        </template>
      </Table>
      <p class="mt-2">授权由所属商户维护；平台不在此页改关系权限。</p>
    </Card>
    <Space class="mt-5">
      <Button
        v-if="permission.canManageDesigners()"
        type="primary"
        @click="editing = true"
      >
        编辑设计师
</Button><Button @click="go('platform-designer-list')"> 返回设计师列表 </Button>
    </Space>
  </template>
  <Alert v-else-if="!busy" type="info" message="请从设计师列表选择一条记录">
    <template #action>
      <Button @click="go('platform-designer-list')">返回列表</Button>
    </template>
  </Alert>
  <Modal
    :open="confirm"
    title="确认保存设计师"
    :confirm-loading="busy"
    @ok="save"
    @cancel="confirm = false"
  >
    <p>
      {{ form.name }} ·
      {{ label(statuses, form.status) }}。保存将更新真实账号和档案，确定继续？
    </p>
  </Modal>
  <ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
