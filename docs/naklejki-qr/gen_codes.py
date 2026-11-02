"""Generuje unikalne kody naklejek WAWIS, PDF (wektorowy) i obrazki PNG do Worda."""
import csv, json, secrets, sys
from pathlib import Path
from reportlab.graphics.barcode import qrencoder
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
BASE_URL = 'https://wawis-klima.vercel.app/u/'
ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'  # bez 0/O, 1/I/L
COLS, ROWS, PAGES = 6, 9, 3
CELL = 30 * mm
COUNT = COLS * ROWS * PAGES

import os
codes, seen = [], set()
for prev in filter(None, os.environ.get('WAWIS_QR_EXCLUDE','').split(',')):
    seen.update(json.load(open(prev)))
PREFIX = os.environ.get('WAWIS_QR_NAME', 'naklejki-qr-wawis')
while len(codes) < COUNT:
    c = ''.join(secrets.choice(ALPHABET) for _ in range(8))
    if c not in seen:
        seen.add(c); codes.append(c)

def label(c): return f'{c[:4]}-{c[4:]}'

def matrix(text):
    for version in range(1, 11):
        qr = qrencoder.QRCode(version, qrencoder.QRErrorCorrectLevel.Q)
        qr.addData(text)
        try:
            qr.make()
            break
        except Exception:
            continue
    n = qr.getModuleCount()
    return [[qr.isDark(r, c) for c in range(n)] for r in range(n)]

with open(OUT / f'{PREFIX}-kody.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['nr', 'kod', 'kod_na_naklejce', 'adres_w_qr'])
    for i, c in enumerate(codes, 1):
        w.writerow([i, c, label(c), BASE_URL + c])

# Czcionka z polskimi znakami (DejaVu, jeśli jest)
font, font_bold = 'Helvetica', 'Helvetica-Bold'
for name, path in [('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
                   ('DejaVu-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')]:
    if Path(path).exists():
        pdfmetrics.registerFont(TTFont(name, path))
if 'DejaVu' in pdfmetrics.getRegisteredFontNames():
    font, font_bold = 'DejaVu', 'DejaVu-Bold'

page_w, page_h = A4
mx = (page_w - COLS * CELL) / 2
my = (page_h - ROWS * CELL) / 2
QR = 18 * mm

pdf = canvas.Canvas(str(OUT / f'{PREFIX}.pdf'), pagesize=A4)
pdf.setTitle('Naklejki QR WAWIS')
pdf.setAuthor('WAWIS Klimatyzacja')
images_dir = OUT / 'png'; images_dir.mkdir(exist_ok=True)
for p in range(PAGES):
    # linie cięcia
    pdf.setStrokeColorRGB(0.78, 0.8, 0.84); pdf.setLineWidth(0.25); pdf.setDash(1.5, 1.5)
    for i in range(COLS + 1):
        x = mx + i * CELL; pdf.line(x, my, x, my + ROWS * CELL)
    for j in range(ROWS + 1):
        y = my + j * CELL; pdf.line(mx, y, mx + COLS * CELL, y)
    pdf.setDash()
    for r in range(ROWS):
        for col in range(COLS):
            idx = p * COLS * ROWS + r * COLS + col
            code = codes[idx]
            m = matrix(BASE_URL + code)
            n = len(m)
            x0 = mx + col * CELL
            ytop = my + (ROWS - r) * CELL
            # nagłówek
            pdf.setFillColorRGB(0.06, 0.13, 0.23)
            pdf.setFont(font_bold, 5.6)
            pdf.drawCentredString(x0 + CELL / 2, ytop - 3.2 * mm, 'WAWIS Klimatyzacja')
            # QR
            mod = QR / n
            qx = x0 + (CELL - QR) / 2
            qy = ytop - 5.6 * mm - QR
            pdf.setFillColorRGB(0, 0, 0)
            for rr in range(n):
                for cc in range(n):
                    if m[rr][cc]:
                        pdf.rect(qx + cc * mod, qy + (n - 1 - rr) * mod, mod + 0.01, mod + 0.01, stroke=0, fill=1)
            # kod
            pdf.setFont(font_bold, 8)
            pdf.drawCentredString(x0 + CELL / 2, qy - 4.4 * mm, label(code))
            # PNG do Worda (cisza 0, 12 px na moduł)
            px = 12
            img = Image.new('1', (n * px, n * px), 1)
            pix = img.load()
            for rr in range(n):
                for cc in range(n):
                    if m[rr][cc]:
                        for dy in range(px):
                            for dx in range(px):
                                pix[cc * px + dx, rr * px + dy] = 0
            img.save(images_dir / f'{code}.png')
    pdf.showPage()
pdf.save()
json.dump(codes, open(OUT / 'codes.json', 'w'))
print(len(codes), 'kodów; moduły QR:', n)
