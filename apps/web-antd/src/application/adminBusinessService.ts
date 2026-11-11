import type {
  Bill,
  BillInput,
  CreditDraft,
  CreditInput,
  CreditQuery,
  Designer,
  DesignerInput,
  ExportFile,
  Qr,
  Relation,
  RelationInput,
  Settings,
} from '#/data/adminBusinessApi';

import {
  adminBusinessRepository as api,
  businessId,
} from '#/data/adminBusinessApi';

const phone = (value: string) => {
  if (!/^1[3-9]\d{9}$/.test(value)) throw new Error('请输入有效的11位手机号');
  return value;
};
const text = (value: string, max: number, label: string, required = false) => {
  if ((required && !value.trim()) || value.length > max)
    throw new Error(`${label}${required ? '必填且' : ''}最多${max}字`);
  return value.trim();
};
const version = (value: number) => {
  if (!Number.isInteger(value) || value < 0)
    throw new Error('版本无效，请刷新');
};
const choice = <T extends string>(value: T, values: readonly T[]) => {
  if (!values.includes(value)) throw new Error('选项无效');
  return value;
};
const bool = (value: boolean) => {
  if (typeof value !== 'boolean') throw new Error('开关值无效');
  return value;
};
const optionalId = (value: null | string) => (value ? businessId(value) : null);
function money(value: null | string) {
  if (value !== null && !/^\d{1,16}(\.\d{1,2})?$/.test(value))
    throw new Error('金额须为非负十进制，最多16位整数/2位小数');
  return value;
}
function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error('日期无效');
  return value;
}
function credits(value: string, negative = false) {
  if (
    !(negative ? /^-?\d{1,10}$/ : /^\d{1,10}$/).test(value) ||
    Number(value) > 1_000_000_000 ||
    Number(value) < -1_000_000_000 ||
    Number(value) === 0
  )
    throw new Error('额度须为非零整数，绝对值不超过十亿');
  return value;
}
function creditQuery(value: CreditQuery): CreditQuery {
  const result: CreditQuery = {};
  if (value.accountId) result.accountId = businessId(value.accountId);
  if (value.type)
    result.type = choice<NonNullable<CreditQuery['type']>>(value.type, [
      'RECHARGE',
      'GIFT',
      'ADJUSTMENT',
      'MODEL_DOWNLOAD',
    ]);
  for (const key of ['from', 'to'] as const) {
    const time = value[key];
    if (time) {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(time) ||
        !Number.isFinite(Date.parse(`${time}+08:00`))
      )
        throw new Error('流水时间格式无效');
      date(time.slice(0, 10));
      result[key] = time;
    }
  }
  if (
    result.from &&
    result.to &&
    Date.parse(`${result.from}+08:00`) > Date.parse(`${result.to}+08:00`)
  )
    throw new Error('开始时间不能晚于结束时间');
  return result;
}
export function creditPayload(
  value: CreditInput,
  complete: boolean,
): CreditInput {
  const type =
    value.type === null
      ? null
      : choice(value.type, ['RECHARGE', 'GIFT', 'ADJUSTMENT']);
  if (complete && (!value.accountId || !type || !value.amount))
    throw new Error('请选择账户、操作类型并填写额度');
  return {
    accountId: optionalId(value.accountId),
    type,
    amount: value.amount
      ? credits(value.amount, type === 'ADJUSTMENT' || type === null)
      : null,
    reason: text(value.reason, 1000, '原因', complete && type === 'ADJUSTMENT'),
    voucherFileId: optionalId(value.voucherFileId),
    receivedAmount: money(value.receivedAmount),
  };
}
function creditExport(value: ExportFile) {
  const count = value?.rowCount;
  if (
    !value ||
    typeof value.name !== 'string' ||
    !value.name.toLowerCase().endsWith('.csv') ||
    typeof value.contentType !== 'string' ||
    value.contentType.toLowerCase() !== 'text/csv;charset=utf-8' ||
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 10_000 ||
    typeof value.content !== 'string' ||
    !value.content ||
    value.content.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.content)
  )
    throw new Error('服务返回的CSV文件或条数无效，请保留筛选条件后重试');
  return { ...value, rowCount: count };
}
export const AdminBusinessService = {
  ...api,
  ledger: (query: CreditQuery = {}, page = 1) =>
    api.ledger(creditQuery(query), page),
  exportLedger: (query: CreditQuery) =>
    api.exportLedger(creditQuery(query)).then(creditExport),
  saveDesigner(value: DesignerInput, old?: Designer) {
    if (old) version(old.version);
    const content: DesignerInput = {
      name: text(value.name, 160, '设计师姓名', true),
      loginPhone: phone(value.loginPhone),
      level: choice(value.level, ['NORMAL', 'SENIOR', 'LEAD']),
      avatarFileId: optionalId(value.avatarFileId),
      city: text(value.city, 160, '城市', true),
      styles: text(value.styles, 500, '擅长风格', true),
      phone: phone(value.phone),
      wechatFileId: optionalId(value.wechatFileId),
      introduction: text(value.introduction, 5000, '简介'),
      certificationFileIds: [
        ...new Set(value.certificationFileIds.map(businessId)),
      ],
      status: choice(value.status, ['PENDING', 'COOPERATING', 'DISABLED']),
      cooperatingMerchantId: optionalId(value.cooperatingMerchantId),
    };
    if (content.certificationFileIds.length > 20)
      throw new Error('认证附件最多20个');
    return api.saveDesigner(content, old);
  },
  lookup: (value: string) => api.lookup(phone(value)),
  createPartner: (name: string, value: string) =>
    api.createPartner(text(name, 160, '合作商名称', true), phone(value)),
  updateRelation(old: Relation, value: RelationInput) {
    version(old.version);
    return api.updateRelation(old, {
      enabled: bool(value.enabled),
      partnerPriceVisible: bool(value.partnerPriceVisible),
      modelPermission: bool(value.modelPermission),
      remark: text(value.remark, 1000, '备注'),
    });
  },
  createQr(type: Qr['type'], expiresAt: null | string) {
    choice(type, ['PARTNER', 'DESIGNER']);
    if (
      expiresAt &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(expiresAt) ||
        !Number.isFinite(Date.parse(`${expiresAt}+08:00`)) ||
        Date.parse(`${expiresAt}+08:00`) <= Date.now())
    )
      throw new Error('有效期须为晚于现在的上海时间');
    if (expiresAt) date(expiresAt.slice(0, 10));
    return api.createQr(type, expiresAt);
  },
  saveDraft: (requestId: string, content: CreditInput, old?: CreditDraft) => {
    if (old) {
      version(old.version);
      if (old.status !== 'DRAFT') throw new Error('仅草稿可编辑');
    }
    return api.saveDraft(requestId, creditPayload(content, false), old);
  },
  draftAction(
    old: CreditDraft,
    action: 'cancel' | 'submit',
    requestId: string,
  ) {
    if (old.status !== 'DRAFT') throw new Error('仅草稿可提交或取消');
    version(old.version);
    if (action === 'submit') creditPayload(old.content, true);
    return api.draftAction(old, action, requestId);
  },
  saveBill(requestId: string, value: BillInput, old?: Bill) {
    if (old) {
      version(old.version);
      if (old.status !== 'PENDING') throw new Error('仅待入账记录可编辑');
    }
    const type = choice(value.type, ['SERVICE', 'CREDIT', 'OTHER']);
    const amount = money(value.amount);
    if (amount === null) throw new Error('入账金额必填');
    const creditAmount = type === 'CREDIT' ? credits(value.creditAmount) : '0';
    const content: BillInput = {
      merchantId: businessId(value.merchantId),
      type,
      amount,
      method: choice(value.method, [
        'BANK_TRANSFER',
        'OFFLINE_OTHER',
        'FREE_ADJUSTMENT',
      ]),
      remark: text(value.remark, 1000, '备注', true),
      voucherFileId: optionalId(value.voucherFileId),
      newServiceEnd:
        type === 'SERVICE' ? date(value.newServiceEnd ?? '') : null,
      creditAmount,
    };
    if (content.method === 'FREE_ADJUSTMENT' && /[1-9]/.test(content.amount))
      throw new Error('零元调整金额必须为零');
    return api.saveBill(requestId, content, old);
  },
  billAction(
    old: Bill,
    action: 'CONFIRM' | 'VOID',
    reason: string,
    receivedAt: null | string,
    requestId: string,
  ) {
    if (old.status !== 'PENDING') throw new Error('仅待入账记录可确认或作废');
    version(old.version);
    choice(action, ['CONFIRM', 'VOID']);
    text(reason, 1000, '操作原因', true);
    if (
      action === 'CONFIRM' &&
      (!receivedAt ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(receivedAt) ||
        !Number.isFinite(Date.parse(`${receivedAt}+08:00`)) ||
        Date.parse(`${receivedAt}+08:00`) > Date.now())
    )
      throw new Error('请填写有效且不晚于现在的上海入账时间');
    if (action === 'CONFIRM' && receivedAt) date(receivedAt.slice(0, 10));
    if (action === 'CONFIRM' && /[1-9]/.test(money(old.content.amount) ?? '')) {
      if (!old.content.voucherFileId)
        throw new Error('非零金额账单确认前必须补充有效凭证');
      businessId(old.content.voucherFileId);
    }
    return api.billAction(
      old,
      action,
      reason,
      action === 'CONFIRM' ? receivedAt : null,
      requestId,
    );
  },
  saveSettings(value: Settings) {
    version(value.version);
    if (
      !Number.isInteger(value.expiryReminderDays) ||
      value.expiryReminderDays < 0 ||
      value.expiryReminderDays > 3650
    )
      throw new Error('提醒天数应为0至3650整数');
    return api.saveSettings({
      version: value.version,
      expiryReminderDays: value.expiryReminderDays,
      productReviewRequired: bool(value.productReviewRequired),
      modelNamingInstructions: text(
        value.modelNamingInstructions,
        1000,
        '模型命名说明',
      ),
    });
  },
};
