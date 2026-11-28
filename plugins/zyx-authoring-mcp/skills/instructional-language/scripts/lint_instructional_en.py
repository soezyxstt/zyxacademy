#!/usr/bin/env python3
"""
Deterministic CRITIC Linter for `instructional-language` (English Peer-Tutor Instructional Prose).
Checks P0_HARD rules and P1_STRONG metrics from rules.yaml with zero external dependencies.

Usage:
    python scripts/lint_instructional_en.py path/to/draft.md
    python scripts/lint_instructional_en.py --stdin < draft.md

Exit codes:
    0 : Zero P0_HARD violations (P1_STRONG warnings still reported in JSON).
    1 : One or more P0_HARD violations found (must be repaired).
    2 : Invalid CLI arguments or missing file.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


BUREAUCRATIC_FILLERS = [
    "in order to",
    "due to the fact that",
    "at this point in time",
    "for the purpose of",
    "in the event that",
    "utilize",
    "utilization",
    "make a decision",
    "conduct an investigation",
    "the implementation of",
    "a reduction in",
    "the utilization of",
]

ADDITIVE_BLOAT = [
    "furthermore",
    "moreover",
    "in addition to this",
    "additionally",
]

STIFF_TEXTBOOK_PHRASES = [
    "one must",
    "the student should",
    "the student must",
    "it should be noted that",
    "it is important to note that",
    "herein",
    "thereby",
    "aforementioned",
    "constitutes",
    "with respect to",
    "pertaining to",
]

CONDESCENDING_PHRASES = [
    "obviously",
    "trivially",
    "super easy",
    "just plug it in",
    "as is well known",
]

DANGLING_DEMONSTRATIVE_RE = re.compile(
    r"^(This|These|That|Those)\s+"
    r"(is|are|was|were|shows|show|proves|prove|means|mean|causes|cause|"
    r"leads|lead|creates|create|makes|make|occurs|occur|happens|happen|"
    r"explains|explain|indicates|indicate|suggests|suggest|can|will|may|might)\b"
)

IRREGULAR_PARTICIPLES = (
    "broken|built|chosen|done|drawn|driven|eaten|fallen|found|given|gone|"
    "grown|held|kept|known|led|left|made|meant|paid|put|read|run|said|seen|"
    "sent|set|shown|sold|spent|spoken|taken|taught|told|thought|understood|written"
)
PASSIVE_HEURISTIC_RE = re.compile(
    rf"\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(?:[a-z]+ed|{IRREGULAR_PARTICIPLES})\b",
    re.IGNORECASE,
)

CONTRACTION_RE = re.compile(
    r"\b(?:it's|that's|here's|there's|what's|don't|doesn't|didn't|can't|won't|"
    r"isn't|aren't|wasn't|weren't|you're|you'll|you've|we're|we'll|we've|let's)\b",
    re.IGNORECASE,
)

CONVERSATIONAL_PRONOUNS = {"you", "your", "yourself", "we", "our", "ourselves", "us", "let's", "you're", "you'll", "you've", "we're", "we'll", "we've"}
CONVERSATIONAL_BRIDGE_RE = re.compile(
    r"\b(?:now,|so,|say,|picture|imagine|watch out|here's the catch|in plain terms|once we|from there|notice how)\b",
    re.IGNORECASE,
)


def count_bold_words(raw_markdown: str) -> int:
    """Count words inside **bold** or __bold__ spans outside fenced code blocks."""
    no_code = re.sub(r"```[\s\S]*?```", "", raw_markdown)
    no_code = re.sub(r"`[^`\n]+`", "", no_code)
    bold_spans = re.findall(r"\*\*([^*\n]+)\*\*|__([^_\n]+)__", no_code)
    total = 0
    for g1, g2 in bold_spans:
        span = g1 or g2
        total += len(tokenize_words(span))
    return total


def strip_non_prose(markdown: str) -> str:
    """Remove fenced code blocks, inline code, headings, and markdown tables for prose analysis."""
    text = re.sub(r"```[\s\S]*?```", "\n", markdown)
    text = re.sub(r"`[^`\n]+`", "CODE", text)
    lines = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        if line.startswith("#") or line.startswith("|") or re.match(r"^[-*_]{3,}$", line):
            lines.append("")
            continue
        line = re.sub(r"^(\s*[-*+]\s+|\s*\d+\.\s+|>\s*)+", "", line)
        line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
        line = re.sub(r"[*_~]+", "", line)
        lines.append(line)
    return "\n".join(lines)


def split_paragraphs(prose: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", prose) if p.strip()]


def split_sentences(paragraph: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", paragraph).strip()
    if not normalized:
        return []
    protected = re.sub(
        r"\b(e\.g|i\.e|et al|Dr|Prof|Mr|Mrs|Ms|Fig|Eq|Sec|vs)\.",
        r"\1<DOT>",
        normalized,
    )
    parts = re.split(r"(?<=[.!?])\s+", protected)
    return [p.replace("<DOT>", ".").strip() for p in parts if p.strip()]


def tokenize_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*", text)


def lint_text(raw_text: str) -> dict[str, Any]:
    p0_issues: list[dict[str, Any]] = []
    p1_warnings: list[dict[str, Any]] = []

    # 1. P0: Zero em/en dashes outside code blocks
    no_code = re.sub(r"```[\s\S]*?```", "", raw_text)
    for m in re.finditer(r"[\u2013\u2014]", no_code):
        start = max(0, m.start() - 25)
        end = min(len(no_code), m.end() + 25)
        p0_issues.append(
            {
                "rule_id": "STYLE.PUNCT.NO_LONG_DASHES",
                "severity": "P0_HARD",
                "char_pos": m.start(),
                "excerpt": no_code[start:end].replace("\n", " "),
                "repair": "Replace em/en dash with commas, parentheses, colons, or 'to'.",
            }
        )

    bold_words = count_bold_words(raw_text)
    prose = strip_non_prose(raw_text)
    paragraphs = split_paragraphs(prose)

    all_sentences: list[str] = []
    all_words: list[str] = []
    sentence_lengths: list[int] = []
    passive_sentences: list[int] = []
    pronoun_count = 0
    contraction_count = 0
    bridge_count = 0
    question_count = 0

    global_sent_idx = 0
    for p_idx, para in enumerate(paragraphs, 1):
        para_words = tokenize_words(para)
        if len(para_words) > 135:
            p1_warnings.append(
                {
                    "rule_id": "EN.PARAGRAPH.DEDUCTIVE_LENGTH",
                    "severity": "P1_STRONG",
                    "paragraph_idx": p_idx,
                    "word_count": len(para_words),
                    "msg": f"Paragraph {p_idx} has {len(para_words)} words (target 70-120 words).",
                    "repair": "Split into two focused 1-idea paragraphs.",
                }
            )

        for sent in split_sentences(para):
            global_sent_idx += 1
            all_sentences.append(sent)
            if sent.endswith("?"):
                question_count += 1
            words = tokenize_words(sent)
            if not words:
                continue
            all_words.extend(words)
            sentence_lengths.append(len(words))
            lower_sent = sent.lower()

            contraction_count += len(CONTRACTION_RE.findall(sent))
            bridge_count += len(CONVERSATIONAL_BRIDGE_RE.findall(sent))
            for w in words:
                if w.lower() in CONVERSATIONAL_PRONOUNS:
                    pronoun_count += 1

            # 2. P0: Dangling demonstrative at sentence start (allow natural conversational "That means...")
            if DANGLING_DEMONSTRATIVE_RE.match(sent) and not sent.startswith("That means "):
                p0_issues.append(
                    {
                        "rule_id": "EN.COHESION.NO_DANGLING_DEMONSTRATIVE",
                        "severity": "P0_HARD",
                        "sentence_idx": global_sent_idx,
                        "excerpt": sent[:100],
                        "repair": "Add a summary noun after 'This'/'These'/'That'/'Those' (e.g., 'This shift shows...').",
                    }
                )

            # 3. P0: Bureaucratic fillers & hidden-verb nominalizations
            for phrase in BUREAUCRATIC_FILLERS:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p0_issues.append(
                        {
                            "rule_id": "EN.LEXICON.NO_BUREAUCRATIC_FILLER",
                            "severity": "P0_HARD",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Replace wordy phrase '{phrase}' with a concise active verb or plain connective.",
                        }
                    )

            # 4. P0: Additive connective bloat
            for phrase in ADDITIVE_BLOAT:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p0_issues.append(
                        {
                            "rule_id": "EN.COHESION.NO_ADDITIVE_BLOAT",
                            "severity": "P0_HARD",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Remove additive filler '{phrase}' or replace with a causal/contrastive connective.",
                        }
                    )

            # 5. P1: Stiff textbook phrasing
            for phrase in STIFF_TEXTBOOK_PHRASES:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p1_warnings.append(
                        {
                            "rule_id": "EN.STYLE.NO_STIFF_TEXTBOOK_PHRASING",
                            "severity": "P1_STRONG",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Phrase '{phrase}' sounds like a stiff textbook; rewrite in warm peer-tutor prose.",
                        }
                    )

            # 6. P1: Condescending phrases
            for phrase in CONDESCENDING_PHRASES:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p1_warnings.append(
                        {
                            "rule_id": "EN.POV.PEER_TUTOR_VOICE",
                            "severity": "P1_STRONG",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Remove dismissive phrase '{phrase}' and show the concrete step instead.",
                        }
                    )

            # 7. P1: Hard max sentence length (> 28 words)
            if len(words) > 28:
                p1_warnings.append(
                    {
                        "rule_id": "EN.SYNTAX.SENTENCE_LENGTH",
                        "severity": "P1_STRONG",
                        "sentence_idx": global_sent_idx,
                        "word_count": len(words),
                        "excerpt": sent[:115],
                        "repair": "Split sentence (>28 words) into two crisp active sentences.",
                    }
                )

            # 8. P1: Passive voice heuristic
            if PASSIVE_HEURISTIC_RE.search(sent):
                passive_sentences.append(global_sent_idx)

    total_words = len(all_words)
    total_sentences = len(all_sentences)
    mean_sent_len = round(sum(sentence_lengths) / len(sentence_lengths), 2) if sentence_lengths else 0.0
    max_sent_len = max(sentence_lengths) if sentence_lengths else 0
    passive_ratio = round(len(passive_sentences) / total_sentences, 3) if total_sentences else 0.0
    pronoun_ratio = round(pronoun_count / total_words, 4) if total_words else 0.0
    bold_ratio = round(bold_words / total_words, 4) if total_words else 0.0

    if mean_sent_len > 22.0:
        p1_warnings.append(
            {
                "rule_id": "EN.SYNTAX.SENTENCE_LENGTH",
                "severity": "P1_STRONG",
                "mean_words": mean_sent_len,
                "msg": f"Mean sentence length is {mean_sent_len} words (target <= 22 words).",
                "repair": "Break compound or center-embedded sentences into shorter active clauses.",
            }
        )

    if total_sentences >= 5 and passive_ratio > 0.20:
        p1_warnings.append(
            {
                "rule_id": "EN.SYNTAX.ACTIVE_VOICE",
                "severity": "P1_STRONG",
                "passive_ratio": passive_ratio,
                "sentence_indices": passive_sentences[:10],
                "msg": f"Estimated passive voice ratio is {passive_ratio:.1%} (target <= 20%).",
                "repair": "Rewrite passive clauses with an explicit agent in the subject slot.",
            }
        )

    if total_words >= 70 and pronoun_ratio < 0.015:
        p1_warnings.append(
            {
                "rule_id": "EN.POV.PEER_TUTOR_VOICE",
                "severity": "P1_STRONG",
                "pronoun_ratio": pronoun_ratio,
                "msg": f"Conversational pronoun ('you'/'we') ratio is {pronoun_ratio:.2%} (target >= 1.5%).",
                "repair": "Address the reader directly with 'you'/'we' as a peer tutor.",
            }
        )

    if total_words >= 80 and bridge_count == 0 and question_count == 0 and contraction_count == 0:
        p1_warnings.append(
            {
                "rule_id": "EN.POV.PEER_TUTOR_VOICE",
                "severity": "P1_STRONG",
                "msg": "No conversational bridges ('Now,', 'Picture...', 'Watch out'), check-in questions, or natural contractions found.",
                "repair": "Warm up the voice with natural contractions and a conversational bridge or check-in question.",
            }
        )

    if total_words >= 50 and bold_ratio > 0.20:
        p1_warnings.append(
            {
                "rule_id": "EN.FORMAT.SELECTIVE_SIGNALING",
                "severity": "P1_STRONG",
                "bold_ratio": bold_ratio,
                "msg": f"Bold signaling covers {bold_ratio:.1%} of prose words (target <= 20%).",
                "repair": "Keep bold formatting selective for core terms on first introduction and key anchors.",
            }
        )

    return {
        "language": "en",
        "status": "PASS" if not p0_issues else "FAIL_P0",
        "metrics": {
            "paragraphs": len(paragraphs),
            "sentences": total_sentences,
            "words": total_words,
            "mean_sentence_words": mean_sent_len,
            "max_sentence_words": max_sent_len,
            "passive_sentence_count": len(passive_sentences),
            "passive_sentence_ratio": passive_ratio,
            "conversational_pronoun_count": pronoun_count,
            "conversational_pronoun_ratio": pronoun_ratio,
            "contraction_count": contraction_count,
            "conversational_bridge_count": bridge_count,
            "engaging_question_count": question_count,
            "bold_word_ratio": bold_ratio,
        },
        "p0_issue_count": len(p0_issues),
        "p1_warning_count": len(p1_warnings),
        "p0_issues": p0_issues,
        "p1_warnings": p1_warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="CRITIC linter for instructional-language (English peer-tutor prose).")
    parser.add_argument("file", nargs="?", help="Path to the text/Markdown file to audit.")
    parser.add_argument("--stdin", action="store_true", help="Read text from stdin.")
    args = parser.parse_args()

    if args.stdin:
        raw_text = sys.stdin.read()
    elif args.file:
        path = Path(args.file)
        if not path.is_file():
            print(json.dumps({"error": f"File not found: {args.file}"}), file=sys.stderr)
            return 2
        raw_text = path.read_text(encoding="utf-8")
    else:
        parser.print_help(sys.stderr)
        return 2

    report = lint_text(raw_text)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["p0_issue_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
