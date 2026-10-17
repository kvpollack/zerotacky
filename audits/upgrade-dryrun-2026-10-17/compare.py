"""Compare two snapshot_full.sql outputs column by column; print every differing column."""
import json, sys
L = lambda f: json.load(open(f))[0]['snap']
b, a = L(sys.argv[1]), L(sys.argv[2])
for k in b:
    same = json.dumps(b[k], sort_keys=True) == json.dumps(a[k], sort_keys=True)
    print(f"{k:13} rows={len(b[k])} {'SAME' if same else 'DIFF'}")
    if not same:
        for rb, ra in zip(b[k], a[k]):
            for c in sorted(set(rb) | set(ra)):
                if rb.get(c) != ra.get(c): print('   ', rb.get('id') or rb.get('key'), c, rb.get(c), '->', ra.get(c))
        if len(b[k]) != len(a[k]): print('    row count', len(b[k]), '->', len(a[k]))
