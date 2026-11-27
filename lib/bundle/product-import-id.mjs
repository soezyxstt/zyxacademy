// Shared by the MCP contract and the plain-Node local operator launchers.
export const PRODUCT_V4_IMPORT_ID_PATTERN = "^impor-product-(?:[a-f0-9]{32}|revision-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$(?![\\s\\S])";
const productImportId = new RegExp(PRODUCT_V4_IMPORT_ID_PATTERN);

/** @param {unknown} value */
export function isProductImportId(value) {
  return typeof value === "string" && productImportId.test(value);
}
