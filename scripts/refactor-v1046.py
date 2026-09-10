from pathlib import Path
import re

root = Path('.')

# Consolidate all mobile presentation rules into a single entry point.
jobs_path = root / 'src/mobile791/components/JobsPanel.jsx'
jobs = jobs_path.read_text()
marker = 'const MOBILE_V959_CSS = `'
start = jobs.index(marker) + len(marker)
end = jobs.index('`;\n\nexport default function JobsPanel', start)
jobs_css = jobs[start:end].strip() + '\n'

jobs = re.sub(
    r'/\* v9\.59 — mobile visual polish only\.[\s\S]*?\*/\nconst MOBILE_V959_CSS = `[\s\S]*?`;\n\n',
    '',
    jobs,
    count=1,
)
jobs = jobs.replace("      {isMobile ? <style>{MOBILE_V959_CSS}</style> : null}\n", '')
if 'MOBILE_V959_CSS' in jobs:
    raise SystemExit('MOBILE_V959_CSS was not fully removed')
jobs_path.write_text(jobs)

legacy = (root / 'src/mobile791/v1031-overrides.css').read_text().strip()
final_polish = r'''
/* WAWIS 10.46 — final mobile Montaże polish, no layered version overrides. */
@media (max-width:700px){
  .mobileJobsShellV959 .mobileJobAddressBlock>.mobileJobLabel{display:none!important;}
  .mobileJobsShellV959 .jobTypeTagRight{display:none!important;}
  .mobileJobsShellV959 .mobileJobGrid.mobileJobGridSingleField{grid-template-columns:minmax(0,1fr)!important;gap:0!important;margin-bottom:2px!important;}
  .mobileJobsShellV959 .mobileJobAddressBlock,
  .mobileJobsShellV959 .mobileJobAddressValue{min-width:0!important;}
  .mobileJobsShellV959 .statusActionImage{transition:transform .16s ease!important;transform-origin:center center!important;}
  .mobileJobsShellV959 .activeStatusActionButton .statusActionImage{transform:scale(1.16)!important;}
}
'''.strip()

mobile_css = (
    "/* WAWIS 10.46 — single mobile stylesheet entry point. */\n"
    "@import './styles.css';\n\n"
    "/* Montaże + mobile diagnostics: consolidated from the former inline JobsPanel style. */\n"
    + jobs_css
    + "\n/* Mobile module/fuel compact rules: consolidated from v1031-overrides.css. */\n"
    + legacy
    + "\n\n"
    + final_polish
    + "\n"
)
(root / 'src/mobile791/mobile.css').write_text(mobile_css)

main_path = root / 'src/main.jsx'
main = main_path.read_text()
for import_line in (
    "import './mobile791/v1031-overrides.css'\n",
    "import './mobile791/v1044-overrides.css'\n",
    "import './mobile791/v1045-overrides.css'\n",
):
    main = main.replace(import_line, '')
main = main.replace(
    "useMobile791 ? import('./mobile791/styles.css') : import('./styles.css')",
    "useMobile791 ? import('./mobile791/mobile.css') : import('./styles.css')",
)
if "import('./mobile791/mobile.css')" not in main:
    raise SystemExit('mobile.css was not wired into main.jsx')
main_path.write_text(main)

for old in ('v1031-overrides.css', 'v1044-overrides.css', 'v1045-overrides.css'):
    p = root / 'src/mobile791' / old
    if p.exists():
        p.unlink()

# Fuel wrapper stays simple; all rendering/paging logic lives in React in FuelPanelBase.
fuel_wrapper = root / 'src/components/fuel/FuelPanel.jsx'
fuel_wrapper.write_text("""import React from 'react';\nimport FuelPanelBase from './FuelPanelBase.jsx';\nimport './FuelPanelV1034.css';\n\nexport default function FuelPanel(props) {\n  const { showVehicleOverview = false } = props;\n  return (\n    <div className={showVehicleOverview ? 'fuelV1034DesktopShell' : 'fuelV1034Shell'}>\n      <FuelPanelBase {...props} />\n    </div>\n  );\n}\n""")

