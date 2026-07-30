/**
 * Versioned prompt policy fragments for machine-facing and student-facing AI stages.
 */

export type PolicyCategory = 'machine' | 'student';

export interface PolicyFragment {
  id: string;
  version: string;
  category: PolicyCategory;
  content: string;
}

export const POLICY_JSON_STRICT: PolicyFragment = {
  id: 'json-strict',
  version: '1.0',
  category: 'machine',
  content: `Output ONLY a single valid JSON object matching the requested schema. Do not include markdown code block tags, commentary, or text before or after the JSON. Ensure proper string escaping and valid key-value pairs without trailing commas.`,
};

export const POLICY_ZYX_VOICE: PolicyFragment = {
  id: 'zyx-voice',
  version: '1.0',
  category: 'student',
  content: `Adopt the official Zyx Academy pedagogical tone: concise, encouraging, direct, and sentence-cased. Never use filler words, artificial enthusiasm, or exclamation marks. Never use em dashes or en dashes.`,
};

export const POLICY_LANGUAGE_ID: PolicyFragment = {
  id: 'language-choice',
  version: '1.0',
  category: 'student',
  content: `Write primarily in clear Indonesian (Bahasa Indonesia). Preserve standard scientific, mathematical, and technical terminology where appropriate.`,
};

export const POLICY_MATH_LATEX: PolicyFragment = {
  id: 'math-notation',
  version: '1.0',
  category: 'student',
  content: `Format all mathematical expressions using standard LaTeX notation. Use single dollar signs ($...$) for inline math and double dollar signs ($$...$$) for block display math. Ensure valid LaTeX syntax without unescaped characters.`,
};

export const POLICY_ASSESSMENT_HELP: PolicyFragment = {
  id: 'assessment-help',
  version: '1.0',
  category: 'student',
  content: `Provide scaffolded pedagogical guidance that leads the student toward understanding. Never directly reveal final answers or solutions to active exam questions.`,
};

export const POLICY_VISUAL_INTENT: PolicyFragment = {
  id: 'visual-intent',
  version: '1.0',
  category: 'student',
  content: `Describe visual concepts using clear structural layouts, structured tables, or explicit spatial relationships suitable for rendering.`,
};

export interface PolicyCompositionOptions {
  isMachineOnly?: boolean;
}

/**
 * Composes policy fragments into a combined instruction block and a version string.
 * Omits student-facing style fragments when `isMachineOnly` is true.
 */
export function composePolicies(
  policies: PolicyFragment[],
  options?: PolicyCompositionOptions
): { composedText: string; combinedVersion: string } {
  const filtered = (options?.isMachineOnly ?? false)
    ? policies.filter((p) => p.category === 'machine')
    : policies;

  if (filtered.length === 0) {
    return { composedText: '', combinedVersion: 'none' };
  }

  const composedText = filtered.map((p) => p.content).join('\n\n');
  const combinedVersion = filtered.map((p) => `${p.id}@${p.version}`).join('+');

  return { composedText, combinedVersion };
}
