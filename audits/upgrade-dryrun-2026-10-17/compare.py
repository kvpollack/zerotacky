"""Compare two snapshot_full.sql outputs column by column. Prints every column whose value changed and, separately,
every column added by the upgrade (absent before), whether its default is null or not. A missing key and a null
value are not the same thing here (Astra, gate 3 follow-up)."""
import json, sys
L = lambda f: json.load(open(f))[0]['snap']
MISSING = object()
b, a = L(sys.argv[1]), L(sys.argv[2])
for k in b:
    same = json.dumps(b[k], sort_keys=True) == json.dumps(a[k], sort_keys=True)
    print(f"{k:13} rows={len(b[k])} {'SAME' if same else 'DIFF'}")
    if same: continue
    if len(b[k]) != len(a[k]): print('    row count', len(b[k]), '->', len(a[k]))
    added, changed, removed = set(), [], set()
    for rb, ra in zip(b[k], a[k]):
        for c in sorted(set(rb) | set(ra)):
            vb, va = rb.get(c, MISSING), ra.get(c, MISSING)
            if vb is MISSING: added.add((c, json.dumps(va)))
            elif va is MISSING: removed.add(c)
            elif vb != va: changed.append((rb.get('id') or rb.get('key'), c, vb, va))
    for rid, c, vb, va in changed: print('    CHANGED', rid, c, vb, '->', va)
    for c in sorted(removed): print('    REMOVED', c)
    cols = sorted({c for c, _ in added})
    print(f"    ADDED {len(cols)} columns (absent before, present after):")
    for c in cols: print('      ', c, 'defaults', sorted({v for cc, v in added if cc == c}))
