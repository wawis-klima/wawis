"""Naklejki WAWIS v3 (06.11.2026): 35 × 30 mm, czarny napis „ZGŁOŚ AWARIĘ LUB SERWIS” w jednej linii.
Te same kody z CSV partii. PDF wektorowy + PNG całej naklejki (600 dpi) do Worda."""
import csv, json, math, sys
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
codes = [r['kod'] for r in csv.DictReader(open(src_csv, encoding='utf-8'), delimiter=';')]
assert len(codes) == 162 and len(set(codes)) == 162
W, H = 35 * mm, 30 * mm
COLS, ROWS = 5, 9
PER_PAGE = COLS * ROWS
QR = 16 * mm
FD = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DVB', FD + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVCB', FD + 'DejaVuSansCondensed-Bold.ttf'))
TOP_TEXT, MAIN_TEXT = 'WAWIS Klimatyzacja', 'ZGŁOŚ AWARIĘ LUB SERWIS'
S1, S2, S3 = 4.8, 6.4, 7.4             # pt: nagłówek, główny napis, numer
L1, L2 = 2.8 * mm, 6.1 * mm            # linie bazowe od góry
QR_TOP = 8.0 * mm
CODE_BASE = QR_TOP + QR + 4.0 * mm
assert pdfmetrics.stringWidth(MAIN_TEXT, 'DVCB', S2) < W - 2 * mm

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

pages = math.ceil(len(codes) / PER_PAGE)
page_w, page_h = A4
mx, my = (page_w - COLS * W) / 2, (page_h - ROWS * H) / 2
pdf = canvas.Canvas(str(OUT / f'{PREFIX}.pdf'), pagesize=A4)
pdf.setTitle('Naklejki QR WAWIS — zgłoś awarię lub serwis'); pdf.setAuthor('WAWIS Klimatyzacja')
png_dir = OUT / 'png'; png_dir.mkdir(exist_ok=True)
DPI = 600; px_mm = DPI / 25.4
f1 = ImageFont.truetype(FD + 'DejaVuSans-Bold.ttf', round(S1 / 72 * DPI))
f2 = ImageFont.truetype(FD + 'DejaVuSansCondensed-Bold.ttf', round(S2 / 72 * DPI))
f3 = ImageFont.truetype(FD + 'DejaVuSans-Bold.ttf', round(S3 / 72 * DPI))
layout = []
for p in range(pages):
    chunk = codes[p * PER_PAGE:(p + 1) * PER_PAGE]
    rows_used = math.ceil(len(chunk) / COLS)
    pdf.setStrokeColorRGB(0.78, 0.8, 0.84); pdf.setLineWidth(0.25); pdf.setDash(1.5, 1.5)
    for idx in range(len(chunk)):
        r, col = divmod(idx, COLS)
        pdf.rect(mx + col * W, my + (ROWS - r - 1) * H, W, H, stroke=1, fill=0)
    pdf.setDash()
    for idx, code in enumerate(chunk):
        r, col = divmod(idx, COLS)
        x0 = mx + col * W; cx = x0 + W / 2; top = my + (ROWS - r) * H
        pdf.setFillColorRGB(0, 0, 0)
        pdf.setFont('DVB', S1); pdf.drawCentredString(cx, top - L1, TOP_TEXT)
        pdf.setFont('DVCB', S2); pdf.drawCentredString(cx, top - L2, MAIN_TEXT)
        m = matrix(BASE_URL + code); n = len(m); mod = QR / n
        qx, qy = cx - QR / 2, top - QR_TOP - QR
        for rr in range(n):
            for cc in range(n):
                if m[rr][cc]:
                    pdf.rect(qx + cc * mod, qy + (n - 1 - rr) * mod, mod + 0.01, mod + 0.01, stroke=0, fill=1)
        pdf.setFont('DVB', S3); pdf.drawCentredString(cx, top - CODE_BASE, label(code))
        # PNG całej naklejki do Worda (identyczny układ)
        iw, ih = round(35 * px_mm), round(30 * px_mm)
        img = Image.new('L', (iw, ih), 255); d = ImageDraw.Draw(img)
        def text(y_base_mm, s, font):
            asc = font.getmetrics()[0]
            d.text((iw / 2, y_base_mm * px_mm - asc), s, font=font, fill=0, anchor='mt' if False else None) if False else None
            w = d.textlength(s, font=font)
            d.text(((iw - w) / 2, y_base_mm * px_mm - asc), s, font=font, fill=0)
        text(2.8, TOP_TEXT, f1); text(6.1, MAIN_TEXT, f2)
        qpx = 16 * px_mm; m_px = qpx / n; qx0 = (iw - qpx) / 2; qy0 = 8.0 * px_mm
        for rr in range(n):
            for cc in range(n):
                if m[rr][cc]:
                    d.rectangle([round(qx0 + cc * m_px), round(qy0 + rr * m_px), round(qx0 + (cc + 1) * m_px) - 1, round(qy0 + (rr + 1) * m_px) - 1], fill=0)
        text(8.0 + 16 + 4.0, label(code), f3)
        img.save(png_dir / f'{code}.png', dpi=(DPI, DPI))
        layout.append({'code': code, 'page': p + 1, 'row': r, 'col': col})
    pdf.showPage()
pdf.save()
json.dump({'codes': codes, 'layout': layout, 'cols': COLS, 'rows': ROWS, 'pages': pages}, open(OUT / 'layout.json', 'w'))
print('ok', pages, 'stron, moduł', round(QR / n / mm, 2), 'mm, napis', round(pdfmetrics.stringWidth(MAIN_TEXT, 'DVCB', S2) / mm, 1), 'mm')