base_path = root / 'src/components/fuel/FuelPanelBase.jsx'
base = base_path.read_text()

anchor = "const WARSAW_DATE_TIME = new Intl.DateTimeFormat('pl-PL', {\n  timeZone: 'Europe/Warsaw',\n  dateStyle: 'medium',\n  timeStyle: 'short',\n});\n"
helpers = anchor + """\nconst HISTORY_PAGE_SIZE = 5;\n\nfunction compactFuelHistoryDate(value) {\n  const date = new Date(value);\n  if (Number.isNaN(date.getTime())) return '—';\n  const parts = new Intl.DateTimeFormat('en-GB', {\n    timeZone: 'Europe/Warsaw',\n    day: '2-digit',\n    month: '2-digit',\n    year: '2-digit',\n  }).formatToParts(date);\n  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));\n  return `${values.day}.${values.month}.${values.year}`;\n}\n\nfunction creatorInitials(fullName) {\n  const parts = String(fullName || '').trim().split(/\\s+/).filter(Boolean);\n  if (!parts.length) return '';\n  const first = parts[0]?.[0] || '';\n  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '';\n  return `${first}${last}`.toLocaleUpperCase('pl-PL');\n}\n"""
if anchor not in base:
    raise SystemExit('WARSAW formatter anchor missing')
base = base.replace(anchor, helpers, 1)

state_anchor = "  const [historyVehicleId, setHistoryVehicleId] = useState('');\n"
if state_anchor not in base:
    raise SystemExit('historyVehicleId state anchor missing')
base = base.replace(state_anchor, state_anchor + "  const [historyPage, setHistoryPage] = useState(1);\n", 1)

display_anchor = "  const displayVehicleOverview = Boolean(showVehicleOverview && isAdmin);\n"
if display_anchor not in base:
    raise SystemExit('displayVehicleOverview anchor missing')
base = base.replace(display_anchor, display_anchor + "  const compactMobileAdmin = Boolean(isAdmin && !displayVehicleOverview);\n", 1)

visible_block = """  const visibleEntries = useMemo(() => (\n    displayVehicleOverview && historyVehicleId\n      ? entries.filter((entry) => entry.vehicle_id === historyVehicleId)\n      : entries\n  ), [displayVehicleOverview, entries, historyVehicleId]);\n"""
paging_block = visible_block + """  const historyTotalPages = Math.max(1, Math.ceil(visibleEntries.length / HISTORY_PAGE_SIZE));\n  const pagedVisibleEntries = useMemo(() => {\n    if (!compactMobileAdmin) return visibleEntries;\n    const safePage = Math.min(historyPage, historyTotalPages);\n    const start = (safePage - 1) * HISTORY_PAGE_SIZE;\n    return visibleEntries.slice(start, start + HISTORY_PAGE_SIZE);\n  }, [compactMobileAdmin, historyPage, historyTotalPages, visibleEntries]);\n"""
if visible_block not in base:
    raise SystemExit('visibleEntries block missing')
base = base.replace(visible_block, paging_block, 1)

refresh_effect_anchor = "  useEffect(() => { void refresh(); }, [refresh]);\n"
paging_effects = refresh_effect_anchor + """  useEffect(() => {\n    if (compactMobileAdmin) setHistoryPage(1);\n  }, [compactMobileAdmin, visibleEntries.length]);\n  useEffect(() => {\n    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);\n  }, [historyPage, historyTotalPages]);\n"""
if refresh_effect_anchor not in base:
    raise SystemExit('refresh effect anchor missing')
base = base.replace(refresh_effect_anchor, paging_effects, 1)

section_old = '<section className="fuelModule" aria-labelledby="fuel-module-title">'
section_new = '<section className={`fuelModule ${compactMobileAdmin ? \'fuelModuleCompactMobile\' : \'\'}`} aria-labelledby="fuel-module-title">'
if section_old not in base:
    raise SystemExit('fuelModule section anchor missing')
base = base.replace(section_old, section_new, 1)

header_old = '<header className="fuelModuleHeader">'
header_new = '<header className={`fuelModuleHeader ${compactMobileAdmin ? \'fuelModuleHeaderMobile\' : \'\'}`}> '
if header_old not in base:
    raise SystemExit('fuel header anchor missing')
