import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const cssSource = fs.readFileSync(
  path.join(root, 'src/mobile791/v1091-mobile-details-hardening.css'),
  'utf8',
);

test.describe('@mobile 10.93 manual verification button', () => {
  test('przycisk ręcznego potwierdzenia jest kompaktowy i nie rozciąga się na całą kartę', async () => {
    const match = cssSource.match(/\.deviceUnitManualVerifyBtn\s*\{([\s\S]*?)\}/);
    expect(match).not.toBeNull();

    const rule = match[1];
    expect(rule).toContain('width: fit-content !important;');
    expect(rule).toContain('justify-self: center !important;');
    expect(rule).toContain('max-width: calc(100% - 16px) !important;');
    expect(rule).toContain('white-space: nowrap;');
    expect(rule).not.toContain('width: 100% !important;');
  });
});
