import { ItemMaster } from '../types';

/**
 * Resolve the supplier's own item code & name for an item.
 * itemCode / itemName on ItemMaster always represent OUR book / SAP code.
 */
export function resolveSupplierItem(
  item: Pick<ItemMaster, 'supplierMappings'> | undefined | null,
  supplierId: string | undefined
): { supplierItemCode: string; supplierItemName: string } {
  if (!item || !supplierId) return { supplierItemCode: '', supplierItemName: '' };
  const m = (item.supplierMappings || []).find(x => x.supplierId === supplierId);
  return {
    supplierItemCode: m?.supplierItemCode || '',
    supplierItemName: m?.supplierItemName || '',
  };
}
