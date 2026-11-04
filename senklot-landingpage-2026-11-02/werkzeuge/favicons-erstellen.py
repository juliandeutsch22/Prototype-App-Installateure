"""Konvertiert das bestehende Senklot-SVG unverändert in PNG und mehrgrößiges ICO.

Benötigt lokal CairoSVG und Pillow, nicht auf dem Hosting.
"""
from pathlib import Path
from cairosvg import svg2png
from PIL import Image

root = Path(__file__).resolve().parent.parent
png = root / 'assets/favicon-96.png'
svg2png(url=str(root / 'assets/senklot.svg'), write_to=str(png), output_width=96, output_height=96)
with Image.open(png) as icon:
    icon.save(root / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (96, 96)])
print('Favicon: PNG 96 × 96 und ICO mit 16/32/48/96 Pixeln erstellt.')
