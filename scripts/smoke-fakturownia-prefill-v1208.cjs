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
assert.ok(edge.includes('[/\\bMitsubishi\\s+Electric\\b/i, "Mitsubishi Electric"]'));
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
assert.match(edge, /url\.searchParams\.set\("invoice\[oid\]", invoiceOid\)/, "Formularz musi dostać OID konkretnego montażu.");
assert.match(edge, /invoice\[positions\]\[0\]\[name\]/);
assert.match(edge, /invoice\[positions\]\[0\]\[tax\]/);
assert.match(edge, /url\.searchParams\.set\("invoice\\[positions\\]\\[0\\]\\[quantity\\]", "1"\)/,
  'Ilość na pozycji faktury musi domyślnie wynosić dokładnie 1.');
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
  /price_net|price_gross|total_price|\bprice\b/i,
  'Prefill formularza nie może wpisywać żadnej ceny ani wartości faktury.',
);

console.log('OK: v12.83 Fakturownia — pozycja quantity=1, nazwa/VAT/płatność bez zmian, żadnej ceny ani tworzenia faktury przez API.');
