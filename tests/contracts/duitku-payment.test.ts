import { describe, expect, it } from "bun:test";
import { createDuitkuSignature, verifyDuitkuCallbackSignature } from "@/lib/payments/duitku";
import { createPlanQuote } from "@/lib/payments/catalog";
import { calculatePlanPrice } from "@/lib/pricing-constants";

describe("Duitku payment contract", () => {
  it("recomputes a valid plan price on the server", () => {
    const quote = createPlanQuote({
      planKey: "essential",
      persons: 3,
      standardCourses: ["Matematika I", "Fisika I"],
      otherCoursesCount: 1,
    });

    expect(quote.amount).toBe(calculatePlanPrice("essential", 3, 3));
    expect(quote.selectedCourses).toEqual(["Matematika I", "Fisika I", "Mata Kuliah Lain-Lain 1"]);
    expect(quote.productDescription).toContain("Paket Essential Zyx Academy");
  });

  it("rejects duplicate or unknown course selections", () => {
    expect(() => createPlanQuote({
      planKey: "minimal",
      persons: 2,
      standardCourses: ["Matematika I", "Matematika I"],
      otherCoursesCount: 0,
    })).toThrow();
    expect(() => createPlanQuote({
      planKey: "minimal",
      persons: 2,
      standardCourses: ["Mata Kuliah Tidak Terdaftar"],
      otherCoursesCount: 0,
    })).toThrow();
  });

  it("accepts only a matching HMAC SHA-256 callback", () => {
    const apiKey = "sandbox-secret";
    const callback = { merchantCode: "DS1234", amount: "150000", merchantOrderId: "Zyx-123-order" };
    const signature = createDuitkuSignature(`${callback.merchantCode}${callback.amount}${callback.merchantOrderId}`, apiKey);

    expect(verifyDuitkuCallbackSignature({ ...callback, signature, apiKey })).toBe(true);
    expect(verifyDuitkuCallbackSignature({ ...callback, amount: "150001", signature, apiKey })).toBe(false);
    expect(verifyDuitkuCallbackSignature({ ...callback, signature: "invalid", apiKey })).toBe(false);
  });
});
