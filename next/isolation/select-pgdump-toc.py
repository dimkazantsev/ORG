#!/usr/bin/env python3
"""Fail-closed QWIZ schema-only TOC classifier, NO personal data and NO code output.

Input: pg_restore -l from pg_dump --schema-only -n public.
Output: a filtered pg_restore list, summary counts, SHA256 of that list.
Do not upload full dump or selected SQL to a public GitHub Actions artifact.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

FAMILY = re.compile(r"\b(qwiz_|org_next_|org_quiz_)[A-Za-z0-9_]*\b")
HELPER = re.compile(r"\borg_party_(?:create_set_from_questions|set_life_state)(?:\(|\b)")
FORBID = re.compile(r"\b(?:auth\.users|storage\.objects|storage\.buckets)\b", re.I)
OBJECT = re.compile(r"^\d+;\s+\d+\s+\d+\s+(.+)$")
CORE = ("qwiz_", "org_next_", "org_quiz_")
MINIMUM = {"qwiz_": {"TABLE": 36, "FUNCTION": 95},
           "org_next_": {"TABLE": 5, "FUNCTION": 10},
           "org_quiz_": {"TABLE": 16, "FUNCTION": 32, "VIEW": 4}}

def parse(input_text):
    selected = []
    types = collections.Counter()
    counts = {family: collections.Counter() for family in CORE}
    helpers = set()
    skipped = 0
    for line in input_text.splitlines(keepends=True):
        if not line.strip() or line.lstrip().startswith(";"):
            selected.append(line)
            continue
        m = OBJECT.match(line.strip())
        if not m:
            raise ValueError("Unexpected pg_restore TOC line format (no content displayed)")
        descriptor = m.group(1)
        prefix = next((f for f in CORE if re.search(r"\b"+re.escape(f)+r"[A-Za-z0-9_]*\b", descriptor)), None)
        helper = HELPER.search(descriptor)
        if not prefix and not helper:
            skipped += 1
            continue
        # Select only public objects; no extension-auth or storage objects.
        if not re.search(r"\bpublic\b", descriptor) or FORBID.search(descriptor):
            raise ValueError("Unexpected cross-schema item selected")
        selected.append(line)
        # Descriptor starts with [object type] public [object name] [owner].
        typ = re.split(r"\s+public\s+", descriptor, maxsplit=1)[0].strip()
        types[typ] += 1
        if helper:
            helpers.add(helper.group(0))
        if prefix:
            counts[prefix][typ] += 1

    for family, expected in MINIMUM.items():
        for typ, min_count in expected.items():
            if counts[family][typ] < min_count:
                raise ValueError(
                    f"Insufficient {family} {typ} objects: found={counts[family][typ]} expected_at_least={min_count}"
                )
    if len(helpers) < 2:
        raise ValueError("Missing expected legacy org_party helper functions")
    return "".join(selected), counts, types, helpers, skipped

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    original = Path(args.input).read_text()
    filtered, counts, types, helpers, skipped = parse(original)
    if "qwiz_" not in filtered or "org_quiz_" not in filtered:
        raise SystemExit("Unexpected missing QWIZ core family")
    Path(args.output).write_text(filtered)
    print("TOC_SELECTIVE_SUMMARY=" + json.dumps({
        "family": {k:dict(v) for k,v in counts.items()},
        "object_types": dict(types),
        "legacy_helpers": sorted(helpers),
        "skipped_non_quiz_items": skipped,
        "toc_sha256": hashlib.sha256(filtered.encode()).hexdigest()
    },ensure_ascii=False,sort_keys=True))
    print("Schema-only filtered TOC constructed; NO SQL bodies or game data emitted.")

if __name__ == "__main__":
    main()
