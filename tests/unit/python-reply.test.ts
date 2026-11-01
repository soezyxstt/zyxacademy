import { expect, test } from "bun:test";
import { pythonReply } from "@/lib/coding/python-reply";

test("separates final Python from explanations without applying incomplete or ambiguous code", () => {
  expect(pythonReply("Penjelasan.\n```python\nprint(2)\n```" )).toEqual({ explanation: "Penjelasan.", code: "print(2)\n" });
  expect(pythonReply("Penjelasan.\n```python\nprint(")).toEqual({ explanation: "Penjelasan.", code: null });
  expect(pythonReply("```py\na\n```\n```python\nb\n```").code).toBeNull();
  expect(pythonReply("Teks biasa dan `kode`.")).toEqual({ explanation: "Teks biasa dan `kode`.", code: null });
});
