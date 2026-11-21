"""Run every backend test script (no network, no API credits). Usage: python backend/tests/run_all.py"""
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
failed = []
for script in sorted(here.glob("test_*.py")):
    out = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, timeout=300)
    lines = [l for l in out.stdout.splitlines() if l.startswith(("PASS", "FAIL", "ALL", "FAILED"))]
    passed = sum(l.startswith("PASS") for l in lines)
    bad = [l for l in lines if l.startswith("FAIL ")]
    ok = out.returncode == 0 and "ALL PASSED" in out.stdout
    print(f"{'OK  ' if ok else 'FAIL'} {script.name}: {passed} passed, {len(bad)} failed")
    for l in bad:
        print("     " + l)
    if not ok:
        failed.append(script.name)
        if out.returncode != 0 and not bad:
            print(out.stderr[-1500:])
print("\nALL SUITES PASSED" if not failed else f"\nFAILED SUITES: {failed}")
sys.exit(1 if failed else 0)
