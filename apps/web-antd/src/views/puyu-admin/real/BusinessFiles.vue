<script setup lang="ts">
import type { UploadProps } from 'ant-design-vue';

import type {
  BusinessFile,
  FilePurpose,
  ModelDownload,
  ModelQuote,
} from '#/data/operationsApi';

import { ref, watch } from 'vue';

import {
  Alert,
  Button,
  List,
  message,
  Modal,
  Space,
  Table,
  Upload,
} from 'ant-design-vue';

import {
  createOperationRequest,
  OperationsService,
} from '#/application/operationsService';

import { displayTime, labels, saveFile } from './operationsUi';
const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    editable?: boolean;
    merchantId?: string;
    modelValue: string[];
    purpose?: FilePurpose;
  }>(),
  {
    editable: false,
    purpose: 'ATTACHMENT',
    disabled: false,
    merchantId: undefined,
  },
);
const emit = defineEmits<{
  busy: [boolean];
  error: [string];
  'update:modelValue': [string[]];
}>();
const files = ref<BusinessFile[]>([]);
const busy = ref(false);
const quote = ref<ModelQuote>();
const downloading = ref(false);
const activeFile = ref<BusinessFile>();
const history = ref<ModelDownload[]>([]);
const loadError = ref('');
let request = createOperationRequest();
let revision = 0;
const historyColumns = [
  { title: '下载时间', key: 'createdAt' },
  { title: '消耗额度', dataIndex: 'consumedCredits' },
  { title: '下载人ID', dataIndex: 'operatorId' },
];
function fail(e: unknown) {
  emit('error', e instanceof Error ? e.message : '文件操作失败');
}
async function load() {
  const token = ++revision;
  loadError.value = '';
  try {
    const result = await Promise.all(
      props.modelValue.map((id) => OperationsService.file(id)),
    );
    if (token === revision) files.value = result;
  } catch (error) {
    if (token === revision) {
      files.value = [];
      loadError.value = '附件信息加载失败，请重试';
      fail(error);
    }
  }
}
watch(() => [...props.modelValue], load, { immediate: true });
const upload: UploadProps['customRequest'] = async (options) => {
  if (busy.value || props.disabled) {
    options.onError?.(new Error('请等待当前操作完成'));
    return;
  }
  busy.value = true;
  emit('busy', true);
  try {
    const file = options.file as File;
    if (props.modelValue.length >= 20) throw new Error('最多20个文件');
    if (file.size === 0 || file.size > 20 * 1024 * 1024)
      throw new Error('文件需在1字节至20MiB之间');
    const allowed =
      props.purpose === 'MODEL'
        ? /\.(zip|obj|fbx|blend|glb|gltf|max|skp)$/i
        : /\.(png|jpe?g|webp|pdf|zip)$/i;
    if (!allowed.test(file.name)) throw new Error('不支持的文件格式');
    const result = await OperationsService.upload(
      file,
      props.purpose,
      props.merchantId,
    );
    emit('update:modelValue', [...props.modelValue, result.id]);
    options.onSuccess?.(result);
  } catch (error) {
    const exception = error instanceof Error ? error : new Error('上传失败');
    options.onError?.(exception);
    fail(exception);
  } finally {
    busy.value = false;
    emit('busy', false);
  }
};
async function download(file: BusinessFile) {
  if (busy.value) return;
  busy.value = true;
  try {
    if (file.purpose === 'MODEL') {
      activeFile.value = file;
      request = createOperationRequest();
      const [nextQuote, events] = await Promise.all([
        OperationsService.modelQuote(file.id),
        OperationsService.modelHistory(file.id),
      ]);
      quote.value = nextQuote;
      history.value = events;
    } else
      saveFile(
        OperationsService.decodeDownload(
          await OperationsService.downloadFile(file.id),
        ),
      );
  } catch (error) {
    fail(error);
  } finally {
    busy.value = false;
  }
}
async function confirmDownload() {
  if (!quote.value?.canDownload || !activeFile.value || downloading.value)
    return;
  downloading.value = true;
  try {
    const result = await OperationsService.downloadModel(
      activeFile.value.id,
      request({ fileId: activeFile.value.id }).requestId,
    );
    saveFile(OperationsService.decodeDownload(result));
    message.success(`下载成功，本次消耗服务额度 ${result.consumedCredits}`);
    quote.value = undefined;
  } catch (error) {
    fail(error);
  } finally {
    downloading.value = false;
  }
}
</script>
<template>
  <Upload
    v-if="editable"
    :custom-request="upload"
    :multiple="false"
    :disabled="busy || disabled"
    :show-upload-list="false"
    :accept="
      purpose === 'MODEL'
        ? '.zip,.obj,.fbx,.blend,.glb,.gltf,.max,.skp'
        : '.png,.jpg,.jpeg,.webp,.pdf,.zip'
    "
  >
    <Button :loading="busy" :disabled="disabled">
      {{ purpose === 'MODEL' ? '上传模型' : '上传附件' }}
    </Button>
  </Upload>
  <p v-if="editable" class="my-2 text-xs text-muted-foreground">
    单个文件最大20MiB，最多20个。移除只取消本次关联，不删除服务器文件。
  </p>
  <Alert v-if="loadError" type="warning" :message="loadError">
    <template #action><Button @click="load">重试</Button></template>
  </Alert>
  <List :data-source="files" size="small">
    <template #renderItem="{ item }">
      <List.Item>
        <Space wrap>
          <span>{{ item.name }}（ID {{ item.id }}）</span><Button type="link" :disabled="busy" @click="download(item)">
            {{ item.purpose === 'MODEL' ? '查看下载额度' : '下载' }}
</Button><Button
            v-if="editable"
            type="link"
            :disabled="busy || disabled"
            @click="
              emit(
                'update:modelValue',
                modelValue.filter((id) => id !== item.id),
              )
            "
          >
            移除关联
          </Button>
        </Space>
      </List.Item>
    </template>
  </List>
  <Modal
    :open="!!quote"
    title="确认模型下载"
    :footer="null"
    :closable="!downloading"
    :mask-closable="false"
    @cancel="quote = undefined"
  >
    <template v-if="quote">
      <p>{{ activeFile?.name }}</p>
      <Alert
        class="my-3"
        :type="quote.canDownload ? 'info' : 'warning'"
        :message="labels[quote.status] ?? quote.status"
      />
      <p>
        预计消耗：{{ quote.expectedCredits ?? '未配置' }}；当前余额：{{
          quote.balance
        }}；免费剩余次数：{{ quote.freeRemaining }}
      </p>
      <p>
        免费截止：{{ displayTime(quote.freeUntil) }}；规则来源：{{
          quote.ruleSource
        }}。实际下载时服务端重新校验。
      </p>
      <Table
        class="my-3"
        row-key="id"
        size="small"
        :columns="historyColumns"
        :data-source="history"
        :pagination="{ pageSize: 5 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            {{ displayTime(record.createdAt) }}
          </template>
        </template>
      </Table>
      <Space>
        <Button
          type="primary"
          :disabled="!quote.canDownload"
          :loading="downloading"
          @click="confirmDownload"
        >
          确认下载
</Button><Button :disabled="downloading" @click="quote = undefined">
          取消
        </Button>
      </Space>
    </template>
  </Modal>
</template>
