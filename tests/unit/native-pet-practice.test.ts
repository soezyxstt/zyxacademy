import { expect, test } from "bun:test";
import { petPracticeRound } from "../../packages/student-community/pet-practice";

test("every web and native multiplication round has three unique options with one correct choice", () => {
  for (let left = 2; left <= 9; left++) for (let right = 2; right <= 9; right++) {
    for (let position = 0; position < 3; position++) {
      const values = [(left - 2) / 8, (right - 2) / 8, position / 3];
      const round = petPracticeRound(() => values.shift()!);
      expect([round.left, round.right, round.answer]).toEqual([left, right, left * right]);
      expect(new Set(round.choices).size).toBe(3);
      expect(round.choices[position]).toBe(round.answer);
    }
  }
});
