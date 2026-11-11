<script setup lang="ts">
import { useRouter } from 'vue-router';

import { Button, Result } from 'ant-design-vue';

const router = useRouter();

function goHome() {
  void router.push('/admin/platform/overview/platform-dashboard');
}
</script>

<template>
  <Result
    status="404"
    title="页面不存在"
    sub-title="当前页面可能已被移除，或你没有访问到正确的地址。"
  >
    <template #extra>
      <Button type="primary" @click="goHome">返回后台首页</Button>
    </template>
  </Result>
</template>