base = base.replace(header_old, header_new, 1)

history_heading = """      <div className=\"fuelCard fuelHistory\">\n        <div className=\"fuelCardHeading\"><div><span className=\"fuelStep\">{displayVehicleOverview ? '4' : '2'}</span><h3>{selectedHistoryVehicle ? `Historia: ${getVehicleLabel(selectedHistoryVehicle)}` : isAdmin ? 'Wszystkie tankowania' : 'Moje tankowania'}</h3></div><span>{visibleEntries.length} wpisów</span></div>\n"""
history_heading_new = """      <div className=\"fuelCard fuelHistory\">\n        <div className={`fuelCardHeading ${compactMobileAdmin ? 'fuelHistoryHeading' : ''}`}>\n          <div><span className=\"fuelStep\">{displayVehicleOverview ? '4' : '2'}</span><h3>{selectedHistoryVehicle ? `Historia: ${getVehicleLabel(selectedHistoryVehicle)}` : isAdmin ? 'Wszystkie tankowania' : 'Moje tankowania'}</h3></div>\n          <span>{visibleEntries.length} wpisów</span>\n          {compactMobileAdmin ? (\n            <button type=\"button\" className=\"fuelHistoryRefreshIcon\" onClick={() => void refresh()} disabled={busy || loading} aria-label=\"Odśwież tankowania\" title=\"Odśwież\">↻</button>\n          ) : null}\n        </div>\n"""
if history_heading not in base:
    raise SystemExit('history heading anchor missing')
base = base.replace(history_heading, history_heading_new, 1)

if '{visibleEntries.map((entry) => {' not in base:
    raise SystemExit('history map anchor missing')
base = base.replace('{visibleEntries.map((entry) => {', '{pagedVisibleEntries.map((entry) => {', 1)

meta_old = """                    <span>{formatFuelDate(entry.fueled_at)}{isAdmin && entry?.creator?.full_name ? ` · dodał: ${entry.creator.full_name}` : ''}</span>\n"""
meta_new = """                    {compactMobileAdmin ? (\n                      <span className=\"fuelHistoryMeta\">\n                        <span className=\"fuelHistoryDate\">{compactFuelHistoryDate(entry.fueled_at)}</span>\n                        {isAdmin && entry?.creator?.full_name ? (\n                          <span className=\"fuelCreatorBadge\" title={`Dodał: ${entry.creator.full_name}`} aria-label={`Dodał: ${entry.creator.full_name}`}>{creatorInitials(entry.creator.full_name)}</span>\n                        ) : null}\n                      </span>\n                    ) : (\n                      <span>{formatFuelDate(entry.fueled_at)}{isAdmin && entry?.creator?.full_name ? ` · dodał: ${entry.creator.full_name}` : ''}</span>\n                    )}\n"""
if meta_old not in base:
    raise SystemExit('fuel history metadata anchor missing')
base = base.replace(meta_old, meta_new, 1)

list_close = """            })}\n          </div>\n        ) : <p className=\"fuelEmpty\">Brak zapisanych tankowań.</p>}\n"""
list_close_new = """            })}\n          </div>\n        ) : <p className=\"fuelEmpty\">Brak zapisanych tankowań.</p>}\n        {compactMobileAdmin && !loading && visibleEntries.length > 0 && historyTotalPages > 1 ? (\n          <nav className=\"fuelHistoryPagination\" aria-label=\"Strony historii tankowań\">\n            <button type=\"button\" className=\"fuelHistoryPageArrow\" onClick={() => setHistoryPage((current) => Math.max(1, current - 1))} disabled={historyPage === 1} aria-label=\"Poprzednia strona\">‹</button>\n            <div className=\"fuelHistoryPageNumbers\">\n              {Array.from({ length: historyTotalPages }, (_, index) => index + 1).map((pageNumber) => (\n                <button key={pageNumber} type=\"button\" className={`fuelHistoryPageButton ${historyPage === pageNumber ? 'isActive' : ''}`} aria-current={historyPage === pageNumber ? 'page' : undefined} onClick={() => setHistoryPage(pageNumber)}>{pageNumber}</button>\n              ))}\n            </div>\n            <button type=\"button\" className=\"fuelHistoryPageArrow\" onClick={() => setHistoryPage((current) => Math.min(historyTotalPages, current + 1))} disabled={historyPage === historyTotalPages} aria-label=\"Następna strona\">›</button>\n          </nav>\n        ) : null}\n"""
if list_close not in base:
    raise SystemExit('fuel history list closing anchor missing')
