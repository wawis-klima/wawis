const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dashboardSource = fs.readFileSync(path.join(root, 'src', 'components', 'dashboard', 'Centrum360Panel.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

assert.match(dashboardSource, /function getGreetingName\(profile = \{\}\)/, 'Centrum 360 should derive greeting name from profile');
assert.match(dashboardSource, /const greetingName = useMemo\(\(\) => getGreetingName\(profile\), \[profile\]\)/, 'Centrum 360 should memoize greeting name from profile');
assert.match(dashboardSource, /<h1>Dzień dobry, \{greetingName\} 👋<\/h1>/, 'Centrum 360 header should render dynamic greeting');
assert.doesNotMatch(dashboardSource, /Dzień dobry, Piotr/, 'Centrum 360 must not hardcode Piotr in the greeting');
assert.match(appSource, /<Centrum360Panel[\s\S]*profile=\{profile\}[\s\S]*smsDueTodayCount=\{smsDueTodayCount\}/, 'App should pass profile to Centrum 360');

console.log('Center 360 personalization smoke OK');
process.exit(0);
