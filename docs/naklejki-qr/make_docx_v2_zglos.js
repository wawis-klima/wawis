const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, VerticalAlign, BorderStyle, HeightRule } = require('docx');
const [out, name] = process.argv.slice(2);
const codes = JSON.parse(fs.readFileSync(path.join(out, 'codes.json'), 'utf8'));
const COLS = 6, CELL = 1701;
const label = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
const QR_PX = Math.round(14.5 / 25.4 * 96);
const border = { style: BorderStyle.DASHED, size: 2, color: 'C7CCD6' };
const borders = { top: border, bottom: border, left: border, right: border };
const font = 'Arial';
const line = (text, size, color, exact, after = 0) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 0, after, line: exact, lineRule: 'exact' },
  children: [new TextRun({ text, bold: true, size, font, color })],
});
const cell = (code) => new TableCell({
  width: { size: CELL, type: WidthType.DXA }, borders,
  margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.CENTER,
  children: [
    line('WAWIS Klimatyzacja', 10, '132039', 130),
    line('ZGŁOŚ AWARIĘ', 15, '1464F4', 175),
    line('LUB SERWIS', 15, '1464F4', 175, 90),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 },
      children: [new ImageRun({ type: 'png', data: fs.readFileSync(path.join(out, 'png', `${code}.png`)),
        transformation: { width: QR_PX, height: QR_PX }, altText: { title: label(code), description: `QR ${code}`, name: code } })] }),
    line(label(code), 15, '132039', 190),
  ],
});
const rows = [];
for (let i = 0; i < codes.length; i += COLS) rows.push(new TableRow({ height: { value: CELL, rule: HeightRule.EXACT }, cantSplit: true, children: codes.slice(i, i + COLS).map(cell) }));
const doc = new Document({ creator: 'WAWIS Klimatyzacja', title: 'Naklejki QR WAWIS — zgłoś awarię lub serwis',
  styles: { default: { document: { run: { font, size: 16 } } } },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 700, bottom: 600, left: 850, right: 850, header: 0, footer: 0 } } },
    children: [new Table({ width: { size: CELL * COLS, type: WidthType.DXA }, columnWidths: Array(COLS).fill(CELL), rows }),
      new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] })] }] });
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(path.join(out, `${name}.docx`), b); console.log('docx ok'); });
