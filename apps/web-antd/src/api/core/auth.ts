import { baseRequestClient, requestClient } from '#/api/request';
import { PermissionDataService } from '#/data/permissionDataService';
import { isRealAdmin, realAuthApi } from '#/data/realAdminApi';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
  }

  export interface RefreshTokenResult {
    data: string;
    status: number;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  if (isRealAdmin)
    return realAuthApi.login(data.username ?? '', data.password ?? '');
  return requestClient.post<AuthApi.LoginResult>('/auth/login', data);
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  if (isRealAdmin) return realAuthApi.refresh();
  return baseRequestClient.post<AuthApi.RefreshTokenResult>(
    '/auth/refresh',
    undefined,
    {
      withCredentials: true,
    },
  );
}

/**
 * 退出登录
 */
export async function logoutApi() {
  if (isRealAdmin) return realAuthApi.logout();
  return baseRequestClient.post('/auth/logout', undefined, {
    withCredentials: true,
  });
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  if (isRealAdmin) {
    const permissions =
      await PermissionDataService.refreshCurrentUserPermissions();
    return permissions.menuKeys;
  }
  return requestClient.get<string[]>('/auth/codes');
}
