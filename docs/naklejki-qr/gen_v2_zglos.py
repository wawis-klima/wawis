"""Naklejki WAWIS v2 (06.11.2026): te same kody z CSV partii, nowy układ z „ZGŁOŚ AWARIĘ / LUB SERWIS”."""
import csv, json, sys
from pathlib import Path
from reportlab.graphics.barcode import qrencoder
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageDraw, ImageFont

src_csv, OUT, PREFIX = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
OUT.mkdir(parents=True, exist_ok=True)
BASE_URL = 'https://wawis-klima.vercel.app/u/'
rows = list(csv.DictReader(open(src_csv, encoding='utf-8'), delimiter=';'))
codes = [r['kod'] for r in rows]
assert len(codes) == 162 and len(set(codes)) == 162
COLS, ROWS = 6, 9
CELL = 30 * mm
QR = 14.5 * mm
FONT_DIR = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', FONT_DIR + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', FONT_DIR + 'DejaVuSans-Bold.ttf'))
BLUE = (0.0784, 0.392, 0.957)   # #1464F4
INK = (0.075, 0.125, 0.224)

def label(c): return f'{c[:4]}-{c[4:]}'

def matrix(text):
    for version in range(1, 11):
        qr = qrencoder.QRCode(version, qrencoder.QRErrorCorrectLevel.M)
        qr.addData(text)
        try:
            qr.make(); break
        except Exception:
            continue
    n = qr.getModuleCount()
    return [[qr.isDark(r, c) for c in range(n)] for r in range(n)]

# Układ w komórce 30 × 30 mm (odległości od górnej krawędzi)
L1, L2, L3 = 2.9 * mm, 6.3 * mm, 9.3 * mm      # linie bazowe tekstów górnych
QR_TOP = 11.2 * mm
CODE_BASE = QR_TOP + QR + 3.6 * mm

page_w, page_h = A4
mx = (page_w - COLS * CELL) / 2
my = (page_h - ROWS * CELL) / 2
pdf = canvas.Canvas(str(OUT / f'{PREFIX}.pdf'), pagesize=A4)
pdf.setTitle('Naklejki QR WAWIS — zgłoś awarię lub serwis'); pdf.setAuthor('WAWIS Klimatyzacja')
png_dir = OUT / 'png'; png_dir.mkdir(exist_ok=True)
for p in range(3):
    pdf.setStrokeColorRGB(0.78, 0.8, 0.84); pdf.setLineWidth(0.25); pdf.setDash(1.5, 1.5)
    for i in range(COLS + 1): pdf.line(mx + i * CELL, my, mx + i * CELL, my + ROWS * CELL)
    for j in range(ROWS + 1): pdf.line(mx, my + j * CELL, mx + COLS * CELL, my + j * CELL)
    pdf.setDash()
    for r in range(ROWS):
        for col in range(COLS):
            code = codes[p * 54 + r * COLS + col]
            x0 = mx + col * CELL; cx = x0 + CELL / 2
            top = my + (ROWS - r) * CELL
            pdf.setFillColorRGB(*INK); pdf.setFont('DVB', 4.8)
            pdf.drawCentredString(cx, top - L1, 'WAWIS Klimatyzacja')
            pdf.setFillColorRGB(*BLUE); pdf.setFont('DVB', 7.6)
            pdf.drawCentredString(cx, top - L2, 'ZGŁOŚ AWARIĘ')
            pdf.drawCentredString(cx, top - L3, 'LUB SERWIS')
            m = matrix(BASE_URL + code); n = len(m); mod = QR / n
            qx = cx - QR / 2; qy = top - QR_TOP - QR
            pdf.setFillColorRGB(0, 0, 0)
            for rr in range(n):
                for cc in range(n):
                    if m[rr][cc]:
                        pdf.rect(qx + cc * mod, qy + (n - 1 - rr) * mod, mod + 0.01, mod + 0.01, stroke=0, fill=1)
            pdf.setFillColorRGB(*INK); pdf.setFont('DVB', 7.4)
            pdf.drawCentredString(cx, top - CODE_BASE, label(code))
            px = 12
            img = Image.new('1', (n * px, n * px), 1); d = ImageDraw.Draw(img)
            for rr in range(n):
                for cc in range(n):
                    if m[rr][cc]: d.rectangle([cc * px, rr * px, cc * px + px - 1, rr * px + px - 1], fill=0)
            img.save(png_dir / f'{code}.png')
    pdf.showPage()
pdf.save()
json.dump(codes, open(OUT / 'codes.json', 'w'))
print('ok', n, 'modułów, moduł', round(QR / n / mm, 2), 'mm')
