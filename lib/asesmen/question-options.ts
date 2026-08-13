export function redactQuestionAnswerKeys(options: unknown): unknown[] {
  if (!Array.isArray(options)) return [];
  return options.map((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return option;
    const value = option as Record<string, unknown>;
    const { isCorrect: _isCorrect, correct: _correct, answer: _answer, ...safe } = value;
    return safe;
  });
}
