// Self-test kontroli po wdrożeniu: czeka, aż lokalny serwer zbudowanej aplikacji odpowie.
const [url, ms = '90000'] = process.argv.slice(2);
const until = Date.now() + Number(ms);
let last = '';
while (Date.now() < until) {
  try {
    const response = await fetch(url);
    if (response.ok) { console.log(await response.text()); process.exit(0); }
    last = `HTTP ${response.status}`;
  } catch (error) {
    last = String(error?.cause?.code || error?.message || error);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.log(`::error::Lokalny serwer nie odpowiedział: ${url} (${last})`);
process.exit(1);
