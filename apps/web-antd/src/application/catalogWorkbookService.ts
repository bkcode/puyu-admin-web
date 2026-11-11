import type {
  WorkbookFile,
  WorkbookFilter,
  WorkbookMode,
  WorkbookRequest,
  WorkbookResult,
} from '#/data/catalogWorkbookApi';

import { catalogWorkbookRepository as repository } from '#/data/catalogWorkbookApi';

export type WorkbookContext =
  | { kind: 'product'; query?: WorkbookFilter }
  | { kind: 'sku'; productId: string; productName: string };
export type WorkbookImportCommand = {
  execute: () => Promise<WorkbookResult>;
  readonly fileName: string;
  readonly mode: WorkbookMode;
  readonly productId: null | string;
  readonly requestId: string;
  readonly size: number;
};
export const workbookModes = [
  { value: 'PRODUCT' as const, label: '商品资料' },
  { value: 'PRODUCT_PRICE' as const, label: '商品价格' },
  { value: 'SKU' as const, label: 'SKU资料' },
  { value: 'SKU_PRICE' as const, label: 'SKU价格' },
];
const contentType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/.test(value) &&
    (value.length < 19 || value <= '9223372036854775807')
  );
}
function request(
  mode: WorkbookMode,
  context: WorkbookContext,
): WorkbookRequest {
  if (!workbookModes.some((option) => option.value === mode))
    throw new Error('请选择有效的Excel类型');
  const sku = mode === 'SKU' || mode === 'SKU_PRICE';
  if (sku !== (context.kind === 'sku'))
    throw new Error(
      'SKU Excel只能从当前商品详情操作，商品Excel只能从商品列表操作',
    );
  if (context.kind === 'sku') {
    if (!validId(context.productId))
      throw new Error('请从有效商品详情进入SKU Excel');
    return { mode, productId: context.productId, query: {} };
  }
  const query: WorkbookFilter = {};
  const keyword = context.query?.keyword;
  if (keyword !== undefined) {
    if (typeof keyword !== 'string') throw new Error('商品搜索条件无效');
    if (keyword.trim()) query.keyword = keyword.trim();
  }
  const review = context.query?.reviewStatus;
  if (review) {
    if (!['APPROVED', 'DRAFT', 'PENDING', 'REJECTED'].includes(review))
      throw new Error('商品审核筛选无效');
    query.reviewStatus = review;
  }
  return { mode, productId: null, query };
}
function download(value: WorkbookFile): WorkbookFile {
  if (
    !value ||
    value.contentType !== contentType ||
    typeof value.name !== 'string' ||
    !value.name.toLowerCase().endsWith('.xlsx') ||
    !Number.isInteger(value.rowCount) ||
    value.rowCount < 0 ||
    value.rowCount > 5000 ||
    typeof value.content !== 'string' ||
    !value.content ||
    value.content.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.content)
  )
    throw new Error('服务返回的Excel文件无效，请重新下载');
  return value;
}
function result(value: WorkbookResult, mode: WorkbookMode): WorkbookResult {
  if (
    !value ||
    !validId(value.batchId) ||
    value.mode !== mode ||
    !Array.isArray(value.createdIds) ||
    !Array.isArray(value.updatedIds) ||
    ![...value.createdIds, ...value.updatedIds].every((id) => validId(id)) ||
    value.createdIds.length + value.updatedIds.length > 200
  )
    throw new Error('导入结果无法确认，请先核对商品记录，不要更换文件重复提交');
  return value;
}
export const CatalogWorkbookService = {
  template: async (mode: WorkbookMode, context: WorkbookContext) =>
    download(await repository.template(request(mode, context))),
  export: async (mode: WorkbookMode, context: WorkbookContext) =>
    download(await repository.export(request(mode, context))),
  createImport(
    mode: WorkbookMode,
    context: WorkbookContext,
    file: File,
  ): WorkbookImportCommand {
    const scope = request(mode, context);
    if (
      !(file instanceof File) ||
      !/\.xlsx$/i.test(file.name) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    )
      throw new Error('请选择1字节至5MiB的.xlsx文件，不支持.xls或.xlsm');
    const requestId = crypto.randomUUID();
    let pending: Promise<WorkbookResult> | undefined;
    let completed: undefined | WorkbookResult;
    // One command owns an immutable File/context. A retry never silently creates a new operation.
    return Object.freeze({
      requestId,
      fileName: file.name,
      size: file.size,
      mode,
      productId: scope.productId,
      execute() {
        if (completed) return Promise.resolve(completed);
        pending ??= repository
          .import(scope, file, requestId)
          .then((value) => {
            completed = result(value, mode);
            return completed;
          })
          .finally(() => {
            pending = undefined;
          });
        return pending;
      },
    });
  },
};
