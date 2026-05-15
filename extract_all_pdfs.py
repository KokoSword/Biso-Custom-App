# -*- coding: utf-8 -*-
"""Extract questions from all PDFs; tag by lecture (1–21 from comprehensive guide)."""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

QUIZ_DIR = Path(r"e:\quiz")

LECTURE_NAMES = {
    1: "Lecture 1 — Endocrinology",
    2: "Lecture 2 — Cardiovascular diseases",
    3: "Lecture 3 — AIDS & HIV",
    4: "Lecture 4 — Pulmonary diseases",
    5: "Lecture 5 — CNS disorders",
    6: "Lecture 6 — Chemotherapy & radiotherapy",
    7: "Lecture 7 — Liver disease",
    8: "Lecture 8 — Pregnancy & lactation",
    9: "Lecture 9 — Rheumatologic & connective tissue",
    10: "Lecture 10 — Chronic kidney disease",
    11: "Lecture 11 — Allergy",
    12: "Lecture 12 — Biopsy",
    13: "Lecture 13 — Flaps, suturing & difficult extraction",
    14: "Lecture 14 — Osteomyelitis & osteonecrosis",
    15: "Lecture 15 — Diagnostic imaging",
    16: "Lecture 16 — Odontogenic infections & facial spaces",
    17: "Lecture 17 — Impacted teeth",
    18: "Lecture 18 — Bleeding disorders",
    19: "Lecture 19 — Dental implants",
    20: "Lecture 20 — Endodontic surgery",
    21: "Lecture 21 — Surgical aids to orthodontics",
}

# Map topic headers in MCQs PDF → lecture id
TOPIC_TO_LECTURE = [
    (r"bleeding\s+disorder|hemophilia|platelet|anticoagulant|coagulation", 18),
    (r"endocrin|diabetes|thyroid|adrenal|parathyroid|pituitary", 1),
    (r"cardiac|heart|angina|endocarditis|warfarin|aspirin|hypertension|inr", 2),
    (r"\bhiv\b|aids|cd4|antiretroviral", 3),
    (r"pulmonary|asthma|respiratory|bronch", 4),
    (r"\bcns\b|epilep|parkinson|seizure|trigeminal neuralgia|stroke", 5),
    (r"chemotherapy|radiotherapy|radiation|orn\b|mronj|bisphosphonate", 6),
    (r"hepatitis|liver|cirrhosis", 7),
    (r"pregnan|lactation", 8),
    (r"rheumat|lupus|connective tissue", 9),
    (r"kidney|renal|dialysis|ckd", 10),
    (r"allerg|anaphylaxis", 11),
    (r"biopsy|fnac|fine needle", 12),
    (r"flap|sutur|envelope flap|difficult extraction", 13),
    (r"osteomyelitis|osteonecrosis|bisphosphonate-related", 14),
    (r"radiograph|cbct|imaging|tomography|cephalometric|panoramic|opg", 15),
    (r"ludwig|facial space|odontogenic infection|pericoronitis|cellulitis", 16),
    (r"impacted|third molar|distoangular|mesioangular", 17),
    (r"implant|osseointegration|branemark", 19),
    (r"apicoectomy|retrograde|endodontic surgery", 20),
    (r"orthodont|corticotomy|frenectomy|tad\b|orthognathic", 21),
    (r"exodontia|extraction|dry socket|elevator|forceps", 13),
    (r"infection|abscess", 16),
    (r"cyst|odontogenic keratocyst", 16),
    (r"tmj|temporomandibular", 16),
    (r"fracture|mandibular fracture|zygomatic", 16),
]


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return " ".join(s.split())[:100]


def js_escape(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", " ")
        .replace("\r", "")
    )


def read_pdf(path: Path) -> str:
    return "\n\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)


def letter_to_index(letter: str) -> int:
    return ord(letter.upper()) - ord("A")


def parse_answer_key(text: str) -> dict[int, int]:
    """Parse Q→answer index from answer-key tables (pages 45+)."""
    answers: dict[int, int] = {}
    # Only scan answer-key region
    key_region = text
    if "Answer Key" in text or "Q Ans" in text:
        idx = text.find("Table 6")
        if idx == -1:
            idx = text.find("Q Ans")
        if idx != -1:
            key_region = text[idx:]

    for num_s, letter in re.findall(r"\b(\d{1,3})\s+([A-E])\b", key_region):
        n = int(num_s)
        if 1 <= n <= 520:
            answers[n] = letter_to_index(letter)
    return answers


