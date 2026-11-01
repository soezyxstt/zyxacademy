import { expect, test } from "bun:test";
import { pythonReply, pythonHistoryReply } from "@/lib/coding/python-reply";

test("separates final Python from explanations without applying incomplete or ambiguous code", () => {
  expect(pythonReply("Penjelasan.\n```python\nprint(2)\n```" )).toEqual({ explanation: "Penjelasan.", code: "print(2)\n" });
  expect(pythonReply("Penjelasan.\n```python\nprint(")).toEqual({ explanation: "Penjelasan.", code: null });
  expect(pythonReply("```py\na\n```\n```python\nb\n```").code).toBeNull();
  expect(pythonReply("print(2)")).toEqual({ explanation: "", code: null });
  expect(pythonHistoryReply("print(2)", "id")).not.toContain("print(2)");
  expect(pythonReply("```python\nprint(1)\n```\n```python\nprint(2)").code).toBeNull();
  expect(pythonReply("```python\nprint(1)\n```\n```\nprint(2)\n```").code).toBeNull();
  const streamed = "Penjelasan.\n```python\nprint(2)\n```";
  for (let i = 15; i <= streamed.length; i++) expect(pythonReply(streamed.slice(0, i)).explanation).toBe("Penjelasan.");
  expect(pythonReply("```python3\nprint(2)\n```").code).toBe("print(2)\n");
  expect(pythonReply("```javascript\nalert(1)\n```")).toEqual({ explanation: "", code: null });
});

test("Python history omits final code and gives recovery without claiming it was applied", () => {
  const saved = pythonHistoryReply("Penjelasan.\n```python\nprint(2)\n```", "id");
  expect(saved).toContain("Penjelasan.");
  expect(saved).not.toContain("print(2)");
  expect(saved).toContain("Jika belum diterapkan");
  expect(pythonHistoryReply("```py\nprint(2)\n```", "en")).toContain("ask Zyra to generate it again");
});
