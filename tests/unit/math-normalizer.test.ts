import { describe, it, expect } from "bun:test";
import katex from "katex";
import { normalizeMathInText } from "@/lib/math/math-normalizer";

describe("normalizeMathInText", () => {
  it("normalizes quadratic equation formula and roots", () => {
    const input = "Akar polinom kuadrat dapat dihitung dengan rumus x=(-b plus atau minus akar D)/(2a).";
    const normalized = normalizeMathInText(input);
    expect(normalized).toContain("\\frac{-b \\pm \\sqrt{D}}{2a}");
    expect(() => {
      const math = normalized.match(/\$([^$]+)\$/g) || [];
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("normalizes square root, inequalities, and exponents in statement", () => {
    const input = "Akar kuadrat sqrt(x) untuk x >= 0 adalah bilangan tak negatif a yang memenuhi a^2=x, sedangkan penyelesaian x^2=b adalah x=plus atau minus sqrt(b).";
    const normalized = normalizeMathInText(input);
    expect(normalized).toContain("\\sqrt{x}");
    expect(normalized).toContain("x \\ge 0");
    expect(normalized).toContain("a^2 = x");
    expect(normalized).toContain("x^2 = b");
    expect(normalized).toContain("\\pm\\sqrt{b}");
    expect(() => {
      const math = normalized.match(/\$([^$]+)\$/g) || [];
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("normalizes angle, theta, and radians conversion", () => {
    const input = "Besar sudut theta dalam radian didefinisikan sebagai rasio panjang busur s terhadap jari-jari r (theta = s/r), dengan hubungan kesetaraan 2 pi radian = 360 derajat (pi rad = 180 derajat).";
    const normalized = normalizeMathInText(input);
    expect(normalized).toContain("\\theta");
    expect(normalized).toContain("\\theta = \\frac{s}{r}");
    expect(normalized).toContain("2\\pi\\text{ rad} = 360^\\circ");
    expect(() => {
      const math = normalized.match(/\$([^$]+)\$/g) || [];
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("normalizes circle equation with center (p,q)", () => {
    const input = "Prasyarat: Lingkaran adalah himpunan titik-titik pada bidang yang berjarak tetap r > 0 terhadap pusat (p,q), dengan persamaan baku (x - p)^2 + (y - q)^2 = r^2 (dan x^2 + y^2 = r^2 untuk pusat (0,0)).";
    const normalized = normalizeMathInText(input);
    expect(normalized).toContain("r > 0");
    expect(normalized).toContain("(p,q)");
    expect(normalized).toContain("(x - p)^2 + (y - q)^2 = r^2");
    expect(normalized).toContain("x^2 + y^2 = r^2");
    expect(normalized).toContain("(0,0)");
    expect(() => {
      const math = normalized.match(/\$([^$]+)\$/g) || [];
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("normalizes discriminant, absolute value, and trigonometric identities", () => {
    const statements = [
      "Diskriminan D = b^2 - 4ac menentukan banyaknya akar real polinom kuadrat ax^2 + bx + c.",
      "Harga mutlak bilangan real x didefinisikan secara aljabar sebagai |x| = x untuk x >= 0 dan |x| = -x untuk x < 0.",
      "Untuk setiap sudut theta berlaku identitas Pythagoras pokok sin^2(theta) + cos^2(theta) = 1.",
      "Grafik f(x) = 1/x simetris terhadap titik asal dan g(x) = 1/x^2 simetris terhadap sumbu-y.",
      "Fungsi berpangkat rasional memiliki daerah asal yang bergantung pada penyebut pangkat: x^(1/2) memerlukan x >= 0."
    ];

    for (const stmt of statements) {
      const normalized = normalizeMathInText(stmt);
      const math = normalized.match(/\$([^$]+)\$/g) || [];
      expect(math.length).toBeGreaterThan(0);
      expect(() => {
        for (const m of math) {
          katex.renderToString(m.slice(1, -1), { throwOnError: true });
        }
      }).not.toThrow();
    }
  });

  it("leaves plain text without math untouched", () => {
    const input = "Bilangan irasional adalah bilangan real yang bukan bilangan rasional.";
    const normalized = normalizeMathInText(input);
    expect(normalized).toBe(input);
  });

  it("preserves already delimited math correctly without double wrapping", () => {
    const input = "Hitung $\\int_0^1 2x\\,dx$ untuk $x \\ge 0$.";
    const normalized = normalizeMathInText(input);
    expect(normalized).toBe("Hitung $\\int_0^1 2x\\,dx$ untuk $x \\ge 0$.");
  });
});
