#!/usr/bin/env python3
"""
Deterministic CRITIC Linter untuk skill `bahasa-ajar` (Indonesia - Gaya Tutor Sebaya).
Memeriksa aturan P0_HARD dan metrik P1_STRONG dari rules.yaml tanpa dependensi eksternal.

Penggunaan:
    python scripts/lint_bahasa_ajar.py path/to/draft.md
    python scripts/lint_bahasa_ajar.py --stdin < draft.md

Exit codes:
    0 : Nol pelanggaran P0_HARD (warning P1_STRONG tetap dilaporkan di JSON).
    1 : Terdapat minimal satu pelanggaran P0_HARD yang wajib diperbaiki.
    2 : Argumen atau berkas tidak valid.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


INTRACLAUSE_START_WORDS = [
    "Sehingga",
    "Sedangkan",
    "Agar",
    "Serta",
    "Melainkan",
]

STACKED_CONJUNCTIONS = [
    "selain itu juga",
    "namun sebaliknya",
    "tetapi namun",
    "sehabis kemudian",
    "lalu kemudian",
    "disebabkan karena",
    "dikarenakan oleh",
    "agar supaya",
    "demi untuk",
    "sehingga menyebabkan",
]

PLEONASM_PHRASES = [
    "bertujuan untuk",
    "dikarenakan",
    "adalah merupakan",
    "hanya sekadar",
    "sangat sekali",
    "dimana",
    "di mana",
]

STIFF_TEXTBOOK_PHRASES = [
    "ialah",
    "yakni",
    "bahwasanya",
    "adapun",
    "berdasarkan hal tersebut",
    "tersebut di atas",
    "oleh sebab itu maka",
    "pada keluaran",
    "pembacaan semu",
]

CONDESCENDING_PHRASES = [
    "gampang banget",
    "mudah sekali",
    "sudah jelas",
    "tinggal masukkan saja",
    "tinggal gini doang",
]

DANGLING_INI_RE = re.compile(
    r"^(Ini|Itu)\s+(adalah|merupakan|membuktikan|menunjukkan|berarti|menyebabkan|membuat|terjadi|disebabkan|setara)\b"
)

TARGET_PRONOUNS = {"kamu", "kalian", "kita", "anda"}
CONVERSATIONAL_BRIDGES = {
    "nah",
    "jadi",
    "coba",
    "bayangkan",
    "kalau",
    "artinya",
    "hati-hati",
    "harusnya",
    "menurut",
    "singkatnya",
    "misalnya",
}
VOWELS = set("aiueoAIUEO")


def strip_non_prose(markdown: str) -> str:
    """Hapus blok kode berpagar, inline code, dan heading/tabel dekoratif untuk analisis prosa."""
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
        r"\b(dkk|dll|dsb|dst|No|Hal|Dr|Prof|Sdr|Yth|a\.n|u\.p)\.",
        r"\1<DOT>",
        normalized,
    )
    parts = re.split(r"(?<=[.!?])\s+", protected)
    return [p.replace("<DOT>", ".").strip() for p in parts if p.strip()]


def tokenize_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:-[A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*", text)


def estimate_indonesian_syllables(word: str) -> int:
    """Estimasi suku kata bahasa Indonesia berbasis gugus vokal."""
    w = word.lower()
    if not any(ch in VOWELS for ch in w):
        return 1
    w = re.sub(r"(ai|au|oi|ei)", "a", w)
    groups = re.findall(r"[aiueo]+", w)
    return max(1, len(groups))


def lint_text(raw_text: str) -> dict[str, Any]:
    p0_issues: list[dict[str, Any]] = []
    p1_warnings: list[dict[str, Any]] = []

    # 1. P0: Cek em/en dash pada teks asli (di luar code block)
    no_code = re.sub(r"```[\s\S]*?```", "", raw_text)
    for m in re.finditer(r"[\u2013\u2014]", no_code):
        snippet_start = max(0, m.start() - 25)
        snippet_end = min(len(no_code), m.end() + 25)
        p0_issues.append(
            {
                "rule_id": "STYLE.PUNCT.NO_LONG_DASHES",
                "severity": "P0_HARD",
                "char_pos": m.start(),
                "excerpt": no_code[snippet_start:snippet_end].replace("\n", " "),
                "repair": "Ganti em/en dash dengan koma, tanda kurung, titik dua, atau kata 'sampai'.",
            }
        )

    prose = strip_non_prose(raw_text)
    paragraphs = split_paragraphs(prose)

    all_sentences: list[str] = []
    all_words: list[str] = []
    sentence_lengths: list[int] = []
    total_syllables = 0
    target_pronoun_count = 0
    bridge_count = 0
    question_count = 0

    global_sent_idx = 0
    for p_idx, para in enumerate(paragraphs, 1):
        para_words = tokenize_words(para)
        if len(para_words) > 130:
            p1_warnings.append(
                {
                    "rule_id": "ID.PARAGRAPH.FOCUSED_LENGTH",
                    "severity": "P1_STRONG",
                    "paragraph_idx": p_idx,
                    "word_count": len(para_words),
                    "msg": f"Paragraf {p_idx} sepanjang {len(para_words)} kata (target 50-120 kata).",
                    "repair": "Pecah menjadi dua paragraf agar lebih lega dibaca.",
                }
            )

        sentences = split_sentences(para)
        for sent in sentences:
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

            for w in words:
                lw = w.lower()
                total_syllables += estimate_indonesian_syllables(lw)
                if lw in TARGET_PRONOUNS:
                    target_pronoun_count += 1
                if lw in CONVERSATIONAL_BRIDGES:
                    bridge_count += 1

            # 2. P0: Konjungsi intrakalimat di awal kalimat
            first_word = words[0]
            if first_word in INTRACLAUSE_START_WORDS:
                p0_issues.append(
                    {
                        "rule_id": "ID.COHESION.INTRACLAUSE_START",
                        "severity": "P0_HARD",
                        "sentence_idx": global_sent_idx,
                        "excerpt": sent[:100],
                        "repair": f"Konjungsi intrakalimat '{first_word}' tidak boleh di awal kalimat. Gabungkan atau ganti dengan jembatan alami ('Jadi,', 'Akibatnya,').",
                    }
                )
            elif first_word == "Karena" and "," not in sent:
                p0_issues.append(
                    {
                        "rule_id": "ID.COHESION.INTRACLAUSE_START",
                        "severity": "P0_HARD",
                        "sentence_idx": global_sent_idx,
                        "excerpt": sent[:100],
                        "repair": "Kalimat diawali 'Karena' tanpa klausa induk (fragmen). Gabungkan ke kalimat sebelumnya atau lengkapi dengan koma + klausa induk.",
                    }
                )

            # 3. P0: Konjungsi bertumpuk
            for phrase in STACKED_CONJUNCTIONS:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p0_issues.append(
                        {
                            "rule_id": "ID.COHESION.NO_STACKED_CONJUNCTION",
                            "severity": "P0_HARD",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Hapus penumpukan konjungsi '{phrase}'; pilih satu konjungsi yang tepat.",
                        }
                    )

            # 4. P0: Pleonasme & diksi terlarang
            for phrase in PLEONASM_PHRASES:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p0_issues.append(
                        {
                            "rule_id": "ID.LEXICON.NO_PLEONASM",
                            "severity": "P0_HARD",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Ganti frasa tidak efektif '{phrase}' dengan bentuk ringkas yang wajar.",
                        }
                    )

            # 5. P0: Rujukan 'Ini'/'Itu' menggantung di awal kalimat
            if DANGLING_INI_RE.match(sent):
                p0_issues.append(
                    {
                        "rule_id": "ID.COHESION.NO_DANGLING_INI",
                        "severity": "P0_HARD",
                        "sentence_idx": global_sent_idx,
                        "excerpt": sent[:100],
                        "repair": "Tambahkan nomina perangkum setelah 'Ini'/'Itu', misalnya 'Hal ini ...' atau 'Angka ini ...'.",
                    }
                )

            # 6. P1: Diksi diktat kaku
            for phrase in STIFF_TEXTBOOK_PHRASES:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p1_warnings.append(
                        {
                            "rule_id": "ID.STYLE.NO_STIFF_TEXTBOOK_DICTION",
                            "severity": "P1_STRONG",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Frasa '{phrase}' terasa kaku seperti diktat; ganti dengan bahasa tutur tutor sebaya yang lebih mengalir.",
                        }
                    )

            # 7. P1: Kata meremehkan kesulitan pembaca
            for phrase in CONDESCENDING_PHRASES:
                if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
                    p1_warnings.append(
                        {
                            "rule_id": "ID.POV.PEER_TUTOR_VOICE",
                            "severity": "P1_STRONG",
                            "sentence_idx": global_sent_idx,
                            "match": phrase,
                            "excerpt": sent[:100],
                            "repair": f"Hindari frasa meremehkan '{phrase}'; tunjukkan langkah bantu nyatanya.",
                        }
                    )

            # 8. P1: Panjang kalimat keras (> 22 kata)
            if len(words) > 22:
                p1_warnings.append(
                    {
                        "rule_id": "ID.SYNTAX.SENTENCE_LENGTH",
                        "severity": "P1_STRONG",
                        "sentence_idx": global_sent_idx,
                        "word_count": len(words),
                        "excerpt": sent[:110],
                        "repair": "Pecah kalimat panjang (>22 kata) menjadi dua kalimat aktif pendek (target rerata <=16 kata).",
                    }
                )

    total_words = len(all_words)
    mean_sent_len = round(sum(sentence_lengths) / len(sentence_lengths), 2) if sentence_lengths else 0.0
    max_sent_len = max(sentence_lengths) if sentence_lengths else 0
    pronoun_ratio = round(target_pronoun_count / total_words, 4) if total_words else 0.0
    fry_syllables_per_100 = round((total_syllables / total_words) * 100 * 0.6, 1) if total_words else 0.0

    if mean_sent_len > 16.0:
        p1_warnings.append(
            {
                "rule_id": "ID.SYNTAX.SENTENCE_LENGTH",
                "severity": "P1_STRONG",
                "mean_words": mean_sent_len,
                "msg": f"Rerata panjang kalimat {mean_sent_len} kata (target <= 16 kata).",
                "repair": "Pecah beberapa kalimat panjang agar lebih enak dibaca dalam satu tarikan napas.",
            }
        )

    if total_words >= 70 and pronoun_ratio < 0.015:
        p1_warnings.append(
            {
                "rule_id": "ID.POV.PEER_TUTOR_VOICE",
                "severity": "P1_STRONG",
                "pronoun_ratio": pronoun_ratio,
                "msg": f"Rasio sapaan 'kamu'/'kalian'/'kita' rendah ({pronoun_ratio:.2%}; target >= 1,5%).",
                "repair": "Sapa pembaca langsung ('kamu'/'kalian'/'kita') agar terasa seperti sedang mengajari teman sebaya.",
            }
        )

    if total_words >= 80 and bridge_count == 0 and question_count == 0:
        p1_warnings.append(
            {
                "rule_id": "ID.POV.PEER_TUTOR_VOICE",
                "severity": "P1_STRONG",
                "msg": "Tidak ditemukan jembatan percakapan ('Nah,', 'Jadi,', 'Coba', 'Kalau...', 'Hati-hati') atau pertanyaan pelibat.",
                "repair": "Tambahkan jembatan obrolan alami atau satu pertanyaan pemantik agar teks tidak terasa seperti diktat dingin.",
            }
        )

    return {
        "language": "id",
        "status": "PASS" if not p0_issues else "FAIL_P0",
        "metrics": {
            "paragraphs": len(paragraphs),
            "sentences": len(all_sentences),
            "words": total_words,
            "mean_sentence_words": mean_sent_len,
            "max_sentence_words": max_sent_len,
            "tutor_pronoun_count": target_pronoun_count,
            "tutor_pronoun_ratio": pronoun_ratio,
            "conversational_bridge_count": bridge_count,
            "engaging_question_count": question_count,
            "fry_adjusted_syllables_per_100": fry_syllables_per_100,
        },
        "p0_issue_count": len(p0_issues),
        "p1_warning_count": len(p1_warnings),
        "p0_issues": p0_issues,
        "p1_warnings": p1_warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="CRITIC linter untuk skill bahasa-ajar (Indonesia - Gaya Tutor Sebaya).")
    parser.add_argument("file", nargs="?", help="Path ke berkas teks/Markdown yang diaudit.")
    parser.add_argument("--stdin", action="store_true", help="Baca teks dari stdin.")
    args = parser.parse_args()

    if args.stdin:
        raw_text = sys.stdin.read()
    elif args.file:
        path = Path(args.file)
        if not path.is_file():
            print(json.dumps({"error": f"File tidak ditemukan: {args.file}"}), file=sys.stderr)
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
