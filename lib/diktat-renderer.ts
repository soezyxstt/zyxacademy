import { DiktatStructure, FormulaHandbookEntry } from "./diktat-generator";
import type { ConceptImportanceScore, ExamPattern, QuickMethod, ExamTrap, ReviewChecklist } from "./diktat-exam-intelligence";
import katex from "katex";

/**
 * Pre-renders all LaTeX math blocks inside a markdown string into static KaTeX HTML nodes.
 * Guarantees print compatibility and zero rendering delay in Puppeteer viewports.
 * Compiles basic markdown styling (bold, italic, list items, etc.) on non-math text.
 */
export function preRenderMathInText(text: string): string {
 if (!text) return "";

 const mathBlocks: { type: string; eq: string; placeholder: string }[] = [];

 // 1. Temporarily extract block equations ($$ ... $$ and \[ ... \]) and replace with safe placeholder
 let processedText = text
 .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, eq) => {
 const placeholder = `%%BLOCKMATH${mathBlocks.length}%%`;
 mathBlocks.push({ type: "block", eq: eq.trim(), placeholder });
 return placeholder;
 })
 .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, eq) => {
 const placeholder = `%%BLOCKMATH${mathBlocks.length}%%`;
 mathBlocks.push({ type: "block", eq: eq.trim(), placeholder });
 return placeholder;
 });

 // 2. Temporarily extract inline equations ($ ... $ and \( ... \)) and replace with safe placeholder
 // We ignore numeric strings like "$100"
 processedText = processedText
 .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, eq) => {
 const placeholder = `%%INLINEMATH${mathBlocks.length}%%`;
 mathBlocks.push({ type: "inline", eq: eq.trim(), placeholder });
 return placeholder;
 })
 .replace(/\$([^\$]+?)\$/g, (orig, eq) => {
 const trimmed = eq.trim();
 if (!trimmed || trimmed.match(/^\d+(\.\d+)?$/) || (trimmed.length === 1 && trimmed.match(/[0-9]/))) {
 return orig;
 }
 const placeholder = `%%INLINEMATH${mathBlocks.length}%%`;
 mathBlocks.push({ type: "inline", eq: trimmed, placeholder });
 return placeholder;
 });

 // 3. Process markdown formatting on the non-math text line by line
 const lines = processedText.split(/\r?\n/);
 const processedLines: string[] = [];

 for (const line of lines) {
 const trimmed = line.trim();

 // Horizontal Rule
 if (trimmed === "---") {
 processedLines.push('<hr class="my-4" style="border: 0; border-top: 1px dashed #dddddd;" />');
 continue;
 }

 // Headers
 const h3Match = trimmed.match(/^###\s+(.*)/);
 if (h3Match) {
 processedLines.push(`<h4 class="font-bold text-gray-800" style="font-size: 10pt; margin-top: 10pt; margin-bottom: 4pt;">${convertInlineMarkdown(h3Match[1])}</h4>`);
 continue;
 }
 const h2Match = trimmed.match(/^##\s+(.*)/);
 if (h2Match) {
 processedLines.push(`<h3 class="font-bold text-gray-900" style="font-size: 11pt; margin-top: 14pt; margin-bottom: 6pt; color: #002B49;">${convertInlineMarkdown(h2Match[1])}</h3>`);
 continue;
 }

 // Unordered List Items (- or *)
 const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
 if (ulMatch) {
 const content = convertInlineMarkdown(ulMatch[1]);
 processedLines.push(`<li class="text-gray-700" style="margin-left: 20px; list-style-type: disc; margin-bottom: 3pt;">${content}</li>`);
 continue;
 }

 // Ordered List Items (1. )
 const olMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
 if (olMatch) {
 const content = convertInlineMarkdown(olMatch[2]);
 processedLines.push(`<li class="text-gray-700" style="margin-left: 20px; list-style-type: decimal; margin-bottom: 3pt;">${content}</li>`);
 continue;
 }

 // Regular line
 processedLines.push(convertInlineMarkdown(line));
 }

 function convertInlineMarkdown(str: string): string {
 return str
 // Bold **text** or __text__
 .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-black">$1</strong>')
 .replace(/__(.*?)__/g, '<strong class="font-bold text-black">$1</strong>')
 // Italic *text* or _text_
 .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
 .replace(/_(.*?)_/g, '<em class="italic">$1</em>')
 // Inline code `code`
 .replace(/`(.*?)`/g, '<code class="font-mono" style="background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-size: 8.5pt; color: #dc2626;">$1</code>');
 }

 let output = processedLines.join("<br />");

 // Clean up adjacent `<br />` before/after list items and rules
 output = output
 .replace(/(<br\s*\/?>\s*)*(<li[^>]*>.*?<\/li>)(<br\s*\/?>\s*)*/g, "$2")
 .replace(/<\/li>\s*<br\s*\/?>\s*<li/g, "</li><li")
 .replace(/<hr[^>]*>\s*<br\s*\/?>/g, '<hr class="my-4" style="border: 0; border-top: 1px dashed #dddddd;" />')
 .replace(/<br\s*\/?>\s*<hr/g, '<hr');

 // 4. Render math equations and replace placeholders back with KaTeX HTML
 for (const item of mathBlocks) {
 let rendered = "";
 if (item.type === "block") {
 try {
 rendered = katex.renderToString(item.eq, {
 displayMode: true,
 throwOnError: false,
 });
 rendered = `<div class="math-block" style="margin: 10pt 0; text-align: center; overflow-x: auto;">${rendered}</div>`;
 } catch {
 rendered = `<div class="math-error" style="color: #dc2626; font-family: monospace; font-size: 9pt; padding: 4px 0;">$$${item.eq}$$</div>`;
 }
 } else {
 try {
 rendered = katex.renderToString(item.eq, {
 displayMode: false,
 throwOnError: false,
 });
 rendered = `<span class="math-inline" style="display: inline-block; padding: 0 1px;">${rendered}</span>`;
 } catch {
 rendered = `<span class="math-error" style="color: #dc2626; font-family: monospace; font-size: 9pt;">$${item.eq}$</span>`;
 }
 }
 output = output.replace(item.placeholder, rendered);
 }

 return output;
}

function renderImportanceStars(score: ConceptImportanceScore | undefined): string {
 if (!score) return "";
 const filled = "★".repeat(score.stars);
 const empty = "☆".repeat(5 - score.stars);
 return `<span class="importance-badge">${filled}${empty} ${score.label}</span>`;
}

export function renderDiktatToHTML(
  diktat: DiktatStructure,
  _tutorOverrides?: any
): string {
  const ei = diktat.examIntelligence;

 // Build exam intelligence lookup maps
 const importanceMap = new Map<string, ConceptImportanceScore>(
 (ei?.importanceScores ?? []).map(s => [s.conceptName, s])
 );
 const patternMap = new Map<string, ExamPattern>(
 (ei?.examPatterns ?? []).map(p => [p.conceptName, p])
 );
 const quickMethodMap = new Map<string, QuickMethod>(
 (ei?.quickMethods ?? []).map(m => [m.conceptName, m])
 );
 const trapsByConceptMap = new Map<string, ExamTrap[]>();
 for (const trap of (ei?.examTraps ?? [])) {
 const list = trapsByConceptMap.get(trap.conceptName) ?? [];
 list.push(trap);
 trapsByConceptMap.set(trap.conceptName, list);
 }
 const checklistByChapter = new Map<string, ReviewChecklist>(
 (ei?.reviewChecklists ?? []).map(c => [c.chapterId, c])
 );

 // Cover Page
 const coverHtml = `
 <div class="cover-page">
 <div class="cover-header">
 <p class="cover-subtitle">Zyx Academy Student Handbook</p>
 <h1 class="cover-title">${diktat.title}</h1>
 <p style="font-size: 11pt; color: #555555; margin-top: 10px;">Diktat ringkas berorientasi pemahaman konsep dan persiapan ujian.</p>
 </div>
 <div class="cover-footer">
 <p><strong>DOCUMENT CLASS:</strong> STUDENT DIKTAT KULIAH</p>
 <p><strong>GENERATION HASH:</strong> <span style="font-family: monospace; font-size: 8.5pt;">${diktat.generationHash}</span></p>
 <p><strong>DATE COMPILED:</strong> ${new Date().toLocaleDateString()}</p>
 </div>
 </div>
 `;

 // Section 1 ; Exam Roadmap Page
 const top10Concepts = (ei?.importanceScores ?? [])
 .slice()
 .sort((a, b) => b.stars - a.stars)
 .slice(0, 10);

 const priorityTableRows = top10Concepts.length > 0
 ? top10Concepts.map((s, idx) => {
 const chapter = diktat.chapters.find(ch => ch.concepts.some(c => c.conceptName === s.conceptName));
 return `
 <tr>
 <td style="text-align: center; font-weight: 700; color: #FF6B35;">${idx + 1}</td>
 <td style="font-weight: 600;">${s.conceptName}</td>
 <td style="text-align: center; color: #d97706; letter-spacing: 1px;">${"★".repeat(s.stars)}${"☆".repeat(5 - s.stars)}</td>
 <td style="font-size: 9pt; color: #555555;">${chapter?.title ?? ""}</td>
 </tr>
 `;
 }).join("")
 : `<tr><td colspan="4" style="text-align:center; color:#888; font-size:9pt;">Proses analisis prioritas belum tersedia untuk diktat ini.</td></tr>`;

 const studyOrderItems = ei?.studyOrder && ei.studyOrder.length > 0
 ? ei.studyOrder.slice(0, 15).map((name, i) => `<li style="margin-bottom: 3px; font-size: 10pt;"><span style="color: #FF6B35; font-weight: 700;">${i + 1}.</span> ${name}</li>`).join("")
 : diktat.chapters.flatMap(ch => ch.concepts).map((c, i) => `<li style="margin-bottom: 3px; font-size: 10pt;"><span style="color: #FF6B35; font-weight: 700;">${i + 1}.</span> ${c.conceptName}</li>`).join("");

 const roadmapHtml = `
 <div class="roadmap-page">
 <h1 style="font-size: 20pt; margin-top: 5mm; margin-bottom: 16px; font-family: 'Lexend', sans-serif;">Panduan Belajar Ujian</h1>

 <h2 style="font-size: 12pt; border-bottom: 1.5px solid #000000; padding-bottom: 3px; margin-top: 0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Capaian Belajar</h2>
 <ul style="padding-left: 20px; font-size: 10pt; line-height: 1.5; margin-bottom: 18px;">
 ${diktat.sections.learningObjectives.slice(0, 5).map(obj => `<li style="margin-bottom: 4px; color: #333333;">${preRenderMathInText(obj)}</li>`).join("")}
 </ul>

 <h2 style="font-size: 12pt; border-bottom: 1.5px solid #000000; padding-bottom: 3px; margin-top: 0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Top 10 Konsep Paling Penting</h2>
 <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 9.5pt;">
 <thead>
 <tr style="background-color: #f5f5f5;">
 <th style="border: 1px solid #dddddd; padding: 5pt 6pt; width: 6%; text-align: center;">#</th>
 <th style="border: 1px solid #dddddd; padding: 5pt 6pt; text-align: left;">Konsep</th>
 <th style="border: 1px solid #dddddd; padding: 5pt 6pt; width: 18%; text-align: center;">Prioritas</th>
 <th style="border: 1px solid #dddddd; padding: 5pt 6pt; width: 28%; text-align: left;">Bab</th>
 </tr>
 </thead>
 <tbody>
 ${priorityTableRows}
 </tbody>
 </table>

 <h2 style="font-size: 12pt; border-bottom: 1.5px solid #000000; padding-bottom: 3px; margin-top: 0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Urutan Belajar Optimal</h2>
 <ol style="margin-left: 0; padding-left: 0; list-style: none; columns: 2; column-gap: 20px;">
 ${studyOrderItems}
 </ol>
 </div>
 `;

 // Section 2 ; Exam-Oriented Concept Chapters
 const chaptersHtml = diktat.chapters.map((ch, chIdx) => {
 const checklist = checklistByChapter.get(ch.id);

 const conceptsHtml = ch.concepts.map(concept => {
 const importanceScore = importanceMap.get(concept.conceptName);
 const examPattern = patternMap.get(concept.conceptName);
 const quickMethod = quickMethodMap.get(concept.conceptName);
 const conceptTraps = trapsByConceptMap.get(concept.conceptName) ?? [];

 // 1. Concept header with importance stars
 const headerHtml = `
 <div class="concept-header" style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #dddddd; padding-bottom: 3px; margin-top: 15pt; margin-bottom: 8pt;">
 <h3 style="font-size: 12pt; margin: 0; color: #000000; font-family: 'Lexend', sans-serif;">${concept.conceptName}</h3>
 ${renderImportanceStars(importanceScore)}
 </div>
 `;

 // 2. Concept summary (first definition or overview, trimmed)
 const summarySource = concept.definitions[0]?.content || concept.overviews[0]?.content || "";
 const summaryText = summarySource
 ? summarySource.split(/\n\n/).slice(0, 2).join("\n\n")
 : "";
 const summaryHtml = summaryText
 ? `<div class="concept-summary" style="font-size: 10pt; color: #333333; text-align: justify; margin-bottom: 8pt; line-height: 1.45;">${preRenderMathInText(summaryText)}</div>`
 : "";

 // 3. Quick method (AI-generated or empty)
 const quickMethodHtml = quickMethod && quickMethod.rules.length > 0
 ? `
 <div class="quick-method" style="background-color: #f0f7ff; border-left: 3px solid #2563eb; padding: 8px 10px; margin-bottom: 10pt; page-break-inside: avoid; break-inside: avoid; border-radius: 0 4px 4px 0;">
 <div style="font-weight: 700; color: #1e40af; font-size: 8pt; text-transform: uppercase; margin-bottom: 4px;">Cara Cepat: ${quickMethod.title}</div>
 <ul style="margin: 0; padding-left: 16px; font-size: 9.5pt; color: #1e3a5f; line-height: 1.5;">
 ${quickMethod.rules.map(r => `<li style="margin-bottom: 2px;">${preRenderMathInText(r)}</li>`).join("")}
 </ul>
 </div>
 `
 : "";

 // 4. Formula section
 const formulasHtml = concept.formulas.length > 0
 ? `
 <div style="margin-bottom: 10pt;">
 ${concept.formulas.map(f => {
 let renderedKatex = "";
 try {
 renderedKatex = katex.renderToString(f.latex.trim(), { displayMode: true, throwOnError: false });
 } catch {
 renderedKatex = `<span style="color: #dc2626; font-family: monospace;">$$${f.latex}$$</span>`;
 }

 const paramList = f.parameters.length > 0
 ? `<ul class="parameter-list">${f.parameters.map(p =>
 `<li class="parameter-item"><span class="parameter-symbol">${p.symbol}</span>: ${p.name}${p.unit ? ` (${p.unit})` : ""}${p.description && p.description !== p.name ? `, ${p.description}` : ""}</li>`
 ).join("")}</ul>`
 : "";

 const wrapClass = f.importance === "high"
 ? `background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 8px 10px; margin-top: 6pt; border-radius: 0 4px 4px 0;`
 : `margin-top: 6pt;`;

 return `
 <div style="margin-bottom: 10pt; page-break-inside: avoid; break-inside: avoid;">
 <div class="meta-label">${f.title}</div>
 <div style="${wrapClass}">
 <div class="formula-display">${renderedKatex}</div>
 ${paramList ? `<div style="margin-left: 10px; margin-top: 4pt;">${paramList}</div>` : ""}
 </div>
 </div>
 `;
 }).join("")}
 </div>
 `
 : "";

 // 5. Exam pattern (AI-generated or empty)
 const examPatternHtml = examPattern && examPattern.steps.length > 0
 ? `
 <div style="margin-bottom: 10pt; page-break-inside: avoid; break-inside: avoid;">
 <div class="meta-label">Pola Soal Ujian</div>
 <div style="background-color: #fafafa; border: 1px solid #e5e7eb; padding: 8px 10px; border-radius: 4px; margin-top: 4pt;">
 <ol style="margin: 0; padding-left: 20px; font-size: 9.5pt; color: #111111; line-height: 1.6;">
 ${examPattern.steps.map(s => `<li style="margin-bottom: 2px;">${preRenderMathInText(s)}</li>`).join("")}
 </ol>
 </div>
 </div>
 `
 : "";

 // 6. Exam traps (from misconception KOs + exam intelligence traps)
 const allTraps = [
 ...concept.misconceptions.map(m => ({
 wrong: m.myth || m.title,
 correct: m.correction,
 why: m.rationale,
 title: m.title,
 })),
 ...conceptTraps.filter(t => !concept.misconceptions.some(m => m.koId === t.sourceKoId)).map(t => ({
 wrong: t.wrong,
 correct: t.correct,
 why: t.why,
 title: "",
 })),
 ];

 const trapsHtml = allTraps.length > 0
 ? `
 <div style="margin-bottom: 10pt; page-break-inside: avoid; break-inside: avoid;">
 <div class="meta-label">Jebakan Ujian Umum</div>
 ${allTraps.map(trap => `
 <div class="pitfall-block" style="margin-top: 6pt;">
 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 4pt;">
 <div style="background-color: #fef2f2; border: 1px solid #fee2e2; padding: 7px; border-radius: 4px; font-size: 9pt;">
 <strong style="color: #991b1b; font-size: 7.5pt; text-transform: uppercase; display: block; margin-bottom: 2px;">Salah:</strong>
 <div>${preRenderMathInText(trap.wrong)}</div>
 </div>
 <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; padding: 7px; border-radius: 4px; font-size: 9pt;">
 <strong style="color: #166534; font-size: 7.5pt; text-transform: uppercase; display: block; margin-bottom: 2px;">Benar:</strong>
 <div>${preRenderMathInText(trap.correct)}</div>
 </div>
 </div>
 <div style="font-size: 8.5pt; color: #555555; line-height: 1.4;"><strong>Mengapa:</strong> ${preRenderMathInText(trap.why)}</div>
 </div>
 `).join("")}
 </div>
 `
 : "";

 // 7. Worked example (first example only)
 const firstExample = concept.examples[0];
 const exampleHtml = firstExample
 ? `
 <div style="margin-bottom: 10pt; page-break-inside: avoid; break-inside: avoid;">
 <div class="meta-label">Contoh Soal: ${firstExample.title}</div>
 <div style="padding-left: 10px; border-left: 2px solid #002B49; color: #333333; font-size: 9.5pt; text-align: justify; line-height: 1.5; margin-top: 4pt;">
 ${preRenderMathInText(firstExample.content)}
 </div>
 </div>
 `
 : "";

 // 8. Self-check checklist (per-concept items from chapter checklist)
 const conceptCheckItems = checklist?.items.filter(item =>
 item.toLowerCase().includes(concept.conceptName.toLowerCase())
 ) ?? [];
 const selfCheckHtml = conceptCheckItems.length > 0
 ? `
 <div style="margin-bottom: 8pt;">
 <div style="font-size: 8.5pt; color: #666666; font-weight: 700; text-transform: uppercase; margin-bottom: 3px;">Cek Diri</div>
 ${conceptCheckItems.map(item => `
 <div style="font-size: 9pt; color: #333333; margin-bottom: 2px;">[ ] ${preRenderMathInText(item)}</div>
 `).join("")}
 </div>
 `
 : "";

 return `
 <div class="entry-block" style="margin-bottom: 20pt;">
 ${headerHtml}
 ${summaryHtml}
 ${quickMethodHtml}
 ${formulasHtml}
 ${examPatternHtml}
 ${trapsHtml}
 ${exampleHtml}
 ${selfCheckHtml}
 </div>
 `;
 }).join("");

 // Chapter-level review checklist (all items)
 const chapterChecklistHtml = checklist && checklist.items.length > 0
 ? `
 <div style="margin-top: 20pt; background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 10px 14px; border-radius: 4px; page-break-inside: avoid; break-inside: avoid;">
 <div style="font-weight: 700; color: #002B49; font-size: 9pt; text-transform: uppercase; margin-bottom: 6px;">Checklist Review Bab: ${ch.title}</div>
 ${checklist.items.map(item => `<div style="font-size: 9.5pt; color: #333333; margin-bottom: 3px;">[ ] ${preRenderMathInText(item)}</div>`).join("")}
 </div>
 `
 : "";

 return `
 <div class="chapter-block" style="page-break-before: always; break-before: page;">
 <div style="font-size: 9pt; color: #FF6B35; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">BAB 0${chIdx + 1}</div>
 <h1 style="font-size: 20pt; border-bottom: 2px solid #000000; padding-bottom: 4px; margin-top: 2px; margin-bottom: 15pt; text-transform: uppercase; font-family: 'Lexend', sans-serif;">${ch.title}</h1>
 ${conceptsHtml}
 ${chapterChecklistHtml}
 </div>
 `;
 }).join("");

 // Appendix A ; Formula Handbook Summary (H-1 quick review)
 const hasFormulas = diktat.sections.formulaHandbook && diktat.sections.formulaHandbook.length > 0;
 const appendixFormulasHtml = hasFormulas
 ? `
 <div class="section-block" style="page-break-before: always; break-before: page;">
 <h2>Appendix A &mdash; Ringkasan Rumus Penting</h2>
 <p class="text-gray-700" style="margin-bottom: 15px; font-size: 10pt;">Gunakan ringkasan komparatif di bawah ini untuk review cepat rumus-rumus utama H-1 sebelum menempuh ujian:</p>
 <div style="margin-top: 15pt;">
 ${diktat.sections.formulaHandbook
 .map((f: FormulaHandbookEntry, idx: number) => {
 let renderedKatex = "";
 try {
 renderedKatex = katex.renderToString(f.latex.trim(), {
 displayMode: true,
 throwOnError: false,
 });
 } catch {
 renderedKatex = `<span style="color: #dc2626;">$$${f.latex}$$</span>`;
 }

 const paramSummary = f.parameters.length > 0
 ? `
 <div style="font-size: 8.5pt; color: #555555; margin-top: 4px;">
 <strong>Variabel:</strong> 
 ${f.parameters.map(p => `<span class="parameter-symbol" style="font-weight: 600;">${p.symbol}</span> (${p.name}${p.unit ? `, ${p.unit}` : ""})`).join(" &middot; ")}
 </div>
 `
 : "";

 return `
 <div style="margin-bottom: 12pt; page-break-inside: avoid; break-inside: avoid; border-bottom: 1px solid #eeeeee; padding-bottom: 8px;">
 <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 10pt;">
 <span>${f.title}</span>
 <span style="color: #666666; font-size: 8.5pt;">#${idx + 1}</span>
 </div>
 <div class="formula-display" style="margin: 4pt 0;">${renderedKatex}</div>
 ${paramSummary}
 </div>
 `;
 })
 .join("")}
 </div>
 </div>
 `
 : "";

 // Appendix B ; Pitfalls Compendium
 const hasMistakes = diktat.sections.commonMistakes && diktat.sections.commonMistakes.length > 0;
 const appendixMistakesHtml = hasMistakes
 ? `
 <div class="section-block" style="page-break-before: always; break-before: page;">
 <h2>Appendix B &mdash; Lembar Jebakan Ujian (Pitfalls)</h2>
 <p class="text-gray-700" style="margin-bottom: 15px; font-size: 10pt;">Berikut kompendium kesalahpahaman umum yang sering sengaja dikeluarkan sebagai jebakan dalam soal ujian:</p>
 <div style="margin-top: 15pt;">
 ${diktat.sections.commonMistakes
 .map(m => `
 <div class="pitfall-block" style="margin-bottom: 12pt; page-break-inside: avoid; break-inside: avoid;">
 <div class="pitfall-title" style="color: #991b1b; font-weight: 700; font-size: 10.5pt;">${m.title}</div>
 <div style="margin-top: 3pt; font-size: 9pt; line-height: 1.4;">
 ❌ <strong>Salah:</strong> <span style="color: #991b1b;">${preRenderMathInText(m.myth)}</span><br />
 ✅ <strong>Benar:</strong> <span style="color: #166534;">${preRenderMathInText(m.correction)}</span>
 </div>
 <div style="font-size: 8.5pt; color: #555555; margin-top: 3px;">
 <strong>Tips Menghindari:</strong> ${preRenderMathInText(m.rationale)}
 </div>
 </div>
 `).join("")}
 </div>
 </div>
 `
 : "";

 // Appendix C ; Reference Glossary (Filtered to remove duplicate concept definitions)
 const conceptNames = new Set(
 diktat.chapters.flatMap(ch => ch.concepts.map(c => c.conceptName.toLowerCase().trim()))
 );
 const filteredGlossary = diktat.sections.glossary.filter(
 g => !conceptNames.has(g.term.toLowerCase().trim())
 );
 const hasGlossary = filteredGlossary.length > 0;

 const glossaryHtml = hasGlossary
 ? `
 <div class="section-block" style="page-break-before: always; break-before: page;">
 <h2>Appendix C &mdash; Glosarium Istilah Tambahan</h2>
 <p class="text-gray-700" style="margin-bottom: 15px; font-size: 10pt;">Daftar istilah pembantu yang belum didefinisikan secara eksplisit di dalam bab utama:</p>
 <table class="glossary-table">
 <thead>
 <tr>
 <th style="width: 25%;">Istilah / Simbol</th>
 <th>Definisi Ringkas</th>
 </tr>
 </thead>
 <tbody>
 ${filteredGlossary
 .map(
 entry => `
 <tr>
 <td><strong>${entry.term}</strong></td>
 <td>${preRenderMathInText(entry.definition)}</td>
 </tr>
 `
 )
 .join("")}
 </tbody>
 </table>
 
 <div class="provenance-box">
 <strong>Provenance & Ingestion Compliance Log</strong><br />
 diktatHash: ${diktat.generationHash}<br />
 generatedAt: ${new Date().toISOString()}<br />
 complianceStatus: verified<br />
 renderedBy: Zyx PDF Compiler v1 (Textbook Layout Engine)
 </div>
 </div>
 `
 : "";

 return `
 <!DOCTYPE html>
 <html lang="en">
 <head>
 <meta charset="UTF-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 <meta name="zyx-provenance" content="hash=${diktat.generationHash}&date=${new Date().toISOString()}" />
 <title>${diktat.title}</title>
 <!-- KaTeX CSS CDN -->
 <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css" />
 <!-- Fonts -->
 <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@600;700&display=swap" rel="stylesheet" />
 <style>
 /* CSS Reset & General */
 @page {
 size: A4;
 margin: 20mm 15mm 20mm 15mm;
 }
 
 body {
 font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
 color: #111111;
 background: #ffffff;
 line-height: 1.5;
 font-size: 10.5pt;
 }
 
 /* Typography */
 h1, h2, h3, h4 {
 font-family: "Lexend", "Inter", sans-serif;
 color: #000000;
 font-weight: 700;
 margin-top: 0;
 page-break-after: avoid;
 break-after: avoid;
 }
 
 h1 {
 font-size: 24pt;
 line-height: 1.1;
 margin-bottom: 5px;
 }
 
 h2 {
 font-size: 14pt;
 border-bottom: 1.5px solid #000000;
 padding-bottom: 3px;
 margin-top: 25pt;
 margin-bottom: 12pt;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }
 
 h3 {
 font-size: 11pt;
 margin-top: 16pt;
 margin-bottom: 6pt;
 }
 
 h4 {
 font-size: 10pt;
 font-weight: 600;
 margin-top: 10pt;
 margin-bottom: 4pt;
 }
 
 p {
 margin-top: 0;
 margin-bottom: 8pt;
 text-align: justify;
 }
 
 /* Lists */
 ul, ol {
 margin-top: 0;
 margin-bottom: 8pt;
 padding-left: 20px;
 }
 
 li {
 margin-bottom: 3pt;
 }
 
 /* Flow Layout & Page Breaks */
 .section-block {
 margin-bottom: 20pt;
 }
 
 .entry-block {
 margin-bottom: 15pt;
 page-break-inside: avoid;
 break-inside: avoid;
 }
 
 /* Cover Page */
 .cover-page {
 height: 255mm;
 display: flex;
 flex-direction: column;
 justify-content: space-between;
 page-break-after: always;
 break-after: page;
 }
 
 /* Roadmap Page */
 .roadmap-page {
 height: 255mm;
 display: flex;
 flex-direction: column;
 justify-content: space-between;
 page-break-after: always;
 break-after: page;
 }
 
 .cover-header {
 margin-top: 50mm;
 border-bottom: 3px solid #000000;
 padding-bottom: 15px;
 }
 
 .cover-title {
 font-size: 28pt;
 font-weight: 800;
 line-height: 1.1;
 margin-bottom: 10px;
 }
 
 .cover-subtitle {
 font-size: 13pt;
 color: #FF6B35; /* Orange accent */
 font-weight: 600;
 text-transform: uppercase;
 letter-spacing: 1px;
 margin-bottom: 8px;
 }
 
 .cover-footer {
 margin-bottom: 20mm;
 font-size: 9pt;
 color: #555555;
 line-height: 1.6;
 }
 
 /* Formulas */
 .formula-title {
 font-size: 10.5pt;
 font-weight: 700;
 margin-bottom: 4pt;
 display: flex;
 justify-content: space-between;
 }
 
 .formula-display {
 margin: 10pt 0;
 text-align: center;
 position: relative;
 padding: 8pt 0;
 }
 
 .parameter-list {
 list-style-type: none;
 padding-left: 15px;
 margin-bottom: 8pt;
 }
 
 .parameter-item {
 margin-bottom: 2pt;
 text-indent: -15px;
 padding-left: 15px;
 font-size: 9.5pt;
 color: #333333;
 }
 
 .parameter-symbol {
 font-weight: 700;
 font-family: "Inter", sans-serif;
 color: #FF6B35; /* Orange */
 }
 
 .meta-label {
 font-size: 8.5pt;
 font-weight: 700;
 text-transform: uppercase;
 color: #666666;
 letter-spacing: 0.3px;
 margin-top: 6pt;
 margin-bottom: 2pt;
 }
 
 /* Common Pitfalls */
 .pitfall-block {
 border-left: 3px solid #dc2626; /* Red border */
 padding-left: 10pt;
 margin-bottom: 12pt;
 page-break-inside: avoid;
 break-inside: avoid;
 }
 
 .pitfall-title {
 font-weight: 700;
 color: #991b1b;
 margin-bottom: 3pt;
 }
 
 /* Reference Glossary */
 .glossary-table {
 width: 100%;
 border-collapse: collapse;
 margin-top: 10pt;
 }
 
 .glossary-table th, .glossary-table td {
 border: 1px solid #dddddd;
 padding: 6pt 8pt;
 text-align: left;
 font-size: 9.5pt;
 }
 
 .glossary-table th {
 background-color: #f5f5f5;
 font-weight: 700;
 }
 
 /* Provenance */
 .provenance-box {
 margin-top: 30pt;
 padding: 8pt;
 background-color: #f9f9f9;
 border: 1px solid #e3e3e3;
 font-family: monospace;
 font-size: 8pt;
 color: #666666;
 line-height: 1.4;
 }
 
 /* Exam Intelligence: Importance Stars Badge */
 .importance-badge {
 display: inline-block;
 font-size: 8pt;
 font-weight: 600;
 color: #d97706;
 background-color: #fffbeb;
 border: 1px solid #fde68a;
 border-radius: 4px;
 padding: 2px 6px;
 white-space: nowrap;
 margin-top: 2px;
 }

 /* Exam Intelligence: Quick Method */
 .quick-method {
 border-left: 3px solid #2563eb;
 background-color: #f0f7ff;
 }

 /* General Classes */
 .italic { font-style: italic; }
 .font-semibold { font-weight: 600; }
 .font-bold { font-weight: 700; }
 .text-black { color: #000000; }
 .text-gray-500 { color: #666666; }
 .text-gray-700 { color: #333333; }
 
 /* Math display adjustments */
 .math-block {
 margin: 8pt 0;
 }
 
 .math-inline {
 padding: 0 1px;
 }
 </style>
 </head>
 <body>
 <div style="max-w: 650pt; margin: 0 auto; padding: 0 10pt;">
 ${coverHtml}
 ${roadmapHtml}
 ${chaptersHtml}
 ${appendixFormulasHtml}
 ${appendixMistakesHtml}
 ${glossaryHtml}
 </div>
 </body>
 </html>
 `;
}
