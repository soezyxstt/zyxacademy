DROP INDEX "review_item_bundle_target_idx";--> statement-breakpoint
DROP INDEX "ketergantungan_produk_edge_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "ketergantungan_produk_edge_idx" ON "ketergantungan_produk" USING btree ("upstream_entity_type","upstream_entity_id","upstream_version","downstream_entity_type","downstream_entity_id","downstream_version");--> statement-breakpoint
ALTER TABLE "review_item_bundle" ADD CONSTRAINT "review_item_bundle_target_scoped_unique" UNIQUE NULLS NOT DISTINCT("impor_bundle_id","reviewer_id","target_type","target_id","product_id");