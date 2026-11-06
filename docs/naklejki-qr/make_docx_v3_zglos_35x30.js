// Word: każda naklejka jako jeden obraz 600 dpi (identyczny z PDF, niezależny od czcionek w Wordzie).
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, VerticalAlign, BorderStyle, HeightRule, PageBreak } = require('docx');
const [out, name] = process.argv.slice(2);
const { codes, cols: COLS, rows: ROWS } = JSON.parse(fs.readFileSync(path.join(out, 'layout.json'), 'utf8'));
const CW = 1984, CH = 1701; // 35 × 30 mm
const IMG_W = Math.round(34.4 / 25.4 * 96), IMG_H = Math.round(29.4 / 25.4 * 96);
const border = { style: BorderStyle.DASHED, size: 2, color: 'C7CCD6' };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const cell = (code) => new TableCell({
  width: { size: CW, type: WidthType.DXA },
  borders: code ? { top: border, bottom: border, left: border, right: border } : { top: none, bottom: none, left: none, right: none },
  margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
    children: code ? [new ImageRun({ type: 'png', data: fs.readFileSync(path.join(out, 'png', `${code}.png`)),
      transformation: { width: IMG_W, height: IMG_H }, altText: { title: code, description: `Naklejka QR ${code}`, name: code } })] : [] })],
});
const children = [];
for (let p = 0; p * COLS * ROWS < codes.length; p++) {
  const chunk = codes.slice(p * COLS * ROWS, (p + 1) * COLS * ROWS);
  const rows = [];
  for (let i = 0; i < chunk.length; i += COLS) {
    const rowCodes = chunk.slice(i, i + COLS);
    while (rowCodes.length < COLS) rowCodes.push(null);
    rows.push(new TableRow({ height: { value: CH, rule: HeightRule.EXACT }, cantSplit: true, children: rowCodes.map(cell) }));
  }
  if (p > 0) children.push(new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new PageBreak()] }));
  children.push(new Table({ width: { size: CW * COLS, type: WidthType.DXA }, columnWidths: Array(COLS).fill(CW), rows }));
}
children.push(new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] }));
const doc = new Document({ creator: 'WAWIS Klimatyzacja', title: 'Naklejki QR WAWIS — zgłoś awarię lub serwis',
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 640, bottom: 500, left: 993, right: 993, header: 0, footer: 0 } } }, children }] });
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(path.join(out, `${name}.docx`), b); console.log('docx ok'); });
