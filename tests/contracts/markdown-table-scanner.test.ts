import { describe, expect, test } from "bun:test";
import { splitMarkdownTableRow, parseCanonicalMarkdown, compileMarkdown } from "@/lib/markdown-compiler";

describe("Markdown Table Row Scanner Contract", () => {
  describe("splitMarkdownTableRow pure helper", () => {
    test("splits standard table rows with outer pipes and trims cell contents", () => {
      const line = "| Name | Age | City |";
      expect(splitMarkdownTableRow(line)).toEqual(["Name", "Age", "City"]);
    });

    test("handles varying whitespace around outer pipes and cell content", () => {
      const line = "   |   Header One   | Header Two |   Header Three   |   ";
      expect(splitMarkdownTableRow(line)).toEqual(["Header One", "Header Two", "Header Three"]);
    });

    test("handles table rows without outer pipes", () => {
      expect(splitMarkdownTableRow("Col 1 | Col 2 | Col 3")).toEqual(["Col 1", "Col 2", "Col 3"]);
      expect(splitMarkdownTableRow("| Col 1 | Col 2")).toEqual(["Col 1", "Col 2"]);
      expect(splitMarkdownTableRow("Col 1 | Col 2 |")).toEqual(["Col 1", "Col 2"]);
    });

    test("handles empty and edge case lines", () => {
      expect(splitMarkdownTableRow("")).toEqual([]);
      expect(splitMarkdownTableRow("   ")).toEqual([]);
      expect(splitMarkdownTableRow("|")).toEqual([]);
      expect(splitMarkdownTableRow("||")).toEqual([""]);
      expect(splitMarkdownTableRow("|   |")).toEqual([""]);
      expect(splitMarkdownTableRow("|   |   |")).toEqual(["", ""]);
      expect(splitMarkdownTableRow("| Single Cell |")).toEqual(["Single Cell"]);
    });

    test("preserves pipes inside single dollar inline math $|x| < 1$", () => {
      const row = "| Symbol | Condition | Range |";
      expect(splitMarkdownTableRow(row)).toEqual(["Symbol", "Condition", "Range"]);

      const mathRow = "| $x$ | $|x| < 1$ | $x \\in (-1, 1)$ |";
      expect(splitMarkdownTableRow(mathRow)).toEqual(["$x$", "$|x| < 1$", "$x \\in (-1, 1)$"]);

      const complexMathRow = "| $f(x)$ | $|a| + |b| \\ge |a + b|$ | Triangle inequality |";
      expect(splitMarkdownTableRow(complexMathRow)).toEqual([
        "$f(x)$",
        "$|a| + |b| \\ge |a + b|$",
        "Triangle inequality",
      ]);
    });

    test("preserves pipes inside single line display math $$...$$", () => {
      const line = "| Matrix | $$|A| = \\det(A)$$ | Determinant notation |";
      expect(splitMarkdownTableRow(line)).toEqual([
        "Matrix",
        "$$|A| = \\det(A)$$",
        "Determinant notation",
      ]);

      const lineWithMultiplePipes = "| Norm | $$\\left| \\frac{a}{b} \\right|$$ | Absolute value quotient |";
      expect(splitMarkdownTableRow(lineWithMultiplePipes)).toEqual([
        "Norm",
        "$$\\left| \\frac{a}{b} \\right|$$",
        "Absolute value quotient",
      ]);
    });

    test("preserves pipes inside LaTeX inline \\(...\\) and display \\[...\\] delimiters on one line", () => {
      const lineInline = "| Inline | \\( |x| > 0 \\) | Positive definite |";
      expect(splitMarkdownTableRow(lineInline)).toEqual([
        "Inline",
        "\\( |x| > 0 \\)",
        "Positive definite",
      ]);

      const lineDisplay = "| Display | \\[ |y| \\le 1 \\] | Bounded range |";
      expect(splitMarkdownTableRow(lineDisplay)).toEqual([
        "Display",
        "\\[ |y| \\le 1 \\]",
        "Bounded range",
      ]);

      const lineBoth = "| \\( |u| < 1 \\) | \\[ |v| \\ge 2 \\] |";
      expect(splitMarkdownTableRow(lineBoth)).toEqual([
        "\\( |u| < 1 \\)",
        "\\[ |v| \\ge 2 \\]",
      ]);
    });

    test("preserves escaped pipes \\|", () => {
      const line = "| Operator | a \\| b | Bitwise OR |";
      expect(splitMarkdownTableRow(line)).toEqual([
        "Operator",
        "a \\| b",
        "Bitwise OR",
      ]);

      const lineEscapedAndUnescaped = "| \\| | Escaped pipe character | Used in BNF \\| Grammar |";
      expect(splitMarkdownTableRow(lineEscapedAndUnescaped)).toEqual([
        "\\|",
        "Escaped pipe character",
        "Used in BNF \\| Grammar",
      ]);
    });

    test("preserves pipes inside inline code spans with single and multiple backticks", () => {
      const lineSingleTick = "| Command | `cat file | grep text` | Filter output |";
      expect(splitMarkdownTableRow(lineSingleTick)).toEqual([
        "Command",
        "`cat file | grep text`",
        "Filter output",
      ]);

      const lineDoubleTick = "| Pattern | ``foo | bar`baz`` | Regex alternative |";
      expect(splitMarkdownTableRow(lineDoubleTick)).toEqual([
        "Pattern",
        "``foo | bar`baz``",
        "Regex alternative",
      ]);
    });
  });

  describe("General table parsing integration", () => {
    test("parses markdown table with math absolute value and escaped pipes into AST table block", () => {
      const markdown = [
        "| Simbol | Kondisi | Keterangan |",
        "|---|---|---|",
        "| $x$ | $|x| < 1$ | Nilai absolut kurang dari satu |",
        "| $y$ | $$|y| = 1$$ | Satuan |",
        "| `a | b` | a \\| b | Bitwise OR |",
      ].join("\n");

      const blocks = parseCanonicalMarkdown(markdown);
      expect(blocks.length).toBe(1);

      const tableBlock = blocks[0] as any;
      expect(tableBlock.type).toBe("table");
      expect(tableBlock.headers).toEqual(["Simbol", "Kondisi", "Keterangan"]);
      expect(tableBlock.rows).toEqual([
        ["$x$", "$|x| < 1$", "Nilai absolut kurang dari satu"],
        ["$y$", "$$|y| = 1$$", "Satuan"],
        ["`a | b`", "a \\| b", "Bitwise OR"],
      ]);
    });
  });

  describe("Formula block symbol extraction integration", () => {
    test("extracts formula symbols containing pipes without corrupting row columns", () => {
      const markdown = [
        ":::formula {title=\"Absolute Value Inequality\"}",
        "$$ |x| < \\delta $$",
        "",
        "| Simbol | Satuan | Definisi |",
        "|---|---|---|",
        "| $|x|$ | $-$ | Nilai mutlak dari variabel $x$ |",
        "| $\\delta$ | $-$ | Batas toleransi |",
        ":::",
      ].join("\n");

      const result = compileMarkdown(markdown);
      const formulaBlock = result.ast.blocks.find((b) => b.type === "formula") as any;

      expect(formulaBlock).toBeDefined();
      expect(formulaBlock.content.symbols).toHaveLength(2);
      expect(formulaBlock.content.symbols[0]).toEqual({
        symbol: "$|x|$",
        definition: "Nilai mutlak dari variabel $x$",
        unit: "$-$",
      });
      expect(formulaBlock.content.symbols[1]).toEqual({
        symbol: "$\\delta$",
        definition: "Batas toleransi",
        unit: "$-$",
      });
    });

    test("extracts symbols with escaped pipes or norm notations", () => {
      const markdown = [
        ":::formula {title=\"Vector Norm\"}",
        "$$ \\|v\\| = \\sqrt{v_x^2 + v_y^2} $$",
        "",
        "| Simbol | Unit | Definisi |",
        "| :--- | :--- | :--- |",
        "| $\\|v\\|$ | m/s | Magnitudo kecepatan \\| vektor $v$ |",
        ":::",
      ].join("\n");

      const result = compileMarkdown(markdown);
      const formulaBlock = result.ast.blocks.find((b) => b.type === "formula") as any;

      expect(formulaBlock).toBeDefined();
      expect(formulaBlock.content.symbols).toHaveLength(1);
      expect(formulaBlock.content.symbols[0].symbol).toBe("$\\|v\\|$");
      expect(formulaBlock.content.symbols[0].unit).toBe("m/s");
      expect(formulaBlock.content.symbols[0].definition).toContain("Magnitudo kecepatan \\| vektor $v$");
    });
  });
});
