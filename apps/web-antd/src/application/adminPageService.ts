import type { AdminApiAdapter } from '#/data/adminApiAdapter';

import { localAdminApiAdapter } from '#/data/adminApiAdapter';

export type AdminPageKind = 'config' | 'dashboard' | 'detail' | 'form' | 'list';

export type AdminPageDefinition = {
  group: 'B 端装修后台' | '商家后台' | '平台后台';
  id: string;
  kind: AdminPageKind;
  path: string;
  title: string;
};

let adapter: AdminApiAdapter = localAdminApiAdapter;

export function configureAdminApiAdapter(nextAdapter: AdminApiAdapter) {
  adapter = nextAdapter;
}

export const AdminPageService = {
  async getPage(page: AdminPageDefinition) {
    return { ...page, ...(await adapter.getPage(page)) };
  },
  async execute(pageId: string, action: string) {
    return adapter.execute(pageId, action);
  },
};
