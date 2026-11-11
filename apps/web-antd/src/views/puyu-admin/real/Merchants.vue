<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';

import type { Merchant, MerchantInput } from '#/data/realAdminApi';

import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  message,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import { RealAdminService } from '#/application/realAdminService';
import { permission } from '#/infrastructure/permission/permission';
import { shanghaiDate } from '#/infrastructure/time/shanghaiTime';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import ImageUpload from './ImageUpload.vue';
const props = defineProps<{ pageId: string }>();
const route = useRoute();
const router = useRouter();
const rows = ref<Merchant[]>([]);
const current = ref<Merchant>();
const formRef = ref<FormInstance>();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const keyword = ref('');
const pageNumber = ref(1);
const total = ref(0);
const edit = ref(false);
const isList = computed(() => props.pageId === 'platform-merchant-list');
const isForm = computed(
  () => props.pageId === 'platform-merchant-form' || edit.value,
);
const form = reactive<MerchantInput>({
  name: '',
  type: 'DEALER',
  loginPhone: '',
  storeName: '',
  address: '',
  contact: '',
  phone: '',
  serviceStart: '',
  serviceEnd: '',
  enabled: true,
  remark: '',
  introduction: '',
  logoFileId: null,
  wechatFileId: null,
});
const required = [{ required: true, message: '请填写此项' }];
const phoneRules = [
  {
    required: true,
    pattern: /^1[3-9]\d{9}$/,
    message: '请输入有效的11位手机号',
  },
];
const serviceLabels: Record<string, string> = {
  ACTIVE: '服务中',
  DISABLED: '已停用',
  NOT_STARTED: '未开始',
  EXPIRED: '已到期',
};
const columns = [
  { title: '商户名称', key: 'name' },
  { title: '商户编号', dataIndex: 'code' },
  { title: '登录手机号', key: 'loginPhone' },
  { title: '联系人', key: 'contact' },
  { title: '服务期限', key: 'dates' },
  { title: '服务状态', dataIndex: 'serviceStatus' },
  { title: '操作', key: 'action', width: 110 },
];
function go(pageId: string, id?: string) {
  return router.push({ name: `PuyuAdmin_${pageId}`, query: id ? { id } : {} });
}
async function load() {
  loading.value = true;
  edit.value = false;
  current.value = undefined;
  try {
    if (isList.value) {
      const result = await RealAdminService.merchants(
        keyword.value,
        pageNumber.value,
      );
      rows.value = result.items;
      total.value = Number(result.total);
    } else if (typeof route.query.id === 'string') {
      current.value = await RealAdminService.merchant(route.query.id);
      Object.assign(form, current.value.content);
    } else
      Object.assign(form, {
        name: '',
        type: 'DEALER',
        loginPhone: '',
        storeName: '',
        address: '',
        contact: '',
        phone: '',
        serviceStart: shanghaiDate(),
        serviceEnd: '',
        enabled: true,
        remark: '',
        introduction: '',
        logoFileId: null,
        wechatFileId: null,
      });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败';
  } finally {
    loading.value = false;
  }
}
async function save() {
  try {
    await formRef.value?.validate();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : '请完善标记为必填的字段，并检查手机号和服务日期';
    return;
  }
  saving.value = true;
  try {
    const saved = await RealAdminService.saveMerchant(
      { ...form },
      current.value,
    );
    message.success(
      current.value ? '商户资料已保存' : '商户入驻成功，主账号已创建',
    );
    await go('platform-merchant-detail', saved.id);
    await load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
watch(() => [props.pageId, route.query.id], load, { immediate: true });
</script>
<template>
  <template v-if="isList">
    <Card>
      <Space class="mb-4" wrap>
        <Input
          v-model:value="keyword"
          aria-label="搜索商户"
          placeholder="商户名称、手机号或联系人"
          @press-enter="
            pageNumber = 1;
            load();
          "
        />
        <Button
          @click="
            pageNumber = 1;
            load();
          "
        >
          查询
        </Button>
        <Button
          v-if="permission.canManageMerchants()"
          type="primary"
          @click="go('platform-merchant-form')"
        >
          商户入驻
        </Button>
        <Button @click="load">刷新</Button>
      </Space>
      <Table
        row-key="id"
        :data-source="rows"
        :columns="columns"
        :loading="loading"
        :pagination="{
          current: pageNumber,
          total,
          pageSize: 20,
          showSizeChanger: false,
        }"
        @change="
          (pagination) => {
            pageNumber = pagination.current ?? 1;
            load();
          }
        "
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ record.content.name }}
          </template>
          <template v-if="column.key === 'loginPhone'">
            {{ record.content.loginPhone }}
          </template>
          <template v-if="column.key === 'contact'">
            {{ record.content.contact }}
          </template>
          <template v-if="column.key === 'dates'">
            {{ record.content.serviceStart }} 至
            {{ record.content.serviceEnd }}
          </template>
          <Tag v-if="column.dataIndex === 'serviceStatus'">
            {{ serviceLabels[record.serviceStatus] || record.serviceStatus }}
          </Tag>
          <Button
            v-if="column.key === 'action'"
            type="link"
            @click="go('platform-merchant-detail', record.id)"
          >
            查看详情
          </Button>
        </template>
      </Table>
    </Card>
  </template>
  <template v-else-if="isForm">
    <Card title="商户资料" :loading="loading">
      <Alert
        type="info"
        show-icon
        :message="
          current
            ? '已有商户的服务到期日只读；请在入账管理创建服务账单，确认后生效。'
            : '入驻后使用主账号手机号登录，初始密码为手机号后8位。此处填写初始服务期限。'
        "
        class="mb-5"
      />
      <Form ref="formRef" :model="form" layout="vertical" name="merchant">
        <div class="form-grid">
          <Form.Item label="商户名称" name="name" :rules="required">
            <Input v-model:value="form.name" :maxlength="160" />
          </Form.Item>
          <Form.Item label="商户类型" name="type" :rules="required">
            <Select
              v-model:value="form.type"
              :options="[
                { label: '经销商', value: 'DEALER' },
                { label: '装修公司（业务预留）', value: 'RENOVATION' },
              ]"
            />
          </Form.Item>
          <Form.Item label="登录手机号" name="loginPhone" :rules="phoneRules">
            <Input v-model:value="form.loginPhone" :maxlength="11" />
          </Form.Item>
          <Form.Item label="门店名称" name="storeName" :rules="required">
            <Input v-model:value="form.storeName" />
          </Form.Item>
          <Form.Item label="联系人" name="contact" :rules="required">
            <Input v-model:value="form.contact" />
          </Form.Item>
          <Form.Item label="联系电话" name="phone" :rules="phoneRules">
            <Input v-model:value="form.phone" :maxlength="11" />
          </Form.Item>
          <Form.Item label="服务开始日期" name="serviceStart" :rules="required">
            <Input v-model:value="form.serviceStart" type="date" />
          </Form.Item>
          <Form.Item label="服务到期日期" name="serviceEnd" :rules="required">
            <Input
              v-model:value="form.serviceEnd"
              type="date"
              :disabled="!!current"
            />
          </Form.Item>
          <Form.Item label="门店地址" name="address">
            <Input v-model:value="form.address" />
          </Form.Item>
          <Form.Item label="启用状态" name="enabled">
            <Switch
              v-model:checked="form.enabled"
              checked-children="启用"
              un-checked-children="停用"
            />
          </Form.Item>
          <Form.Item label="商户Logo">
            <ImageUpload
              :model-value="form.logoFileId ? [form.logoFileId] : []"
              @update:model-value="(ids) => (form.logoFileId = ids[0] ?? null)"
              @error="errorMessage = $event"
            />
          </Form.Item>
          <Form.Item label="联系人微信二维码">
            <ImageUpload
              :model-value="form.wechatFileId ? [form.wechatFileId] : []"
              @update:model-value="
                (ids) => (form.wechatFileId = ids[0] ?? null)
              "
              @error="errorMessage = $event"
            />
          </Form.Item>
        </div>
        <Form.Item label="商户介绍" name="introduction">
          <Input.TextArea v-model:value="form.introduction" :rows="3" />
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea v-model:value="form.remark" :rows="2" />
        </Form.Item>
      </Form>
    </Card>
    <Space class="mt-5">
      <Button
        v-if="permission.canManageMerchants()"
        type="primary"
        :loading="saving"
        @click="save"
      >
        {{ current ? '保存修改' : '提交入驻' }}
