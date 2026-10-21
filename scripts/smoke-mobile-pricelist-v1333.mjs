import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...pieces) => fs.readFileSync(path.join(root, ...pieces), "utf8");
const { PRICE_LIST_GROUPS, PRICE_LIST_TOTAL_ROWS, grossPriceWithEightPercentVat } = await import(
  pathToFileURL(path.join(root, "src/mobile791/components/pricelist/pricelist-data.js")).href
);
const expected = [
  ["Rotenso UKURA H", [2150,2300,3050,3700]],
  ["Rotenso IMOTO", [2550,2700,3400,4000]],
  ["Rotenso REVIO", [2850,3000,3900,4650]],
  ["Rotenso Elis Silver/Black", [2100,2200,3000,3500]],
  ["Rotenso Teta Biała/Czarna", [2750,3650]],
  ["Rotenso Versu Mirror/Gold/Silver/Pure/Cloth", [3000,3200,4000]],
  ["Rotenso Mirai", [3900]],
  ["Rotenso Roni", [2000,2200,2700,3150]],
  ["Rotenso Hiro — jednostki zewnętrzne Multi", [3200,3900,4200,4300,5700,6000]],
  ["Rotenso Hiro / IMOTO — jednostki wewnętrzne Multi", [700,750,800,900]],
];
assert.equal(PRICE_LIST_GROUPS.length, 10);
assert.equal(PRICE_LIST_TOTAL_ROWS, 36, "Cały cennik z dwóch stron musi zawierać dokładnie 36 pozycji.");
for (let i=0;i<expected.length;i++) {
  const [title,prices] = expected[i];
  const group = PRICE_LIST_GROUPS[i];
  assert.equal(group.name, title, `Błędna grupa ${i}`);
  assert.deepEqual(group.rows.map(row=>row[2]),prices,`Ceny netto w ${title} muszą zgadzać się z dokumentem`);
  group.rows.forEach(row=> {
    assert.equal(row.length,3);
    assert.ok(row[0] && row[1], "Brakuje modelu/mocy lub kubatury/liczby jednostek.");
    assert.ok(Number.isInteger(row[2]) && row[2]>0);
    assert.equal(grossPriceWithEightPercentVat(row[2]),Math.round(row[2]*1.08*100)/100);
  });
}
assert.equal(PRICE_LIST_GROUPS.find(g=>g.type==="outdoor")?.rows[5][1],"5 JW");
assert.equal(PRICE_LIST_GROUPS.find(g=>g.name==="Rotenso Versu Mirror/Gold/Silver/Pure/Cloth")?.rows[2][1],"111–140 m³");
assert.equal(grossPriceWithEightPercentVat(2150),2322);
assert.equal(grossPriceWithEightPercentVat(2550),2754);
assert.equal(grossPriceWithEightPercentVat(700),756);

const menu=read("src","mobile791","components","layout","ModuleSwitcher.jsx");
const app=read("src","mobile791","App.jsx");
const layout=read("src","mobile791","components","layout","AppAuthenticatedLayout.jsx");
const main=read("src","mobile791","main.jsx");
const css=read("src","mobile791","components","pricelist","pricelist-mobile.css");
const panel=read("src","mobile791","components","pricelist","PricelistPanel.jsx");
assert.match(menu,/id: "pricelist", label: "Cennik"/);
assert.match(menu,/\["jobs", "fuel", "pricelist"\]/);
assert.match(app,/activeModule === "pricelist" && isMobile/,"Nie wolno pokazywać cennika w wersji desktop.");
assert.match(app,/!\["jobs", "fuel", "pricelist"\]\.includes\(activeModule\)/);
assert.match(layout,/activeModule === 'pricelist'/);
assert.match(main,/import '\.\/components\/pricelist\/pricelist-mobile\.css'/,"Ochrona menu musi ładować się od pierwszego ekranu.");
assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\) !important/);
assert.match(css,/\.moduleSwitcherMobile\.isWorker\s*\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\) !important/);
assert.match(css,/\.moduleSwitcherMobile \.moduleSwitcherBtn\s*\{[\s\S]*?min-height:44px !important/);
assert.match(css,/text-overflow:clip !important/);
assert.doesNotMatch(css,/text-overflow:ellipsis/);
assert.match(panel,/grossPriceWithEightPercentVat\(net\)/);
assert.doesNotMatch(panel,/23%|katalogow/i);
console.log("WAWIS 13.33 cennik: PASS — 36 cen netto, 10 grup, VAT 8%, admin 4 menu, pracownik 3, bez skracania napisów.");
