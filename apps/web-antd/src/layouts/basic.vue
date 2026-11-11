<script lang="ts" setup>
import type { NotificationItem } from '@vben/layouts';

import type { AdminRole } from '#/router/routes/modules/puyu-admin';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { useWatermark } from '@vben/hooks';
import {
  BasicLayout,
  LockScreen,
  Notification,
  UserDropdown,
} from '@vben/layouts';
import { preferences, usePreferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import { isRealAdmin } from '#/data/realAdminApi';
import { permission } from '#/infrastructure/permission/permission';
import { getAdminMenusByRole } from '#/router/routes/modules/puyu-admin';
import { useAuthStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const accessStore = useAccessStore();
const { destroyWatermark, updateWatermark } = useWatermark();
const { isDark } = usePreferences();
function resolveInitialRole(): AdminRole {
  if (isRealAdmin)
    return permission.canManageMerchants() ? 'platform' : 'merchant';
  return route.path.includes('/merchant/') ? 'merchant' : 'platform';
}

const selectedRole = ref<AdminRole>(resolveInitialRole());

const notifications = ref<NotificationItem[]>([
  {
    avatar: '',
    id: 1,
    date: '刚刚',
    isRead: false,
    message: '有 3 个商家商品等待平台审核',
    title: '商品审核待处理',
  },
  {
    avatar: '',
    id: 2,
    date: '10 分钟前',
    isRead: false,
    message: '工单 WO-20260829-001 已上传模型文件',
    title: '模型交付待确认',
  },
  {
    avatar: '',
    id: 3,
    date: '今天 09:30',
    isRead: false,
    message: '商户 M-1002 的入驻资料需要补充',
    title: '商户资料待完善',
  },
]);
const showDot = computed(
  () => !isRealAdmin && notifications.value.some((item) => !item.isRead),
);
const menus = computed(() => []);
const avatar = computed(
  () => userStore.userInfo?.avatar ?? preferences.app.defaultAvatar,
);

async function handleLogout() {
  await authStore.logout(false);
}
function handleNoticeClear() {
  notifications.value = [];
}
function markRead(id: number | string) {
  const item = notifications.value.find((entry) => entry.id === id);
  if (item) item.isRead = true;
}
function remove(id: number | string) {
  notifications.value = notifications.value.filter((entry) => entry.id !== id);
}
function handleMakeAll() {
  notifications.value.forEach((item) => (item.isRead = true));
}

function switchRole(role: AdminRole) {
  if (isRealAdmin) return;
  selectedRole.value = role;
  void router.push(
    role === 'platform'
      ? '/admin/platform/overview/platform-dashboard'
      : '/admin/merchant/catalog/product-list',
  );
}

watch(
  selectedRole,
  (role) => {
    accessStore.setAccessMenus(getAdminMenusByRole(role));
  },
  { immediate: true },
);

watch(
  () => route.path,
  (path) => {
    if (isRealAdmin) return;
    const role: AdminRole = path.includes('/merchant/')
      ? 'merchant'
      : 'platform';
    if (selectedRole.value !== role) selectedRole.value = role;
  },
);

watch(
  () => ({
    enable: preferences.app.watermark,
    content: preferences.app.watermarkContent,
    isDark: isDark.value,
  }),
  async ({ enable, content, isDark: isDarkValue }) => {
    if (enable) {
      const watermarkColor = isDarkValue
        ? 'rgba(255, 255, 255, 0.12)'
        : 'rgba(0, 0, 0, 0.12)';
      await updateWatermark({
        advancedStyle: {
          colorStops: [
            { color: watermarkColor, offset: 0 },
            { color: watermarkColor, offset: 1 },
          ],
          type: 'linear',
        },
        content: content || userStore.userInfo?.username || '琢玉壹方后台',
      });
    } else destroyWatermark();
  },
  { immediate: true },
);
</script>

<template>
  <BasicLayout
    :avatar
    logo-src="/puyu-logo-icon.png"
    logo-src-dark="/puyu-logo-icon.png"
    logo-text="琢玉壹方后台"
    :text="userStore.userInfo?.realName || '平台运营'"
    @clear-preferences-and-logout="handleLogout"
    @logout="handleLogout"
  >
    <template #logo-text>琢玉壹方后台</template>
    <template #header-right-1>
      <div class="role-switcher" aria-label="后台角色切换">
        <template v-if="isRealAdmin">
          <span>{{
            selectedRole === 'platform' ? '平台后台' : '商户后台'
          }}</span>
          <button type="button" @click="handleLogout">退出并切换账号</button>
        </template>
        <button
          v-if="!isRealAdmin"
          :class="{ active: selectedRole === 'platform' }"
          type="button"
          @click="switchRole('platform')"
        >
          平台后台
        </button>
        <button
          v-if="!isRealAdmin"
          :class="{ active: selectedRole === 'merchant' }"
          type="button"
          @click="switchRole('merchant')"
        >
          商户后台
        </button>
      </div>
    </template>
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :menus
        :text="userStore.userInfo?.realName || '平台运营'"
        description="琢玉壹方后台账号"
        tag-text="后台"
        @clear-preferences-and-logout="handleLogout"
        @logout="handleLogout"
      />
    </template>
    <template #notification>
      <Notification
        :dot="showDot"
        :notifications="isRealAdmin ? [] : notifications"
        @clear="handleNoticeClear"
        @make-all="handleMakeAll"
        @read="(item) => item.id && markRead(item.id)"
        @remove="(item) => item.id && remove(item.id)"
        @view-all="() => undefined"
      />
    </template>
    <template #extra>
      <AuthenticationLoginExpiredModal
        v-model:open="accessStore.loginExpired"
        :avatar
      >
        <LoginForm />
      </AuthenticationLoginExpiredModal>
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
</template>

<style scoped>
.role-switcher {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  padding: 3px;
  margin-right: 8px;
  background: #f1f5f9;
  border-radius: 8px;
}

.role-switcher button {
  padding: 5px 10px;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.role-switcher button:hover {
  color: #0f766e;
}

.role-switcher button.active {
  font-weight: 600;
  color: #0f766e;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 12%);
}
</style>
