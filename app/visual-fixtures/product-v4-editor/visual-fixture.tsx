"use client";

import { ProductDraftEditor } from "@/components/admin/product-draft-editor";
import type { ProductEntity } from "@/lib/bundle/product-validator";

export function ProductV4EditorFixture({ products }: { products: ProductEntity[] }) {
  return <main id="main-content" className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">{products.map((product, index) => <ProductDraftEditor key={product.id} product={product} index={index} onChange={() => { throw new Error("Read-only V4 editor attempted a mutation"); }} />)}</main>;
}