base = base.replace(list_close, list_close_new, 1)
base_path.write_text(base)

# Update smoke tests for the new architecture.
smoke_path = root / 'scripts/smoke-mobile-style-bootstrap.cjs'
smoke = smoke_path.read_text()
smoke = smoke.replace("const mobileCssPath = path.join(root, 'src/mobile791/styles.css');", "const mobileCssPath = path.join(root, 'src/mobile791/mobile.css');\nconst mobileBaseCssPath = path.join(root, 'src/mobile791/styles.css');")
smoke = smoke.replace("const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');", "const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');\nconst mobileBaseCss = fs.readFileSync(mobileBaseCssPath, 'utf8');")
smoke = smoke.replace("import\\('\\.\\/mobile791\\/styles\\.css'\\)", "import\\('\\.\\/mobile791\\/mobile\\.css'\\)")
smoke = smoke.replace("assert.ok(fs.statSync(mobileCssPath).size > 150_000, 'Główny mobilny arkusz CSS wygląda na niepełny.');", "assert.match(mobileCss, /@import '\\.\\/styles\\.css';/, 'Docelowy mobile.css musi importować bazowy arkusz mobile.');\nassert.ok(fs.statSync(mobileBaseCssPath).size > 150_000, 'Bazowy mobilny arkusz CSS wygląda na niepełny.');")
smoke = smoke.replace("assert.match(mobileCss, /body\\s*\\{[^}]*font-family:/, 'Mobilny CSS musi ustawiać font całej aplikacji.');", "assert.match(mobileBaseCss, /body\\s*\\{[^}]*font-family:/, 'Mobilny CSS musi ustawiać font całej aplikacji.');")
smoke = smoke.replace("assert.match(mobileCss, /\\.page\\s*\\{/, 'Mobilny CSS musi zawierać podstawowy układ strony.');", "assert.match(mobileBaseCss, /\\.page\\s*\\{/, 'Mobilny CSS musi zawierać podstawowy układ strony.');")
smoke_path.write_text(smoke)

fuel_smoke_path = root / 'scripts/smoke-fuel-module-v1014.mjs'
fuel_smoke = fuel_smoke_path.read_text()
fuel_smoke = fuel_smoke.replace("const panel = read('src/components/fuel/FuelPanel.jsx');", "const panel = read('src/components/fuel/FuelPanelBase.jsx');")
if "FuelPanelBase.jsx" not in fuel_smoke:
    raise SystemExit('Fuel smoke test did not switch to FuelPanelBase')
fuel_smoke_path.write_text(fuel_smoke)

# Version bump and fresh mobile cache.
(root / 'src/version.js').write_text("export const APP_VERSION = '10.46';\n")
(root / 'src/mobile791/version.js').write_text("export const APP_VERSION = '10.46';\n")
(root / 'app-version.json').write_text('{\n  "version": "10.46"\n}\n')
sw_path = root / 'public/push-sw.js'
sw = sw_path.read_text().replace('wawis-app-shell-v10.45', 'wawis-app-shell-v10.46')
sw_path.write_text(sw)

# Guardrails.
if 'MutationObserver' in fuel_wrapper.read_text() or 'createPortal' in fuel_wrapper.read_text():
    raise SystemExit('Fuel wrapper still contains DOM mutation/portal logic')
if '<style>{MOBILE_V959_CSS}</style>' in jobs_path.read_text():
    raise SystemExit('JobsPanel still injects inline mobile CSS')
if not (root / 'src/mobile791/mobile.css').exists():
    raise SystemExit('mobile.css missing')
