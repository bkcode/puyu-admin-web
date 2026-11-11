<script setup lang="ts">
import type { UploadProps } from 'ant-design-vue';

import { ref } from 'vue';

import { Button, Upload } from 'ant-design-vue';

import { RealAdminService } from '#/application/realAdminService';
const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    modelValue: string[];
    multiple?: boolean;
  }>(),
  { multiple: false, disabled: false },
);
const emit = defineEmits<{
  busy: [boolean];
  error: [string];
  'update:modelValue': [string[]];
}>();
const pending = ref(0);
const upload: UploadProps['customRequest'] = async (options) => {
  if (props.disabled) {
    options.onError?.(new Error('请等待当前操作完成'));
    return;
  }
  if (++pending.value === 1) emit('busy', true);
  try {
    const file = options.file as File;
    if (
      !['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(
        file.type,
      )
    )
      throw new Error('请选择PNG、JPEG、WebP或GIF图片');
    if (file.size > 20 * 1024 * 1024) throw new Error('图片最大20MiB');
    const result = await RealAdminService.upload(file);
    emit(
      'update:modelValue',
      props.multiple ? [...props.modelValue, result.id] : [result.id],
    );
    options.onSuccess?.(result);
  } catch (error) {
    const exception = error instanceof Error ? error : new Error('上传失败');
    options.onError?.(exception);
    emit('error', exception.message);
  } finally {
    if (--pending.value === 0) emit('busy', false);
  }
};
</script>
<template>
  <Upload
    accept="image/png,image/jpeg,image/webp,image/gif"
    :disabled="disabled || pending > 0"
    :multiple="multiple"
    :custom-request="upload"
    :show-upload-list="{ showRemoveIcon: false }"
  >
    <Button :disabled="disabled" :loading="pending > 0">上传图片</Button>
  </Upload>
  <p v-if="modelValue.length" class="mt-2 text-xs text-muted-foreground">
    已保存图片 {{ modelValue.length }} 张（文件ID：{{ modelValue.join('、') }}）
  </p>
</template>
