import React, { useMemo, useState } from "react";
import { grossPriceWithEightPercentVat, PRICE_LIST_GROUPS, PRICE_LIST_TOTAL_ROWS } from "./pricelist-data.js";

const money = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

export default function PricelistPanel() {
  const [query, setQuery] = useState("");
  // Zawsze startuj ze wszystkimi modelami zamkniętymi. Można otworzyć tylko jeden naraz.
  const [expandedGroup, setExpandedGroup] = useState(null);
  const phrase = query.trim().toLocaleLowerCase("pl-PL");
  const groups = useMemo(() => PRICE_LIST_GROUPS.map((group) => {
    const matchName = group.name.toLocaleLowerCase("pl-PL").includes(phrase);
    const rows = matchName || !phrase
      ? group.rows
      : group.rows.filter(([power, capacity]) =>
        `${power} ${capacity}`.toLocaleLowerCase("pl-PL").includes(phrase)
      );
    return { ...group, rows };
  }).filter((group) => group.rows.length), [phrase]);

  return (
    <section className="wawisPricelist" aria-label="Cennik klimatyzatorów">
      <div className="wawisPricelistIntro">
        <h1>Cennik</h1>
        <p>Ceny po rabacie. Podane wartości powierzchni chłodzenia z cennika są kubaturą pomieszczeń w m³.</p>
        <label className="wawisPricelistSearchLabel" htmlFor="wawis-pricelist-search">Szukaj modelu lub mocy</label>
        <input
          id="wawis-pricelist-search"
          className="wawisPricelistSearch"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Np. Imoto, Roni, 3,5 kW"
        />
      </div>

      <div className="wawisPricelistGroups">
        {groups.map((group) => (
          <details key={group.name} className="wawisPricelistGroup" open={expandedGroup === group.name}>
            <summary
              className="wawisPricelistGroupTitle"
              onClick={(event) => {
                // Zapobiegamy niezależnemu przełączaniu natywnego <details>.
                // Stan React zamyka poprzednią grupę zanim otworzy następną.
                event.preventDefault();
                setExpandedGroup((current) => current === group.name ? null : group.name);
              }}
            >
              <span>{group.name}</span>
              <span className="wawisPricelistCount">{group.rows.length}</span>
            </summary>
            <div className="wawisPricelistGrid" role="table" aria-label={group.name}>
              <div className="wawisPricelistRow wawisPricelistHead" role="row">
                <span role="columnheader">Moc / model</span>
                <span role="columnheader">{group.type === "outdoor" ? "Liczba jednostek" : "Kubatura"}</span>
                <span role="columnheader">Netto</span>
                <span role="columnheader">Brutto 8%</span>
              </div>
              {group.rows.map(([power, capacity, net]) => (
                <div className="wawisPricelistRow" role="row" key={`${power}-${capacity}`}>
                  <span role="cell" className="wawisPricelistModel">{power}</span>
                  <span role="cell">{capacity}</span>
                  <span role="cell" className="wawisPricelistMoney">{money.format(net)} zł</span>
                  <strong role="cell" className="wawisPricelistMoney wawisPricelistGross">{money.format(grossPriceWithEightPercentVat(net))} zł</strong>
                </div>
              ))}
            </div>
          </details>
        ))}
        {!groups.length && <p className="wawisPricelistEmpty">Nie znaleziono modelu ani mocy.</p>}
      </div>

      <p className="wawisPricelistFootnote">
        {PRICE_LIST_TOTAL_ROWS} pozycji z cennika WAWIS. Cena brutto obliczona jako netto × 1,08.
        Stawka VAT 8% ma zastosowanie tylko wtedy, gdy spełnione są odpowiednie warunki podatkowe.
      </p>
    </section>
  );
}
