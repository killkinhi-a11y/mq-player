#!/usr/bin/env python3
"""Fix paren balance in QA injection evals (JSON.parse(atob(...)) inside setItem(...))."""
for f in ['/home/z/my-project/scripts/qa_v4_capture.sh', '/home/z/my-project/scripts/qa_v4_debug.sh']:
    s = open(f).read()
    s = s.replace("'));     return 'injected'", "')));     return 'injected'")
    s = s.replace("')); location.assign('/')", "'))); location.assign('/')")
    open(f, 'w').write(s)
    ok = True
    for i, line in enumerate(s.split('\n'), 1):
        if 'JSON.parse(atob' in line:
            bal = line.count('(') - line.count(')')
            print(f.split('/')[-1], 'line', i, 'paren-balance:', bal, '(need >=0 total, eval-str ok)')
            if bal != 0:
                # parens inside JS strings don't need balance, but our B64 has none
                ok = False
    print(f.split('/')[-1], 'balanced' if ok else 'CHECK MANUALLY')
