<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { PublicImageService } from '#/application/publicImageService';
import {
  publicImagePreview,
  validatePublicImageFile,
} from '#/data/publicImageUploadApi';
import { captureAdminSession } from '#/data/realAdminApi';

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    legacyCount?: number;
    max?: number;
    modelValue: string[];
    replace?: boolean;
    scope: number | string;
  }>(),
  { disabled: false, legacyCount: 0, max: 20, replace: false },
);
const emit = defineEmits<{
  busy: [boolean];
  error: [string];
  'update:modelValue': [string[]];
}>();
const pending = ref(0);
let generation = 0;
let draft = [...props.modelValue];
const full = computed(
  () =>
    !props.replace && props.modelValue.length + props.legacyCount >= props.max,
);
function invalidate() {
  generation += 1;
  pending.value = 0;
  draft = [...props.modelValue];
  emit('busy', false);
}
watch(() => props.scope, invalidate, { flush: 'sync' });
watch(
  () => props.modelValue,
  (value) => {
    draft = [...value];
  },
  { deep: true, flush: 'sync' },
);
onBeforeUnmount(() => {
  generation += 1;
});
async function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (props.disabled || pending.value || files.length === 0) return;
  const version = generation;
  const session = captureAdminSession();
  const active = () => version === generation && session();
  const available = props.replace
    ? 1
    : Math.max(0, props.max - props.legacyCount - draft.length);
  if (files.length > available) {
    emit('error', `图片合计最多${props.max}张（含原有文件）`);
    return;
  }
  try {
    files.forEach((file) => validatePublicImageFile(file));
  } catch (error) {
    emit('error', (error as Error).message);
    return;
  }
  pending.value = files.length;
  emit('busy', true);
  // Reserve the entire selection before I/O. Serial requests preserve selection order.
  for (const file of files) {
    if (!active()) break;
    try {
      const result = await PublicImageService.upload(file);
      if (!active()) break;
      if (!props.disabled) {
        if (props.replace) draft = [result.url];
        else if (!draft.includes(result.url)) draft = [...draft, result.url];
        emit('update:modelValue', [...draft]);
      }
    } catch (error) {
      if (active())
        emit('error', error instanceof Error ? error.message : '图片上传失败');
    } finally {
      if (version === generation) pending.value -= 1;
    }
  }
  if (version === generation) {
    pending.value = 0;
    emit('busy', false);
  }
}
function remove(index: number) {
  if (props.disabled || pending.value) return;
  draft = draft.filter((_, at) => at !== index);
  emit('update:modelValue', [...draft]);
}
</script>
<template>
  <div class="public-image-upload">
    <label>
      {{ replace && modelValue.length ? '替换公开图片' : '选择公开图片' }}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :multiple="!replace && max > 1"
        :disabled="disabled || pending > 0 || full"
        @change="choose"
      />
    </label>
    <p class="mt-2 text-xs text-muted-foreground">
      PNG、JPEG或WebP，1字节到20MiB。上传后需保存业务资料。
      <span v-if="pending" role="status">正在上传，请稍候…</span>
      <span v-if="legacyCount">另有原图片文件 {{ legacyCount }} 张，继续保留。</span>
    </p>
    <ul class="mt-2 flex flex-wrap gap-3">
      <li v-for="(url, index) in modelValue" :key="`${index}:${url}`">
        <img
          v-if="publicImagePreview(url)"
          :src="publicImagePreview(url)"
          alt="公开图片"
          class="h-24 w-24 object-contain"
        />
        <span v-else>原有图片地址（继续保留）</span>
        <button
          type="button"
          :disabled="disabled || pending > 0"
          @click="remove(index)"
        >
          移除公开图片
        </button>
      </li>
    </ul>
  </div>
</template>
