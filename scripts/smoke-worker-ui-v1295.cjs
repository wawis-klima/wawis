const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');
const detail = read('src/mobile791/components/JobDetailsPanel.jsx');
const edit = read('src/mobile791/components/modals/JobFormModal.jsx');
const protocol = read('src/mobile791/components/modals/ProtocolTestModal.jsx');
const css = read('src/mobile791/v1295-worker-ui.css');
const boot = read('src/main.jsx');
assert.match(detail, /mobileFourButtons\$\{!isAdmin \? " workerDetailsActionGridV1295" : ""\}/);
assert.match(edit, /editingJobId && !isAdmin \? " workerMobileEditModalV1295" : ""/);
for (const name of ['workerActionEditV1295', 'workerActionCloseV1295', 'workerActionNameplatesV1295', 'workerActionProtocolV1295', 'workerActionFinishV1295']) {
  assert(detail.includes(name), 'Missing button hook: ' + name);
  assert(css.includes('.workerDetailsActionGridV1295 > .' + name), 'Missing scoped position: ' + name);
}
assert(css.includes('.formModal.workerMobileEditModalV1295'), 'Worker-only form stylesheet');
assert(css.includes('.workerMobileEditModalV1295 .installationDateLabelRow'), 'Date alignment');
assert(css.includes('max-height:calc(100dvh - 24px)'), 'Small iPhone modal must be scrollable');
assert(boot.includes("await import('./mobile791/v1295-worker-ui.css')"), 'Stylesheet loaded last');
assert(protocol.includes('>Gotówka lub przelew</option>'), 'Payment copy');
assert(!protocol.includes('Wybierz: gotówka lub przelew'), 'Old payment copy');
assert(edit.includes('workerDateVisibleLabelV1296'), 'Centered display for iOS date is missing');
assert(edit.includes('formatWorkerInstallationDate(jobForm.installation_date)'), 'Date display must track controlled form state');
assert(edit.includes('editingJobId && !isAdmin ? ('), 'Worker-only date display guard');
assert(css.includes('.workerMobileEditModalV1295 .workerDateVisibleLabelV1296'), 'Role-scoped center CSS absent');
assert(css.includes('.workerMobileEditModalV1295 .installationDateNativeInput'), 'Native date input kept interactive');
assert(css.includes('opacity:0!important'), 'The iOS native input text must not overlap the centered text');
console.log('OK: worker-only UI, editable native iOS date with centered value, admin unchanged, payment copy');
