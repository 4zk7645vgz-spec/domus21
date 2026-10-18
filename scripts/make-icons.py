#!/usr/bin/env python3
"""Genera le icone PNG (casa stilizzata). Uso: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
import os

def draw(size, pad_ratio):
    S = size * 4  # supersampling
    im = Image.new("RGB", (S, S), "#1d5c58")
    d = ImageDraw.Draw(im)
    u = S * (1 - 2 * pad_ratio) / 100.0
    o = S * pad_ratio
    P = lambda x, y: (o + x * u, o + y * u)
    d.polygon([P(50, 14), P(88, 46), P(12, 46)], fill="#f5f4f0")           # tetto
    d.rectangle([*P(22, 44), *P(78, 86)], fill="#f5f4f0")                   # corpo
    d.rounded_rectangle([*P(42, 58), *P(58, 86)], radius=u * 3, fill="#1d5c58")  # porta
    return im.resize((size, size), Image.LANCZOS)

os.makedirs("icons", exist_ok=True)
draw(180, 0.14).save("icons/icon-180.png")
draw(192, 0.14).save("icons/icon-192.png")
draw(512, 0.14).save("icons/icon-512.png")
draw(512, 0.26).save("icons/icon-maskable-512.png")
print("icone generate")
