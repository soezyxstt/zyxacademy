/** Mental math in the Pet studio is a local game. Scores reset with each session. */
export function petPracticeRound(random: () => number = Math.random) {
  const left = 2 + Math.floor(random() * 8);
  const right = 2 + Math.floor(random() * 8);
  const answer = left * right;
  const start = answer - Math.floor(random() * 3);
  return { left, right, answer, choices: [start, start + 1, start + 2] };
}
