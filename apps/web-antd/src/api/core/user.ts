import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';
import { isRealAdmin, realAdminRepository } from '#/data/realAdminApi';

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  if (isRealAdmin) {
    const actor = await realAdminRepository.actor();
    const platform = actor.role === 'PLATFORM';
    const merchant =
      !platform && actor.merchantId
        ? await realAdminRepository.merchant(actor.merchantId)
        : null;
    return {
      userId: actor.userId,
      username: merchant?.content.loginPhone ?? `platform-${actor.userId}`,
      realName: merchant?.content.name ?? '平台管理员',
      avatar: '/puyu-logo-icon.png',
      desc: platform ? '平台后台' : '商户后台',
      roles: [platform ? 'platform' : 'merchant'],
      token: '',
      homePath: platform
        ? '/admin/platform/overview/platform-dashboard'
        : '/admin/merchant/overview/merchant-dashboard',
    } as UserInfo;
  }
  return requestClient.get<UserInfo>('/user/info');
}
