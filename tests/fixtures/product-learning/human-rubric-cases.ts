import {
  QUALITY_POLICY_VERSION,
  computePedagogyContentFingerprint,
  type PedagogicReviewDecision,
} from "@/lib/materials/quality-policy";
import { LIMIT_ARTICLE_FIXTURE } from "./limit-epsilon-delta";
import { EIGENVALUES_ARTICLE_FIXTURE } from "./eigenvalues";
import { TCP_HANDSHAKE_ARTICLE_FIXTURE } from "./tcp-handshake";

export const LIMIT_CONTENT_FINGERPRINT = computePedagogyContentFingerprint({
  article: LIMIT_ARTICLE_FIXTURE as unknown as Record<string, unknown>,
});

export const EIGENVALUES_CONTENT_FINGERPRINT = computePedagogyContentFingerprint({
  article: EIGENVALUES_ARTICLE_FIXTURE as unknown as Record<string, unknown>,
});

export const TCP_HANDSHAKE_CONTENT_FINGERPRINT = computePedagogyContentFingerprint({
  article: TCP_HANDSHAKE_ARTICLE_FIXTURE as unknown as Record<string, unknown>,
});

export const LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL: PedagogicReviewDecision = {
  imporBundleId: "bundle-limit-v1",
  reviewerId: "reviewer-human-lead-01",
  policyVersion: QUALITY_POLICY_VERSION,
  contentFingerprint: LIMIT_CONTENT_FINGERPRINT,
  status: "approved",
  notes: "Modul memenuhi seluruh delapan kriteria pedagogi dengan visualisasi interaktif yang koheren secara numerik.",
  exceptions: [],
  criteria: [
    {
      criterionId: "concept_accuracy",
      status: "met",
      contentAnchors: [
        { targetType: "section", targetId: "sec-epsilon-delta" },
        { targetType: "block", targetId: "block-ed-exp-def" },
      ],
      reason: "Definisi formal Cauchy-Weierstrass disajikan dengan tepat tanpa kesalahan logika kuantor.",
    },
    {
      criterionId: "prerequisite_completeness",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-ed-pka" },
      ],
      reason: "Pertidaksamaan nilai mutlak dan konsep jarak riil diaktivasi sebelum formulasi formal.",
    },
    {
      criterionId: "explanation_sequence",
      status: "met",
      contentAnchors: [
        { targetType: "section", targetId: "sec-overview" },
        { targetType: "section", targetId: "sec-epsilon-delta" },
      ],
      reason: "Alur bertransisi logis dari intuisi grafis menuju pembuktian aljabar dan batasan lokal.",
    },
    {
      criterionId: "symbol_and_condition_clarity",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-ed-exp-def" },
        { targetType: "block", targetId: "block-ed-exp-dep" },
      ],
      reason: "Simbol epsilon dan delta didefinisikan dengan domain riil positif serta syarat 0 < |x - c|.",
    },
    {
      criterionId: "example_reasoning",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-ed-example" },
      ],
      reason: "Contoh terpandu memisahkan analisis pendahuluan dari penulisan formal bukti dengan alasan tiap langkah.",
    },
    {
      criterionId: "representation_or_visual",
      status: "met",
      contentAnchors: [
        { targetType: "visual", targetId: "visual-limit-linear-2x-plus-1" },
      ],
      reason: "Spesifikasi visual memiliki titik limit dan delta epsilon yang konsisten secara numerik dengan fungsi linier.",
    },
    {
      criterionId: "misconceptions_and_limits",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-ed-misconception" },
      ],
      reason: "Miskonsepsi ketergantungan urutan kuantor dan nilai fungsi pada x = c diantisipasi dengan tegas.",
    },
    {
      criterionId: "formative_check_and_explanation",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-ed-chk-mcq" },
        { targetType: "block", targetId: "block-ed-chk-short" },
        { targetType: "block", targetId: "block-sum-close" },
      ],
      reason: "Tiga pengecekan formatif menguji pemahaman konseptual, perhitungan nilai delta, dan definisi titik limit.",
    },
  ],
};

