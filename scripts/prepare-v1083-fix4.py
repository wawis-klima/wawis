from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'scripts/smoke-release-automation-v1061.cjs'
text = path.read_text(encoding='utf-8')
old = '''assert.match(pr, /run-pr-checks\\.cjs/);\nassert.match(pr, /cancel-in-progress:\\s*true/);\nassert.doesNotMatch(pr, /playwright install/);'''
new = '''assert.match(pr, /run-pr-checks\\.cjs/);\nassert.match(pr, /cancel-in-progress:\\s*true/);\nassert.match(pr, /id:\\s*impact/, 'PR gate musi wystawiać wynik klasyfikacji release-impact.');\nassert.match(pr, /needs_playwright/, 'PR gate musi warunkować prawdziwe E2E wynikiem klasyfikatora.');\nassert.match(pr, /playwright install --with-deps chromium/, 'Krytyczny PR musi instalować prawdziwy Chromium Playwright.');\nassert.match(pr, /run-pr-playwright\\.cjs release-impact\\.json/, 'Krytyczny PR musi uruchamiać prawdziwe E2E, a nie tylko smoke konfiguracji.');'''
if text.count(old) != 1:
    raise SystemExit('Nie znaleziono starego zakazu Playwright w smoke release automation 10.61.')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('release automation smoke now requires real conditional PR Playwright')