def parse_comprehensive_questions(text: str, answers: dict[int, int]) -> list[dict]:
    questions: list[dict] = []
    current_lecture = 1

    # Split by lecture headers
    parts = re.split(
        r"MCQs\s*[^\n]*LECTURE\s+(\d+)\s*:\s*([^\n(]+)",
        text,
        flags=re.I,
    )

    # parts[0] is preamble; then triples (num, title, content)
    i = 1
    while i < len(parts) - 2:
        lec_num = int(parts[i])
        # title = parts[i + 1]
        content = parts[i + 2]
        current_lecture = lec_num
        i += 3

        q_blocks = re.split(r"(?<=\?)\s*(?=Q\d+\.)|(?<=\?)\s*(?=Q\d+\s)", content)
        if not q_blocks:
            q_blocks = re.split(r"\bQ(\d+)\.", content)

        for block in re.split(r"\bQ(\d+)\.", content):
            if not block.strip():
                continue

        for m in re.finditer(
            r"Q(\d+)\.\s*(.+?)(?=\bQ\d+\.|MCQs\s|Answer Key|Table \d|SECTION [A-Z]|Quick Review|END OF COMPREHENSIVE|$)",
            content,
            re.S | re.I,
        ):
            qnum = int(m.group(1))
            block = m.group(2).strip()
            block = re.sub(r"\s+", " ", block)

            opt_parts = re.split(r"\s+([A-E])\.\s+", block)
            if len(opt_parts) < 3:
                continue

            q_text = opt_parts[0].strip()
            opts = []
            for j in range(1, len(opt_parts) - 1, 2):
                if j + 1 < len(opt_parts):
                    opt_text = opt_parts[j + 1].strip()
                    # trim if next option letter leaked
                    opt_text = re.split(r"\s+[A-E]\.\s+", opt_text)[0].strip()
                    if opt_text:
                        opts.append(opt_text)

            if len(q_text) < 15 or len(opts) < 2:
                continue

            ans = answers.get(qnum, 0)
            if ans >= len(opts):
                ans = 0

            questions.append(
                {
                    "q": q_text,
                    "opts": opts[:5],
                    "ans": ans,
                    "lecture": current_lecture,
                    "source": "comprehensive",
                    "qid": qnum,
                }
            )

    return questions


def parse_comprehensive(path: Path) -> list[dict]:
    text = read_pdf(path)
    answers = parse_answer_key(text)
    qs = parse_comprehensive_questions(text, answers)
    print(f"  comprehensive: {len(qs)} questions, {len(answers)} answers in key")
    return qs


def detect_lecture_from_line(line: str) -> int | None:
    chunk = line[:100].lower()
    for pattern, lec in TOPIC_TO_LECTURE:
        if re.search(pattern, chunk, re.I):
            return lec
    return None


def parse_standard_pdf(text: str, source: str) -> list[dict]:
    text = re.sub(r"\r", "", text)
    current_lecture = 1
    questions: list[dict] = []

    parts = re.split(
        r"(?:Correct\s+[Aa]nswer\s+is|Correct\s+answer\s+is|Answer)\s*:\s*([A-Ea-e])\b",
        text,
        flags=re.I,
    )

    for i in range(1, len(parts), 2):
        ans_letter = parts[i].strip().upper()
        if ans_letter not in "ABCDE":
            continue
        block = parts[i - 1]

        for line in block.split("\n"):
            line_s = line.strip()
            if len(line_s) < 90 and not re.match(r"^\d+[\.\)]", line_s):
                lec = detect_lecture_from_line(line_s)
                if lec:
                    current_lecture = lec

        nums = list(re.finditer(r"(?:^|\n)\s*(\d+)[\.\)]\s+", block))
        if not nums:
            continue
        q_block = block[nums[-1].start() :]

        opt_matches = list(
            re.finditer(
                r"(?:^|\n)\s*([A-Ea-e])[\.\)]\s+(.+?)(?=(?:\n\s*[A-Ea-e][\.\)]\s+)|$)",
                q_block,
                re.S | re.I,
            )
        )
        if len(opt_matches) < 2:
            continue

        q_text = q_block[: opt_matches[0].start()]
        q_text = re.sub(r"^\d+[\.\)]\s*", "", q_text, flags=re.M)
        q_text = re.sub(r"\s+", " ", q_text).strip()
        q_text = re.sub(r"\(20\d{2}[^)]*\)", "", q_text).strip()
        q_text = re.sub(r"Dr\.?\s*Cube.*", "", q_text, flags=re.I).strip()
        q_text = re.sub(r"Oral Surgery.*4th Stage.*", "", q_text, flags=re.I).strip()
        q_text = re.sub(r"Page \d+ of \d+.*", "", q_text, flags=re.I).strip()

        if len(q_text) < 20:
            continue

        opts = [re.sub(r"\s+", " ", om.group(2)).strip() for om in opt_matches]
        ans_idx = letter_to_index(ans_letter)
        if ans_idx >= len(opts):
            ans_idx = min(ans_idx, len(opts) - 1)

        lec = infer_lecture(q_text) or current_lecture
        questions.append(
            {
                "q": q_text,
                "opts": opts[:5],
                "ans": ans_idx,
                "lecture": lec,
                "source": source,
            }
        )

    return questions