export const EIGENVALUES_HUMAN_REVIEW_CONDITIONAL: PedagogicReviewDecision = {
  imporBundleId: "bundle-eigen-v1",
  reviewerId: "reviewer-human-senior-02",
  policyVersion: QUALITY_POLICY_VERSION,
  contentFingerprint: EIGENVALUES_CONTENT_FINGERPRINT,
  status: "approved",
  notes: "Disetujui dengan dispensasi terdokumentasi untuk visualisasi grafis karena fokus topik aljabar reduksi.",
  exceptions: [
    {
      criterionId: "representation_or_visual",
      approved: true,
      reason: "Modul fokus murni pada algoritma reduksi baris determinan n-dimensi. Representasi geometris 2D dipelajari pada bab pengantar terpisah.",
    },
  ],
  criteria: [
    {
      criterionId: "concept_accuracy",
      status: "met",
      contentAnchors: [
        { targetType: "section", targetId: "sec-eigen-procedure" },
        { targetType: "block", targetId: "block-eig-exp-char" },
      ],
      reason: "Definisi persamaan karakteristik det(A - lambda I) = 0 dan vektor tak-nol dijabarkan tepat.",
    },
    {
      criterionId: "prerequisite_completeness",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-eig-pka-det" },
      ],
      reason: "Kebutuhan determinan singular untuk sistem homogen dijelaskan di awal prosedur.",
    },
    {
      criterionId: "explanation_sequence",
      status: "met",
      contentAnchors: [
        { targetType: "section", targetId: "sec-eigen-overview" },
        { targetType: "section", targetId: "sec-eigen-procedure" },
      ],
      reason: "Urutan dari motivasi geometris menuju pencarian skalar lambda dan reduksi ruang nol terstruktur baik.",
    },
    {
      criterionId: "symbol_and_condition_clarity",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-eig-exp-char" },
      ],
      reason: "Simbol skalar lambda dan matriks identitas I dijelaskan dengan kondisi skalar dan dimensi matriks.",
    },
    {
      criterionId: "example_reasoning",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-eig-example" },
      ],
      reason: "Contoh terpandu matriks 2x2 menunjukkan faktorisasi polinomial karakteristik dan penentuan ruang eigen.",
    },
    {
      criterionId: "representation_or_visual",
      status: "needs_revision",
      contentAnchors: [
        { targetType: "section", targetId: "sec-eigen-procedure" },
      ],
      reason: "Tidak menyertakan grafik numerik, namun digantikan matriks terstruktur dan penjelasan tekstual.",
    },
    {
      criterionId: "misconceptions_and_limits",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-eig-misconception" },
      ],
      reason: "Menegaskan bahwa nilai eigen boleh nol tetapi vektor eigen tidak pernah boleh vektor nol.",
    },
    {
      criterionId: "formative_check_and_explanation",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-eig-chk-mcq" },
        { targetType: "block", targetId: "block-eig-chk-short" },
        { targetType: "block", targetId: "block-eig-close" },
      ],
      reason: "Tiga butir pengecekan formatif memverifikasi pemahaman nilai eigen nol, perkalian matriks, dan pembentukan basis.",
    },
  ],
};

