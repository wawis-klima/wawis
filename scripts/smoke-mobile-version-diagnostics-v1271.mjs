import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const jobsPanel = read("src/mobile791/components/JobsPanel.jsx");
const layout = read("src/mobile791/components/jobs/MobileJobsLayout.jsx");
const diagnostics = read("src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx");
const css = read("src/mobile791/components/diagnostics/MobileDiagnosticsPanel.css");

assert.match(jobsPanel, /useState\(false\)/, "Stan diagnostyki musi startować jako zamknięty");
assert.match(jobsPanel, /diagnosticsOpen=\{diagnosticsOpen\} setDiagnosticsOpen=\{setDiagnosticsOpen\}/);
assert.match(jobsPanel, /!diagnosticsOpen && visibleJobs\.length === 0/, "Pusty widok montaży nie może zasłaniać diagnostyki");
assert.match(layout, /React\.lazy\(\(\) => import\("\.\.\/diagnostics\/MobileDiagnosticsPanel\.jsx"\)\)/, "Panel musi być ładowany na żądanie");
assert.match(layout, /<button[\s\S]*?className="mobileVersionTag wawisOneLineVersion wawisVersionDiagnosticsButton"/, "Wersja musi być przyciskiem");
assert.match(layout, /aria-label=\{"Diagnostyka aplikacji, wersja " \+ APP_VERSION\}/);
assert.match(layout, /aria-expanded=\{diagnosticsOpen\}/);
assert.match(layout, /setDiagnosticsOpen\(\(open\) => !open\)/, "Dotknięcie wersji musi przełączać diagnostykę");
assert.match(layout, /onBack=\{\(\) => setDiagnosticsOpen\(false\)\}/, "Powrót musi zamykać diagnostykę");
assert.match(layout, /sessionUser=\{sessionUser\} refreshAll=\{refreshAll\}/, "Akcje diagnostyczne muszą mieć prawidłowe zależności");
assert.match(diagnostics, /downloadDiagnosticReportImmediate\(/, "Raport mobilny musi działać");
assert.match(diagnostics, /getPhotoQueueSummary\(/, "Diagnostyka musi odczytać kolejkę zdjęć");
assert.match(diagnostics, /profile\?\.role === "Administrator" \? \(/, "Pracownik nie może widzieć testu PUSH administratora");
assert.match(diagnostics, /mobileDiagnosticsBack/, "Panel musi zapewniać nawigację powrotną");
assert.match(css, /\.mobileDiagnosticsPage\{/);

await build({
  entryPoints: ["src/mobile791/components/jobs/MobileJobsLayout.jsx", "src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx"],
  bundle: true,
  outdir: "dist-smoke-mobile-diagnostics",
  write: false,
  format: "esm",
  platform: "browser",
  loader: { ".js": "jsx", ".jsx": "jsx" },
  logLevel: "silent",
});
console.log("Mobile version -> diagnostics smoke OK (routing, access, report, lazy bundle).");
