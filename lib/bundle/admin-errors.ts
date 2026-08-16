const explanations: Record<string, string> = {
  IDEA_BUNDLE_FILE_REQUIRED: "Pilih file ZIP Idea Bundle terlebih dahulu.",
  PRODUCT_BUNDLE_FILE_REQUIRED: "Pilih file ZIP Product Bundle terlebih dahulu.",
  IDEA_BUNDLE_FILE_LIMIT: "Ukuran ZIP Idea Bundle melewati batas 32 MiB.",
  PRODUCT_BUNDLE_FILE_LIMIT: "Ukuran ZIP Product Bundle melewati batas 32 MiB.",
  BUNDLE_INVALID_MANIFEST: "Manifest bundle tidak mengikuti format yang diwajibkan.",
  BUNDLE_CHECKSUM_MISMATCH: "Isi ZIP berubah dan tidak cocok dengan checksum manifest.",
  PRODUCT_BUNDLE_CHECKSUM_MISMATCH: "Isi Product Bundle tidak cocok dengan checksum manifest.",
  R2_DOWNLOAD_FAILED: "Artifact belum dapat dibaca dari penyimpanan R2. Coba lagi atau periksa konfigurasi artifact.",
  BUNDLE_MISSING_SOURCE: "Ada Idea yang tidak memiliki sumber atau bukti yang diwajibkan.",
  BUNDLE_INVALID_SPAN: "Potongan bukti tidak cocok dengan posisi teks pada sumber.",
  BUNDLE_PREREQUISITE_CYCLE: "Relasi prerequisite membentuk putaran. Ubah arah atau jenis relasinya.",
  PRODUCT_ARTICLE_QUALITY_FAILED: "Struktur Artikel belum memenuhi blok pembelajaran yang diwajibkan.",
  PRODUCT_IDEA_WEIGHT_SUM_INVALID: "Bobot relasi Idea pada satu produk harus berjumlah tepat 1.",
  PRODUCT_QUESTION_GRADING_INVALID: "Penandaan jawaban benar pada soal belum valid.",
  PRODUCT_QUESTION_MULTI_IDEA_HOT_REQUIRED: "Soal dengan beberapa Idea harus memakai level analyze, evaluate, atau create.",
  PRODUCT_QUESTION_RELATION_INCOMPLETE: "Setiap Idea pada soal multi-Idea harus memiliki keterangan relasi.",
  PRODUCT_DIKTAT_LINEAGE_HASH_MISMATCH: "Diktat tidak lagi cocok dengan Artikel sumbernya.",
  IDEA_DRAFT_IDENTITY_CHANGED: "Identitas Idea tidak boleh diganti dari editor.",
  IDEA_DRAFT_PROVENANCE_CHANGED: "Identitas bukti sumber tidak boleh diganti dari editor.",
  IDEA_DRAFT_RELATION_CHANGED: "Pasangan relasi Idea tidak boleh diganti dari editor.",
  PRODUCT_DRAFT_IDENTITY_CHANGED: "Identitas Product tidak boleh diganti dari editor.",
  PRODUCT_DRAFT_IDEA_LINK_CHANGED: "Idea yang ditautkan tidak boleh diganti dari editor ini.",
};

export function explainBundleError(value: string): string {
  const codes = value.split(/[,\s:]+/).filter(Boolean);
  const messages = [...new Set(codes.map((code) => explanations[code]).filter(Boolean))];
  return messages.length > 0 ? messages.join(" ") : value;
}
