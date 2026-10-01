const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/fakturownia-client/index.ts'), 'utf8');

assert.match(
  edge,
  /select\("id, contractor_id, client, title, email, phone, city, street, device_model, payment_method"\)/,
  'Fakturownia musi czytać model urządzenia i metodę płatności z montażu.',
);

assert.match(edge, /Dostawa i montaż klimatyzatora marki \$\{invoiceBrand\}/);
assert.match(edge, /\[\/\\bRotenso\\b\/i, "Rotenso"\]/);
assert.match(edge, /Mitsubishi\\s\+Electric[\\s\\S]*"Mitsubishi Electric"/);
assert.match(edge, /const invoiceTax = isCompany \? 23 : 8;/);

assert.match(
  edge,
  /method === "cash"[\s\S]*paymentType: "cash"[\s\S]*paymentToKind: "off"[\s\S]*status: "paid"/,
  'Gotówka musi otwierać formularz jako gotówka, opłacona, bez terminu.',
);
assert.match(
  edge,
  /method === "transfer"[\s\S]*paymentType: "transfer"[\s\S]*paymentToKind: "3"[\s\S]*status: "issued"/,
  'Przelew musi otwierać formularz jako przelew, wystawiona, termin 3 dni.',
);

assert.match(edge, /url\.searchParams\.set\("client_id", clientId\)/);
assert.match(edge, /invoice\[positions_attributes\]\[0\]\[name\]/);
assert.match(edge, /invoice\[positions_attributes\]\[0\]\[tax\]/);
assert.match(edge, /invoice\[payment_type\]/);
assert.match(edge, /invoice\[payment_to_kind\]/);
assert.match(edge, /invoice\[status\]/);

assert.doesNotMatch(
  edge,
  /["'`]\/invoices\.json["'`]\s*,\s*apiToken\s*,\s*\{[\s\S]{0,160}?method:\s*["']POST["']/,
  'Kliknięcie Wystaw fakturę nie może tworzyć faktury przez API.',
);
assert.doesNotMatch(
  edge.slice(edge.indexOf('function buildInvoiceFormUrl'), edge.indexOf('function compactObject')),
  /quantity|price_net|price_gross|total_price/i,
  'Prefill formularza nie może wysyłać ilości ani kwoty.',
);

console.log('OK: v12.08 Fakturownia prefill bez automatycznego tworzenia faktury.');
