import type {
  CognitiveLevel,
  Difficulty,
  QuestionAuthoringQuestion,
  QuestionType,
} from "@/lib/question-authoring-contract";

export interface ExtractedQuestion extends QuestionAuthoringQuestion {
  sourceIndex: number;
}

const cognitiveLevels: CognitiveLevel[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

function parseQuestionType(value: string): QuestionType | null {
  const content = value.trim().toLowerCase();
  if (content.includes("isian") || content.includes("short_answer") || content === "short") return "short_answer";
  if (content.includes("essay") || content.includes("uraian")) return "essay";
  if (content.includes("kompleks") || content.includes("multiple_choices")) return "multiple_choices";
  if (content.includes("pilihan ganda") || content.includes("multiple_choice")) return "multiple_choice";
  return null;
}

function parseDifficulty(value: string): Difficulty {
  const content = value.trim().toLowerCase();
  if (content === "easy" || content === "mudah") return "easy";
  if (content === "hard" || content === "sulit" || content === "susah") return "hard";
  return "medium";
}

function parseCognitiveLevel(value: string): CognitiveLevel {
  const content = value.trim().toLowerCase();
  const aliases: Record<string, CognitiveLevel> = {
    ingat: "remember",
    mengingat: "remember",
    remember: "remember",
    pahami: "understand",
    memahami: "understand",
    understand: "understand",
    terapkan: "apply",
    menerapkan: "apply",
    apply: "apply",
    analisis: "analyze",
    menganalisis: "analyze",
    analyze: "analyze",
    evaluasi: "evaluate",
    mengevaluasi: "evaluate",
    evaluate: "evaluate",
    kreasi: "create",
    mencipta: "create",
    create: "create",
  };
  return aliases[content] ?? (cognitiveLevels.includes(content as CognitiveLevel) ? content as CognitiveLevel : "understand");
}

function parseAnswerIndices(value: string): number[] {
  const indices = [...value.toUpperCase().matchAll(/\b([A-E])\b/g)].map((match) => match[1].charCodeAt(0) - 65);
  return [...new Set(indices)];
}

function splitAnswers(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function metadataValue(line: string, keys: string[]): string | null {
  const keyPattern = keys.join("|");
  const match = line.trim().match(new RegExp(`^\\*\\*(${keyPattern}):\\*\\*\\s*(.*)$`, "i"));
  return match?.[2]?.trim() ?? null;
}

interface MarkdownFence {
  marker: string;
  length: number;
}

function openingFence(line: string): MarkdownFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return { marker: match[1][0], length: match[1].length };
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

export function validateExtractedQuestion(question: ExtractedQuestion, index: number): string | null {
  const label = `Soal nomor ${index}`;
  if (!question.prompt.trim()) return `${label} tidak memiliki teks pertanyaan yang valid.`;

  const isChoice = question.questionType === "multiple_choice" || question.questionType === "multiple_choices";
  if (isChoice) {
    if (question.options.length < 2 || question.options.some((option) => !option.trim())) {
      return `${label} harus memiliki minimal dua opsi yang terisi berurutan dari A.`;
    }
    if (question.correctIndices.length === 0) {
      return `${label} belum memiliki kunci jawaban. Gunakan format **Jawaban:** B.`;
    }
    if (question.questionType === "multiple_choice" && question.correctIndices.length !== 1) {
      return `${label} bertipe Pilihan Ganda sehingga harus memiliki tepat satu kunci jawaban.`;
    }
    if (question.correctIndices.some((indexValue) => indexValue < 0 || indexValue >= question.options.length)) {
      return `${label} memiliki kunci jawaban di luar opsi yang tersedia.`;
    }
  }

  if (question.questionType === "short_answer" && question.acceptableAnswers.length === 0) {
    return `${label} bertipe Isian Singkat sehingga wajib memiliki **Jawaban:**.`;
  }

  return null;
}

export function parseQuestionsMarkdown(markdown: string): ExtractedQuestion[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let blockFence: MarkdownFence | null = null;

  for (const line of lines) {
    if (blockFence) {
      currentBlock.push(line);
      if (closesFence(line, blockFence)) blockFence = null;
      continue;
    }
    blockFence = openingFence(line);
    if (blockFence) {
      currentBlock.push(line);
      continue;
    }
    if (line.trim().startsWith("## ")) {
      if (currentBlock.length > 0) blocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  const questions: ExtractedQuestion[] = [];

  for (const blockLines of blocks) {
    const heading = blockLines[0]?.trim() ?? "";
    if (!/^##\s+(soal|question|pertanyaan|\d+)/i.test(heading)) continue;

    const promptLines: string[] = [];
    const optionSlots: Array<string | undefined> = [];
    const explanationLines: string[] = [];
    let correctIndices: number[] = [];
    let acceptableAnswers: string[] = [];
    let difficulty: Difficulty = "medium";
    let questionType: QuestionType | null = null;
    let cognitiveLevel: CognitiveLevel = "understand";
    let reasoningPattern = "manual_authoring";
    let tags: string[] = [];
    let parsingExplanation = false;
    let answerTextRaw = "";
    let contentFence: MarkdownFence | null = null;
    let activeOption: number | null = null;

    const appendContent = (line: string) => {
      if (parsingExplanation) explanationLines.push(line);
      else if (activeOption !== null) optionSlots[activeOption] += `\n${line}`;
      else promptLines.push(line);
    };

    for (let lineIndex = 1; lineIndex < blockLines.length; lineIndex++) {
      const line = blockLines[lineIndex];
      const trimmed = line.trim();

      // Visual and code payloads are content, even when a line resembles
      // question metadata, an option, or a new question heading.
      if (contentFence) {
        appendContent(line);
        if (closesFence(line, contentFence)) contentFence = null;
        continue;
      }
      contentFence = openingFence(line);
      if (contentFence) {
        appendContent(line);
        continue;
      }

      const typeValue = metadataValue(trimmed, ["tipe", "tipe soal", "jenis", "type"]);
      if (typeValue !== null) {
        questionType = parseQuestionType(typeValue);
        continue;
      }

      const tagsValue = metadataValue(trimmed, ["tags?", "tag"]);
      if (tagsValue !== null) {
        tags = tagsValue.split(",").map((tag) => tag.trim()).filter(Boolean);
        continue;
      }

      const difficultyValue = metadataValue(trimmed, ["kesulitan", "difficulty"]);
      if (difficultyValue !== null) {
        difficulty = parseDifficulty(difficultyValue);
        continue;
      }

      const cognitiveValue = metadataValue(trimmed, ["level kognitif", "tingkat kognitif", "cognitive level"]);
      if (cognitiveValue !== null) {
        cognitiveLevel = parseCognitiveLevel(cognitiveValue);
        continue;
      }

      const reasoningValue = metadataValue(trimmed, ["pola penalaran", "reasoning pattern"]);
      if (reasoningValue !== null) {
        reasoningPattern = reasoningValue || "manual_authoring";
        continue;
      }

      const answerValue = metadataValue(trimmed, ["jawaban", "answer", "kunci", "kunci jawaban", "rubrik"]);
      if (answerValue !== null) {
        answerTextRaw = answerValue;
        correctIndices = parseAnswerIndices(answerValue);
        continue;
      }

      const explanationValue = metadataValue(trimmed, ["pembahasan", "solusi", "penjelasan"]);
      if (explanationValue !== null) {
        parsingExplanation = true;
        if (explanationValue) explanationLines.push(explanationValue);
        continue;
      }

      const optionMatch = trimmed.match(/^([A-E])[.)]\s+(.*)/i);
      if (optionMatch && !parsingExplanation) {
        const optionIndex = optionMatch[1].toUpperCase().charCodeAt(0) - 65;
        optionSlots[optionIndex] = optionMatch[2].trim();
        activeOption = optionIndex;
        continue;
      }

      appendContent(line);
    }

    const highestOptionIndex = optionSlots.reduce((highest, option, index) => option !== undefined ? Math.max(highest, index) : highest, -1);
    const options = highestOptionIndex >= 0 ? optionSlots.slice(0, highestOptionIndex + 1).map((option) => option?.trim() ?? "") : [];

    if (!questionType) {
      if (options.length > 0) questionType = correctIndices.length > 1 ? "multiple_choices" : "multiple_choice";
      else if (answerTextRaw) questionType = "short_answer";
      else questionType = "multiple_choice";
    }

    if (questionType === "short_answer") acceptableAnswers = splitAnswers(answerTextRaw);
    if (questionType === "essay" && answerTextRaw) acceptableAnswers = [answerTextRaw];

    questions.push({
      sourceIndex: questions.length + 1,
      prompt: promptLines.join("\n").trim(),
      questionType,
      difficulty,
      cognitiveLevel,
      reasoningPattern,
      tags,
      options,
      correctIndices,
      acceptableAnswers,
      explanation: explanationLines.join("\n").trim(),
    });
  }

  return questions;
}
