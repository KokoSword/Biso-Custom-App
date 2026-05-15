"""Merge HTML questions with PDF-extracted questions; output JS snippet."""
import json
import re

def norm(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return " ".join(s.split())[:90]

with open(r"e:\quiz\extracted_questions.json", encoding="utf-8") as f:
    pdf_qs = json.load(f)

with open(r"e:\quiz\oral_surgery_quiz.html", encoding="utf-8") as f:
    html = f.read()

# Parse existing ALL_QUESTIONS from HTML
block = re.search(r"const ALL_QUESTIONS = \[(.*?)\];", html, re.S)
if not block:
    raise SystemExit("ALL_QUESTIONS not found")

html_qs = []
for m in re.finditer(
    r'q:\s*"((?:\\.|[^"\\])*)"\s*,\s*opts:\s*\[(.*?)\]\s*,\s*ans:\s*(\d+)',
    block.group(1),
    re.S,
):
    q = m.group(1).encode().decode("unicode_escape") if "\\" in m.group(1) else m.group(1)
    opts_raw = m.group(2)
    opts = [
        o.strip().strip('"')
        for o in re.findall(r'"((?:\\.|[^"\\])*)"', opts_raw)
    ]
    html_qs.append({"q": q, "opts": opts, "ans": int(m.group(3))})

print("HTML:", len(html_qs))
print("PDF unique:", len(pdf_qs))

seen = {norm(q["q"]) for q in html_qs}
merged = list(html_qs)
added = 0
for q in pdf_qs:
    k = norm(q["q"])
    if k not in seen:
        seen.add(k)
        merged.append(q)
        added += 1

print("Added from PDF:", added)
print("Total merged:", len(merged))

def js_escape(s):
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", " ")
        .replace("\r", "")
    )

lines = ["const ALL_QUESTIONS = ["]
for i, q in enumerate(merged):
    lines.append("  {")
    lines.append(f'    q: "{js_escape(q["q"])}",')
    opts_js = ", ".join(f'"{js_escape(o)}"' for o in q["opts"])
    lines.append(f"    opts: [{opts_js}],")
    lines.append(f"    ans: {q['ans']}")
    lines.append("  }" + ("," if i < len(merged) - 1 else ""))
lines.append("];")

with open(r"e:\quiz\questions_data.js", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("Wrote questions_data.js")
