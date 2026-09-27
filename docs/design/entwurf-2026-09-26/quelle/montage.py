"""Kontaktbögen aus Screenshots: montage.py <ziel.png> <spalten> <zielbreite je Bild> datei1 datei2 …"""
import sys
from PIL import Image, ImageDraw, ImageFont

ziel, spalten, breite, *dateien = sys.argv[1:]
spalten, breite = int(spalten), int(breite)
bilder = []
for d in dateien:
    im = Image.open(d).convert('RGB')
    f = breite / im.width
    im = im.resize((breite, int(im.height * f)), Image.LANCZOS)
    # nur den oberen Teil, sonst werden lange Seiten riesig
    if im.height > breite * 2.2:
        im = im.crop((0, 0, breite, int(breite * 2.2)))
    bilder.append((d.split('/')[-1].replace('.png', ''), im))
zeilen = (len(bilder) + spalten - 1) // spalten
zh = max(b.height for _, b in bilder) + 28
sheet = Image.new('RGB', (spalten * (breite + 16) + 16, zeilen * (zh + 16) + 16), (200, 210, 215))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except Exception:
    font = ImageFont.load_default()
for i, (name, b) in enumerate(bilder):
    x = 16 + (i % spalten) * (breite + 16)
    y = 16 + (i // spalten) * (zh + 16)
    draw.text((x, y), name[:60], fill=(20, 30, 40), font=font)
    sheet.paste(b, (x, y + 22))
sheet.save(ziel, optimize=True)
print(ziel, sheet.size)
