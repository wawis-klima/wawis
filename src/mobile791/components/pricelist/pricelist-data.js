// Cennik WAWIS na podstawie dokumentu „2025 CENNIK KLIMA MONTAZ 2026.docx” (2 strony).
// Kwoty to ceny po rabacie NETTO w PLN. Nie modyfikować pozycji przez zaokrąglenie cen brutto.
export const PRICE_LIST_GROUPS = [
  { name: "Rotenso UKURA H", rows: [
    ["2,6 kW", "65–80 m³", 2150],
    ["3,5 kW", "80–100 m³", 2300],
    ["5,3 kW", "110–140 m³", 3050],
    ["7,0 kW", "150–180 m³", 3700],
  ] },
  { name: "Rotenso IMOTO", rows: [
    ["2,6 kW", "65–80 m³", 2550],
    ["3,5 kW", "80–100 m³", 2700],
    ["5,3 kW", "110–140 m³", 3400],
    ["7,0 kW", "150–180 m³", 4000],
  ] },
  { name: "Rotenso REVIO", rows: [
    ["2,6 kW", "65–80 m³", 2850],
    ["3,5 kW", "80–100 m³", 3000],
    ["5,3 kW", "110–140 m³", 3900],
    ["7,0 kW", "150–180 m³", 4650],
  ] },
  { name: "Rotenso Elis Silver/Black", rows: [
    ["2,6 kW", "65–80 m³", 2100],
    ["3,5 kW", "80–100 m³", 2200],
    ["5,3 kW", "110–140 m³", 3000],
    ["7,0 kW", "150–180 m³", 3500],
  ] },
  { name: "Rotenso Teta Biała/Czarna", rows: [
    ["3,5 kW", "80–100 m³", 2750],
    ["5,3 kW", "110–140 m³", 3650],
  ] },
  { name: "Rotenso Versu Mirror/Gold/Silver/Pure/Cloth", rows: [
    ["2,6 kW", "65–80 m³", 3000],
    ["3,5 kW", "80–100 m³", 3200],
    ["5,0 kW", "111–140 m³", 4000],
  ] },
  { name: "Rotenso Mirai", rows: [
    ["3,5 kW", "80–100 m³", 3900],
  ] },
  { name: "Rotenso Roni", rows: [
    ["2,6 kW", "65–80 m³", 2000],
    ["3,5 kW", "80–100 m³", 2200],
    ["5,3 kW", "110–140 m³", 2700],
    ["7,0 kW", "150–180 m³", 3150],
  ] },
  { name: "Rotenso Hiro — jednostki zewnętrzne Multi", type: "outdoor", rows: [
    ["H50", "2 JW", 3200],
    ["H60", "3 JW", 3900],
    ["H70", "3 JW", 4200],
    ["H80", "4 JW", 4300],
    ["H100", "4 JW", 5700],
    ["H120", "5 JW", 6000],
  ] },
  { name: "Rotenso Hiro / IMOTO — jednostki wewnętrzne Multi", rows: [
    ["2,1 kW", "0–50 m³", 700],
    ["2,6 kW", "65–80 m³", 750],
    ["3,5 kW", "80–100 m³", 800],
    ["5,3 kW", "110–140 m³", 900],
  ] },
];

export function grossPriceWithEightPercentVat(netPricePln) {
  // Całkowite ceny netto w PLN — obliczanie w groszach bez błędów zmiennoprzecinkowych.
  return Math.round(netPricePln * 108) / 100;
}

export const PRICE_LIST_TOTAL_ROWS = PRICE_LIST_GROUPS.reduce((sum, group) => sum + group.rows.length, 0);