</Button><Button
        :disabled="saving"
        @click="current ? (edit = false) : go('platform-merchant-list')"
      >
        取消
      </Button>
    </Space>
  </template>
  <template v-else-if="current">
    <Card title="商户详情" :loading="loading">
      <Descriptions bordered :column="2">
        <Descriptions.Item label="商户名称">
          {{ current.content.name }}
</Descriptions.Item><Descriptions.Item label="商户编号">
          {{ current.code }}
        </Descriptions.Item>
        <Descriptions.Item label="登录手机号">
          {{ current.content.loginPhone }}
</Descriptions.Item><Descriptions.Item label="商户类型">
          {{ current.content.type === 'DEALER' ? '经销商' : '装修公司' }}
        </Descriptions.Item>
        <Descriptions.Item label="门店名称">
          {{ current.content.storeName }}
</Descriptions.Item><Descriptions.Item label="门店地址">
          {{ current.content.address || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="联系人">
          {{ current.content.contact }}
</Descriptions.Item><Descriptions.Item label="联系电话">
          {{ current.content.phone }}
        </Descriptions.Item>
        <Descriptions.Item label="服务开始日期">
          {{ current.content.serviceStart }}
</Descriptions.Item><Descriptions.Item label="服务到期日期">
          {{ current.content.serviceEnd }}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag>
            {{ serviceLabels[current.serviceStatus] || current.serviceStatus }}
          </Tag>
</Descriptions.Item><Descriptions.Item label="启用状态">
          {{ current.content.enabled ? '启用' : '停用' }}
        </Descriptions.Item>
        <Descriptions.Item label="Logo文件">
          {{ current.content.logoFileId || '未上传' }}
</Descriptions.Item><Descriptions.Item label="微信二维码文件">
          {{ current.content.wechatFileId || '未上传' }}
        </Descriptions.Item>
        <Descriptions.Item label="介绍">
          {{ current.content.introduction || '—' }}
</Descriptions.Item><Descriptions.Item label="备注">
          {{ current.content.remark || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </Card>
    <Space class="mt-5">
      <Button
        v-if="permission.canManageMerchants()"
        type="primary"
        @click="edit = true"
      >
        编辑商户
</Button><Button @click="go('platform-merchant-list')"> 返回商户列表 </Button>
    </Space>
  </template>
  <Alert v-else type="info" message="请从商户列表选择一条记录" />
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
  gap: 0 24px;
}

@media (max-width: 850px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
