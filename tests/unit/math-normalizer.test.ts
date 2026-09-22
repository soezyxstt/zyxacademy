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

  it("normalizes calculus limits, formal definitions, and rational functions", () => {
    const statements = [
      "Nilai limit \\lim_{x\\to c} f(x) dan nilai fungsi f(c) adalah dua besaran yang sepenuhnya independen.",
      "Limit dua sisi \\lim_{x\\to c} f(x) = L ada jika dan hanya jika limit kiri dan limit kanan keduanya ada dan sama.",
      "Titik berlubang f(x) = (x^2-1)/(x-1) memiliki nilai di x=1 yang tidak terdefinisi.",
      "Limit f(x) bernilai L jika untuk setiap epsilon > 0 terdapat delta > 0 sehingga 0 < |x - c| < delta.",
      "Pada pembuktian limit f(x) = ax + b, nilai delta dapat dipilih sebagai delta = epsilon / a."
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

  it("normalizes nested LaTeX commands such as \\frac{1}{\\sqrt{x}} into a single expression", () => {
    const input = "Perhatikan fungsi \\frac{1}{\\sqrt{x}} dan \\frac{\\sqrt{x} + 1}{\\sqrt{x} - 1} pada domain x > 0.";
    const normalized = normalizeMathInText(input);

    expect(normalized).toContain("\\frac{1}{\\sqrt{x}}");
    expect(normalized).toContain("\\frac{\\sqrt{x} + 1}{\\sqrt{x} - 1}");

    // KaTeX should render both without syntax errors
    const math = normalized.match(/\$([^$]+)\$/g) || [];
    expect(math.length).toBeGreaterThanOrEqual(2);
    expect(() => {
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("leaves incomplete or unbalanced nested commands unwrapped instead of wrapping partially", () => {
    const input = "Rumus rusak \\frac{1}{\\sqrt{x tidak boleh memecah argumen.";
    const normalized = normalizeMathInText(input);

    // It should not wrap \frac{1} or \sqrt{x independently
    expect(normalized).not.toContain("$\\frac{1}$");
    expect(normalized).not.toContain("$\\sqrt{x");
    expect(normalized).toBe(input);
  });

  it("normalizes chemical reactions with phases, ions, and electrons", () => {
    const reactions = [
      "X(g)→X+(g)+e-",
      "X(g)+e- → X-(g)",
      "X-(g)→X(g)+e-",
      "X+(g)+e- → X(g)",
      "Ionisasi pertama adalah pelepasan satu elektron dari atom netral gas: Mg(g)→Mg+(g)+e-."
    ];

    for (const rxn of reactions) {
      const normalized = normalizeMathInText(rxn);
      const math = normalized.match(/\$([^$]+)\$/g) || [];
      expect(math.length).toBeGreaterThanOrEqual(1);
      expect(() => {
        for (const m of math) {
          katex.renderToString(m.slice(1, -1), { throwOnError: true });
        }
      }).not.toThrow();
    }
  });

  it("normalizes atomic ions, quantum levels, and Rydberg constant in questions", () => {
    const input = "Untuk ion He+ (Z=2), hitung panjang gelombang foton saat elektron berpindah dari n2=4 ke n1=2. Gunakan R=1,097 × 10^7 m-1.";
    const normalized = normalizeMathInText(input);

    expect(normalized).toContain("\\text{He}^{+}");
    expect(normalized).toContain("n_2 = 4");
    expect(normalized).toContain("n_1 = 2");
    expect(normalized).toContain("10^{7}");
    expect(normalized).toContain("\\text{ m}^{-1}");

    const math = normalized.match(/\$([^$]+)\$/g) || [];
    expect(math.length).toBeGreaterThanOrEqual(4);
    expect(() => {
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("normalizes frequency, speed of light, and scientific powers in questions", () => {
    const input = "Cahaya memiliki frekuensi 5,00 × 10^14 Hz. Dengan c=3,00 × 10^8 m/s, tentukan panjang gelombangnya dalam nm.";
    const normalized = normalizeMathInText(input);

    expect(normalized).toContain("10^{14}");
    expect(normalized).toContain("10^{8}");
    expect(normalized).toContain("\\text{ Hz}");
    expect(normalized).toContain("\\text{ m/s}");

    const math = normalized.match(/\$([^$]+)\$/g) || [];
    expect(math.length).toBeGreaterThanOrEqual(2);
    expect(() => {
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("normalizes acceptable answer options with scientific powers and units", () => {
    const input = "121,5 nm / 121.5 nm / 1,215 × 10^-7 m / 1.215 × 10^-7 m";
    const normalized = normalizeMathInText(input);

    expect(normalized).toContain("121{,}5\\text{ nm}");
    expect(normalized).toContain("10^{-7}");

    const math = normalized.match(/\$([^$]+)\$/g) || [];
    expect(math.length).toBeGreaterThanOrEqual(4);
    expect(() => {
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });

  it("normalizes Rydberg derivation and explanation text", () => {
    const input = "Gunakan 1/lambda=RZ^2(1/n1^2-1/n2^2)=1,097 ×10^7 ×4 x(1/4-1/16). Hasilnya lambda sekitar 1,215 ×10^-7 m=121,5 nm.";
    const normalized = normalizeMathInText(input);

    expect(normalized).toContain("\\frac{1}{\\lambda}");
    expect(normalized).toContain("n_1^2");
    expect(normalized).toContain("n_2^2");
    expect(normalized).toContain("\\lambda");
    expect(normalized).toContain("10^{-7}");

    const math = normalized.match(/\$([^$]+)\$/g) || [];
    expect(math.length).toBeGreaterThanOrEqual(3);
    expect(() => {
      for (const m of math) {
        katex.renderToString(m.slice(1, -1), { throwOnError: true });
      }
    }).not.toThrow();
  });
});
