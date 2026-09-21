const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const main = read('src/main.jsx');
const styles = read('src/styles.css');
const mobileStyles = read('src/mobile791/styles.css');
const jobsPanel = read('src/components/JobsPanel.jsx');
const contractorsPanel = read('src/components/contractors/ContractorsPanel.jsx');
const devicesPanel = read('src/components/devices/DevicesPanel.jsx');
const desktopStructure = read('DESKTOP-STRUCTURE.md');

assert(exists('src/mobile791/App.jsx'), 'Brak zamrożonego wejścia mobile src/mobile791/App.jsx');
assert(exists('src/mobile791/styles.css'), 'Brak zamrożonych styli mobile src/mobile791/styles.css');
assert.match(main, /useMobile791 \? import\('\.\/mobile791\/App\.jsx'\) : import\('\.\/App\.jsx'\)/, 'src/main.jsx musi rozdzielać desktop i mobile na osobne App.jsx');
assert.match(main, /useMobile791 \? import\('\.\/mobile791\/styles\.css'\) : import\('\.\/styles\.css'\)/, 'src/main.jsx musi rozdzielać style desktop i mobile');

assert(jobsPanel.includes('desktopJobsModulePage'), 'Montaże powinny używać desktopJobsModulePage');
assert(contractorsPanel.includes('contractorsModulePage desktopModuleShell'), 'Kontrahenci powinny używać desktopModuleShell');
assert(devicesPanel.includes('devicesModulePage desktopModuleShell'), 'Urządzenia powinny używać desktopModuleShell');

assert.match(styles, /v8\.27 desktop-only unified admin layout/, 'Brak sekcji CSS v8.27 dla ujednoliconego desktopu');
assert.match(styles, /--wawisDesktopPanelWidth:clamp\(440px,35vw,540px\)/, 'Brak wspólnej szerokości prawego panelu desktop');
assert.match(styles, /\.desktopJobsModulePage \.smsDesktopHeaderCard,\n\s*\.contractorsHero,\n\s*\.devicesHero\{[\s\S]*?min-height:var\(--wawisDesktopHeaderHeight\) !important;/, 'Nagłówki Montaże/Kontrahenci/Urządzenia nie są spięte wspólnym stylem');
assert.match(styles, /\.desktopHeaderV2,\n\s*\.contractorsToolbar,\n\s*\.devicesToolbar\{[\s\S]*?min-height:var\(--wawisDesktopToolbarHeight\) !important;/, 'Toolbary Montaże/Kontrahenci/Urządzenia nie są spięte wspólnym stylem');
assert.match(styles, /\.desktopJobsTableCard,\n\s*\.contractorsTableCard,\n\s*\.devicesTableCard\{[\s\S]*?border:1px solid var\(--wawisDesktopBorder\) !important;/, 'Karty tabel nie mają wspólnej reguły');
assert.match(styles, /\.adminDesktopPage \.twoColDesktopStatusLeft:not\(\.singleModuleColumn\),\n\s*\.contractorsSplitWorkspace,\n\s*\.devicesSplitWorkspace\{[\s\S]*?gap:var\(--wawisDesktopGap\) !important;/, 'Split panele nie mają wspólnego odstępu');
assert.match(styles, /\.contractorsSplitWorkspace,\n\s*\.devicesSplitWorkspace\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) var\(--wawisDesktopPanelWidth\) !important;/, 'Kontrahenci/Urządzenia nie używają wspólnej proporcji split');
assert.match(styles, /\.adminDesktopPage \.twoColDesktopStatusLeft:not\(\.singleModuleColumn\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) var\(--wawisDesktopPanelWidth\) !important;/, 'Montaże nie używają wspólnej szerokości prawego panelu');

assert(!mobileStyles.includes('v8.27 desktop-only unified admin layout'), 'Sekcja desktop v8.27 nie może trafić do mobile CSS');
assert(desktopStructure.includes('Widok mobilny jest zamrożony'), 'DESKTOP-STRUCTURE.md musi opisywać zamrożenie mobile');
assert(desktopStructure.includes('src/mobile791'), 'DESKTOP-STRUCTURE.md musi wymieniać katalog mobile');

console.log(`Desktop unified layout smoke OK (${sha256(styles).slice(0, 12)})`);
