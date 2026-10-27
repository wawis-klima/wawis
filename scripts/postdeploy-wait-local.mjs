// Self-test kontroli po wdrożeniu: czeka, aż lokalny serwer zbudowanej aplikacji odpowie.
import http from 'node:http';
const [url, ms = '90000'] = process.argv.slice(2);
const until = Date.now() + Number(ms);
const describe = (error) => [error?.name, error?.code, error?.message, error?.cause?.name, error?.cause?.code, error?.cause?.message]
  .filter(Boolean).join(' / ');
function viaHttp() {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ ok: response.statusCode === 200, info: `http ${response.statusCode} ${body.slice(0, 80)}` }));
    });
    request.on('error', (error) => resolve({ ok: false, info: `http: ${describe(error)}` }));
    request.setTimeout(10000, () => { request.destroy(new Error('timeout')); });
  });
}
let lastFetch = '';
let lastHttp = '';
while (Date.now() < until) {
  try {
    const response = await fetch(url);
    if (response.ok) { console.log(await response.text()); process.exit(0); }
    lastFetch = `HTTP ${response.status}`;
  } catch (error) {
    lastFetch = describe(error);
  }
  const plain = await viaHttp();
  lastHttp = plain.info;
  if (plain.ok) console.log(`::warning::fetch nie działa (${lastFetch}), http.get działa: ${plain.info}`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.log(`::error::Lokalny serwer nie odpowiedział: ${url} — fetch: ${lastFetch}; http.get: ${lastHttp}`);
process.exit(1);
