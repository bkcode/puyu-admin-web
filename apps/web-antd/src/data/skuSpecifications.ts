import type {
  SkuInput,
  SkuSpecification,
  SkuSpecificationStatus,
} from './realAdminApi';

export type SkuSpecificationEdit = {
  confirmed: boolean;
  dirty: boolean;
  rows: SkuSpecification[];
};

export const skuSpecificationLabels: Record<SkuSpecificationStatus, string> = {
  LEGACY: '未维护维度',
  VERIFIED: '已核对',
  REVIEW_REQUIRED: '待复核',
};

export function validateSkuSpecifications(
  rows: SkuSpecification[],
): SkuSpecification[] {
  if (rows.length > 6) throw new Error('规格维度最多6组');
  const names = new Set<string>();
  return rows.map((row, index) => {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name || !value)
      throw new Error(`第${index + 1}组规格名称和值不能为空；不需要的行请删除`);
    if (name.length > 40 || value.length > 80)
      throw new Error(`第${index + 1}组规格名称最多40字、值最多80字`);
    const nameKey = name.normalize('NFKC').trim().toLowerCase();
    if (names.has(nameKey)) throw new Error('规格维度名称不能重复');
    names.add(nameKey);
    return { name, value };
  });
}

// Whitelist request fields: never send identity, version or read-only review status.
export function serializeSkuInput(input: SkuInput): SkuInput {
  return {
    code: input.code,
    spec: input.spec,
    price: input.price,
    stock: input.stock,
    partnerPrice: input.partnerPrice === '' ? null : input.partnerPrice,
    wholesalePrice: input.wholesalePrice === '' ? null : input.wholesalePrice,
    costPrice: input.costPrice === '' ? null : input.costPrice,
    enabled: input.enabled,
    ...(input.specifications === undefined
      ? {}
      : {
          specifications:
            input.specifications === null
              ? null
              : validateSkuSpecifications(input.specifications),
        }),
  };
}

export function buildSkuInput(
  input: SkuInput,
  schemaVersion?: null | number,
  edit?: SkuSpecificationEdit,
): SkuInput {
  // Read DTOs may contain dimensions: opening a form or editing price is not confirmation.
  const { specifications: _ignored, ...base } = input;
  const explicit =
    schemaVersion === 1 && edit && (edit.dirty || edit.confirmed);
  return serializeSkuInput({
    ...base,
    ...(explicit ? { specifications: edit.rows } : {}),
  });
}