export const TCP_HANDSHAKE_HUMAN_REVIEW_REJECTED: PedagogicReviewDecision = {
  imporBundleId: "bundle-tcp-v1",
  reviewerId: "reviewer-human-auditor-03",
  policyVersion: QUALITY_POLICY_VERSION,
  contentFingerprint: TCP_HANDSHAKE_CONTENT_FINGERPRINT,
  status: "rejected",
  notes: "Modul ditolak karena penanganan segmentasi basi belum memadai dan pengecekan formatif belum lengkap.",
  exceptions: [],
  criteria: [
    {
      criterionId: "concept_accuracy",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-tcp-exp-sequence" },
      ],
      reason: "Urutan SYN, SYN-ACK, ACK dipaparkan sesuai RFC 793.",
    },
    {
      criterionId: "prerequisite_completeness",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-tcp-pka-flags" },
      ],
      reason: "Struktur header dan flag kontrol dipaparkan sebagai prasyarat.",
    },
    {
      criterionId: "explanation_sequence",
      status: "met",
      contentAnchors: [
        { targetType: "section", targetId: "sec-tcp-handshake-steps" },
      ],
      reason: "Alur pertukaran tiga arah runtut.",
    },
    {
      criterionId: "symbol_and_condition_clarity",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-tcp-exp-sequence" },
      ],
      reason: "Simbol ISN dan bit ACK dijelaskan maknanya.",
    },
    {
      criterionId: "example_reasoning",
      status: "met",
      contentAnchors: [
        { targetType: "block", targetId: "block-tcp-example" },
      ],
      reason: "Penelusuran langkah disertai nomor urut konkret.",
    },
    {
      criterionId: "representation_or_visual",
      status: "met",
      contentAnchors: [
        { targetType: "section", targetId: "sec-tcp-handshake-steps" },
      ],
      reason: "Diagram sekuensial teks memadai untuk materi protokol komunikasi.",
    },
    {
      criterionId: "misconceptions_and_limits",
      status: "not_met",
      contentAnchors: [
        { targetType: "block", targetId: "block-tcp-misconception" },
      ],
      reason: "Penjelasan simulasi serangan koneksi setengah terbuka (half-open) belum mencakup mekanisme SYN cookies.",
    },
    {
      criterionId: "formative_check_and_explanation",
      status: "needs_revision",
      contentAnchors: [
        { targetType: "block", targetId: "block-tcp-chk-mcq" },
      ],
      reason: "Pengecekan formatif baru mencakup pilihan ganda, belum ada pengecekan respon terbuka yang lengkap.",
    },
  ],
};

export const INVALID_HUMAN_REVIEW_MISSING_CRITERION: PedagogicReviewDecision = {
  imporBundleId: "bundle-invalid-01",
  reviewerId: "reviewer-human-01",
  policyVersion: QUALITY_POLICY_VERSION,
  contentFingerprint: LIMIT_CONTENT_FINGERPRINT,
  status: "approved",
  exceptions: [],
  criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria.slice(0, 7),
};

export const INVALID_HUMAN_REVIEW_DUPLICATE_CRITERION: PedagogicReviewDecision = {
  imporBundleId: "bundle-invalid-02",
  reviewerId: "reviewer-human-01",
  policyVersion: QUALITY_POLICY_VERSION,
  contentFingerprint: LIMIT_CONTENT_FINGERPRINT,
  status: "approved",
  exceptions: [],
  criteria: [
    ...LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria,
    {
      criterionId: "concept_accuracy",
      status: "met",
      contentAnchors: [{ targetType: "section", targetId: "sec-epsilon-delta" }],
      reason: "Duplikat penilaian",
    },
  ],
};

export const INVALID_HUMAN_REVIEW_DUPLICATE_EXCEPTION: PedagogicReviewDecision = {
  ...EIGENVALUES_HUMAN_REVIEW_CONDITIONAL,
  exceptions: [
    {
      criterionId: "representation_or_visual",
      approved: true,
      reason: "Dispensasi pertama",
    },
    {
      criterionId: "representation_or_visual",
      approved: true,
      reason: "Dispensasi duplikat",
    },
  ],
};

export const INVALID_HUMAN_REVIEW_EXCEPTION_FOR_MET: PedagogicReviewDecision = {
  ...LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL,
  exceptions: [
    {
      criterionId: "concept_accuracy",
      approved: true,
      reason: "Dispensasi tidak perlu karena sudah met",
    },
  ],
};

export const INVALID_HUMAN_REVIEW_APPROVED_WITHOUT_EXCEPTION: PedagogicReviewDecision = {
  ...TCP_HANDSHAKE_HUMAN_REVIEW_REJECTED,
  status: "approved",
  exceptions: [],
};
