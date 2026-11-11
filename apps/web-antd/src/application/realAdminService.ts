import type {
  Catalog,
  CatalogInput,
  Kind,
  Merchant,
  MerchantInput,
  Sku,
  SkuInput,
} from '#/data/realAdminApi';
import type { SkuSpecificationEdit } from '#/data/skuSpecifications';

import { realAdminRepository } from '#/data/realAdminApi';
import { buildSkuInput } from '#/data/skuSpecifications';

// Shared business actions: no Vue, component, router, or permission-display dependencies.
export const RealAdminService = {
  ...realAdminRepository,
  async catalogChoices(kind: 'BRAND' | 'CATEGORY') {
    const items: Catalog[] = [];
    let page = 1;
    do {
      const result = await realAdminRepository.catalog(
        kind,
        { enabled: true },
        page,
        200,
      );
      items.push(...result.items);
      if (items.length >= Number(result.total) || result.items.length === 0)
        return items;
      page += 1;
    } while (page <= 25);
    throw new Error('可选资料超过5000条，请缩小范围');
  },
  async saveMerchant(content: MerchantInput, old?: Merchant) {
    if (old && content.serviceEnd !== old.content.serviceEnd)
      throw new Error('服务到期日期只能通过服务账单确认调整');
    if (content.serviceStart > content.serviceEnd)
      throw new Error('服务开始日期不能晚于到期日期');
    return realAdminRepository.saveMerchant(content, old);
  },
  saveCatalog(kind: Kind, content: CatalogInput, old?: Catalog) {
    return realAdminRepository.saveItem(kind, content, old);
  },
  saveProductSku(
    product: Catalog,
    content: SkuInput,
    old?: Sku,
    specifications?: SkuSpecificationEdit,
  ) {
    if (old && old.productId !== product.id)
      throw new Error('SKU不属于当前商品');
    if (old && content.stock !== old.stock)
      throw new Error('已有SKU库存请通过库存调整入口修改');
    return realAdminRepository.saveSku(
      product.id,
      buildSkuInput(
        content,
        product.skuSpecificationSchemaVersion,
        specifications,
      ),
      old,
    );
  },
};