def infer_lecture(q: str) -> int | None:
    ql = q.lower()
    best_lec, best_score = None, 0
    for pattern, lec in TOPIC_TO_LECTURE:
        if re.search(pattern, ql, re.I):
            score = len(pattern)
            if score > best_score:
                best_score = score
                best_lec = lec
    return best_lec


def merge_dedupe(all_qs: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for q in all_qs:
        key = norm(q["q"])
        if key not in seen:
            seen[key] = q
        else:
            ex = seen[key]
            # Prefer comprehensive (has reliable lecture + answer)
            if q.get("source") == "comprehensive":
                seen[key] = {**ex, **q, "source": merge_source(ex, q)}
            else:
                if not ex.get("lecture") and q.get("lecture"):
                    ex["lecture"] = q["lecture"]
                ex["source"] = merge_source(ex, q)
    return list(seen.values())


def merge_source(a: dict, b: dict) -> str:
    sa = set((a.get("source") or "").split("+"))
    sb = set((b.get("source") or "").split("+"))
    return "+".join(sorted(sa | sb))


def write_output(questions: list[dict]) -> None:
    questions.sort(key=lambda x: (x["lecture"], x.get("qid", 0), x["q"][:40]))
    lectures = [
        {"id": i, "name": LECTURE_NAMES[i]}
        for i in range(1, 22)
        if any(q["lecture"] == i for q in questions)
    ]
    # Always expose all 21 lectures for filtering UI
    lectures = [{"id": i, "name": LECTURE_NAMES[i]} for i in range(1, 22)]

    lines = [
        "// Auto-generated — run: python extract_all_pdfs.py",
        "const LECTURES = " + json.dumps(lectures, ensure_ascii=False, indent=2) + ";",
        "",
        "const ALL_QUESTIONS = [",
    ]
    for i, q in enumerate(questions):
        lines.append("  {")
        lines.append(f'    q: "{js_escape(q["q"])}",')
        opts_js = ", ".join(f'"{js_escape(o)}"' for o in q["opts"])
        lines.append(f"    opts: [{opts_js}],")
        lines.append(f"    ans: {q['ans']},")
        lines.append(f"    lecture: {q['lecture']},")
        lines.append(f'    source: "{q.get("source", "unknown")}"')
        lines.append("  }" + ("," if i < len(questions) - 1 else ""))
    lines.append("];")

    (QUIZ_DIR / "questions_data.js").write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote questions_data.js — {len(questions)} questions")


def main():
    all_qs: list[dict] = []

    comp_path = QUIZ_DIR / "comprehensive_study_guide.pdf"
    if comp_path.exists():
        print("Parsing comprehensive_study_guide.pdf...")
        all_qs.extend(parse_comprehensive(comp_path))

    for name, fname in [
        ("mcqs", "DCD O.Surgery4 MCQs .pdf"),
        ("ministerial", "DCD O.Surgery4 Ministerial Questions .pdf"),
    ]:
        path = QUIZ_DIR / fname
        if not path.exists():
            continue
        print(f"Parsing {fname}...")
        qs = parse_standard_pdf(read_pdf(path), name)
        print(f"  -> {len(qs)} raw")
        all_qs.extend(qs)

    merged = merge_dedupe(all_qs)
    for q in merged:
        if not q.get("lecture"):
            q["lecture"] = infer_lecture(q["q"]) or 1

    c = Counter(q["lecture"] for q in merged)
    print("\nPer lecture:")
    for lec in range(1, 22):
        if c[lec]:
            print(f"  L{lec:2d}: {c[lec]:4d}  {LECTURE_NAMES[lec]}")

    sc = Counter()
    for q in merged:
        for s in (q.get("source") or "").split("+"):
            if s:
                sc[s] += 1
    print("\nBy source:", dict(sc))
    print("Total:", len(merged))

    write_output(merged)


if __name__ == "__main__":
    main()
