const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, VerticalAlign, BorderStyle, HeightRule,
} = require('docx');

const out = process.argv[2];
const codes = JSON.parse(fs.readFileSync(path.join(out, 'codes.json'), 'utf8'));
const COLS = 6;
const CELL = 1701; // 30 mm w DXA
const label = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
const QR_PX = Math.round(18 / 25.4 * 96); // 18 mm
const border = { style: BorderStyle.DASHED, size: 2, color: 'C7CCD6' };
const borders = { top: border, bottom: border, left: border, right: border };
const font = 'Arial';

function cell(code) {
  return new TableCell({
    width: { size: CELL, type: WidthType.DXA },
    borders,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 90, line: 160, lineRule: 'exact' },
        children: [new TextRun({ text: 'WAWIS Klimatyzacja', bold: true, size: 11, font, color: '10213B' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 70 },
        children: [new ImageRun({ type: 'png', data: fs.readFileSync(path.join(out, 'png', `${code}.png`)),
          transformation: { width: QR_PX, height: QR_PX }, altText: { title: label(code), description: `QR ${code}`, name: code } })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: label(code), bold: true, size: 16, font })] }),
    ],
  });
}

const rows = [];
for (let i = 0; i < codes.length; i += COLS) {
  rows.push(new TableRow({
    height: { value: CELL, rule: HeightRule.EXACT },
    cantSplit: true,
    children: codes.slice(i, i + COLS).map(cell),
  }));
}

const doc = new Document({
  creator: 'WAWIS Klimatyzacja',
  title: 'Naklejki QR WAWIS',
  styles: { default: { document: { run: { font, size: 16 } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 700, bottom: 600, left: 850, right: 850, header: 0, footer: 0 } } },
    children: [
      new Table({ width: { size: CELL * COLS, type: WidthType.DXA }, columnWidths: Array(COLS).fill(CELL), rows }),
      new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(out, 'naklejki-qr-wawis.docx'), buf);
  console.log('docx ok');
});
