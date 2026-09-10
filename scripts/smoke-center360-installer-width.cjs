const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
assert(/\.centrum360UpcomingItem\{[^}]*grid-template-columns:68px minmax\(0,1fr\) 128px 156px/.test(styles), 'Centrum 360: kolumna monterów ma mieć 156px, żeby zmieścić 4 badge’e 32px z odstępami.');
assert(/\.centrum360InstallerBadges\{[^}]*min-width:156px;max-width:156px/.test(styles), 'Centrum 360: kontener badge’y monterów musi mieć 156px.');
assert(/\.centrum360InstallerBadges \.initialBadge\{[^}]*width:32px!important[^}]*height:32px!important/.test(styles), 'Centrum 360: badge’e monterów muszą nadal mieć 32x32px.');
console.log('OK: Centrum 360 ma szerszą kolumnę monterów na 4 badge’e.');
