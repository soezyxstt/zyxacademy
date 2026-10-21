"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductV4ReviewForm, type ProductV4AdminReviewContext, type ProductV4AdminReviewInput } from "@/components/admin/product-v4-review-form";

export function PedagogicReviewFixture({ verified }: { verified: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [input, setInput] = useState<ProductV4AdminReviewInput | null>(null);
  const [submitted, setSubmitted] = useState<unknown>(null);
  const [context] = useState<ProductV4AdminReviewContext>({ expectedRevision: "a".repeat(64), policyVersion: "2026.09.1", contentFingerprint: "b".repeat(64), verificationReady: verified, verificationPlanHash: "c".repeat(64), verificationReceiptSignature: verified ? "d".repeat(64) : null, sections: [{ sectionId: "definition", title: "Definisi", semanticHash: "e".repeat(64) }, { sectionId: "example", title: "Contoh", semanticHash: "f".repeat(64) }] });
  return <main data-fixture-ready={ready ? "true" : "false"} className="mx-auto max-w-3xl space-y-4 p-4"><h1 className="font-heading text-h5">Review bundle</h1><ProductV4ReviewForm context={context} onChange={setInput} /><Button disabled={!input?.ready} onClick={() => setSubmitted(input?.request)}>Setujui bundle</Button><output className="sr-only" data-submitted-review={submitted ? JSON.stringify(submitted) : undefined} /></main>;
}
