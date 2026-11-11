import type {
  CatalogBatchAction,
  CatalogBatchRequest,
} from '#/data/catalogBatchApi';
import type { Catalog, Kind } from '#/data/realAdminApi';

import { catalogBatchRepository as repository } from '#/data/catalogBatchApi';

export type CatalogBatchRow = Pick<
  Catalog,
  | 'code'
  | 'displayStatus'
  | 'enabled'
  | 'id'
  | 'kind'
  | 'name'
  | 'reviewStatus'
  | 'version'
>;
export type CatalogBatchCommand = {
  execute: () => Promise<Catalog[]>;
  readonly requestId: string;
};
export const catalogBatchLabels: Record<CatalogBatchAction, string> = {
  SUBMIT: '提交审核',
  ENABLE: '启用',
  DISABLE: '停用',
  PUBLISH: '通过并发布',
  REJECT: '驳回',
  OFFLINE: '下架',
};
function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/.test(value) &&
    (value.length < 19 || value <= '9223372036854775807')
  );
}
export function catalogBatchStateError(
  action: CatalogBatchAction,
  row: CatalogBatchRow,
): string {
  switch (action) {
    case 'DISABLE': {
      return row.enabled === true ? '' : '仅可停用当前启用的资料';
    }
    case 'ENABLE': {
      return row.enabled === false ? '' : '仅可启用当前停用的资料';
    }
    case 'OFFLINE': {
      return row.displayStatus === 'PUBLISHED' ? '' : '仅可下架已发布资料';
    }
    case 'PUBLISH': {
      return row.enabled && row.reviewStatus === 'PENDING'
        ? ''
        : '仅可通过启用且待审核的资料';
    }
    case 'REJECT': {
      return row.reviewStatus === 'PENDING' ? '' : '仅可驳回待审核资料';
    }
    case 'SUBMIT': {
      return row.enabled &&
        (['DRAFT', 'REJECTED'].includes(row.reviewStatus) ||
          row.displayStatus === 'OFFLINE')
        ? ''
        : '仅启用的草稿、已驳回或已下架资料可提交审核';
    }
    default: {
      return '无效批量动作';
    }
  }
}
export const CatalogBatchService = {
  validate(
    kind: Kind,
    action: CatalogBatchAction,
    rows: readonly CatalogBatchRow[],
    reason = '',
  ) {
    if (
      !['BRAND', 'CATEGORY', 'PRODUCT'].includes(kind) ||
      !Object.hasOwn(catalogBatchLabels, action)
    )
      throw new Error('批量类型或动作无效');
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100)
      throw new Error('每批请选择1至100条记录');
    const ids = new Set<string>();
    for (const row of rows) {
      if (
        !validId(row.id) ||
        row.kind !== kind ||
        !Number.isInteger(row.version) ||
        row.version < 0 ||
        row.version > 2_147_483_647
      )
        throw new Error('记录类型、ID或版本无效，请刷新列表');
      if (ids.has(row.id)) throw new Error('批量记录不能重复');
      ids.add(row.id);
      const error = catalogBatchStateError(action, row);
      if (error)
        throw new Error(
          `记录${row.id}（${row.name}）：${error}，本批不会自动跳过`,
        );
    }
    if (typeof reason !== 'string' || reason.trim().length > 1000)
      throw new Error('处理说明最多1000字');
    if ((action === 'REJECT' || action === 'OFFLINE') && !reason.trim())
      throw new Error('驳回或下架必须填写处理原因');
  },
  create(
    kind: Kind,
    action: CatalogBatchAction,
    rows: readonly CatalogBatchRow[],
    reason = '',
  ): CatalogBatchCommand {
    this.validate(kind, action, rows, reason);
    const request: CatalogBatchRequest = {
      requestId: crypto.randomUUID(),
      kind,
      action,
      reason: reason.trim(),
      items: rows.map((row) => ({ id: row.id, version: row.version })),
    };
    let pending: Promise<Catalog[]> | undefined;
    let completed: Catalog[] | undefined;
    return Object.freeze({
      requestId: request.requestId,
      execute() {
        if (completed) return Promise.resolve(completed);
        // Each retry sends the exact captured payload, not mutable table/selection objects.
        pending ??= repository
          .execute({
            ...request,
            items: request.items.map((item) => ({ ...item })),
          })
          .then((value) => {
            const expected = new Set(request.items.map((item) => item.id));
            if (
              !Array.isArray(value) ||
              value.length !== expected.size ||
              !value.every(
                (row) => row && row.kind === kind && expected.delete(row.id),
              )
            )
              throw new Error(
                '批量结果未确认，请先核对记录；仅使用原批次重试，不要重复建立新操作',
              );
            completed = value;
            return value;
          })
          .finally(() => {
            pending = undefined;
          });
        return pending;
      },
    });
  },
};
