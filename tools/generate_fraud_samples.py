#!/usr/bin/env python3
"""
One-off generator for the fraud-investigation Try-It-Out demo sample documents.

Produces 8 visibly fictitious "Zava State" / "Specimen" PNG mocks and a
manifest.json that the backend serves from
``src/backend/wwwroot/fraud/samples/``.

Run once:
    python3 tools/generate_fraud_samples.py

The output is committed to the repo — the runtime never invokes this script.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "backend" / "wwwroot" / "fraud" / "samples"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def _font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if mono:
        candidates += [
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        ]
    candidates += [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


# ───────────────────────── Driver licence ─────────────────────────
def driver_licence(path: Path, *, fake: bool) -> None:
    W, H = 900, 560
    img = Image.new("RGB", (W, H), "#0b3d6b" if not fake else "#0c3f70")
    d = ImageDraw.Draw(img)

    # card body
    d.rounded_rectangle((24, 24, W - 24, H - 24), radius=22, fill="#f3f7fb")
    # banner
    banner = "ZAVA STATE — DRIVER LICENCE"
    if fake:
        banner = "ZAVAA STATE — DRIVER LICENCE"  # subtle issuer misspelling
    d.rectangle((24, 24, W - 24, 92), fill="#0b3d6b")
    d.text((48, 44), banner, fill="white", font=_font(26, bold=True))
    d.text((W - 220, 50), "SPECIMEN", fill="#fde68a", font=_font(20, bold=True))

    # photo box
    d.rectangle((56, 130, 256, 360), fill="#cbd5e1", outline="#475569", width=2)
    d.text((96, 230), "PHOTO", fill="#475569", font=_font(22, bold=True))

    # holographic band (legit only)
    if not fake:
        for i in range(8):
            x = 56 + i * 25
            d.rectangle((x, 380, x + 18, 420), fill=(180 + i * 8, 200, 240 - i * 5))
        d.text((56, 425), "Holographic security band", fill="#64748b", font=_font(11))
    else:
        # broken hologram band: jagged line, marked
        d.line((56, 400, 230, 410), fill="#9ca3af", width=2)
        d.text((56, 425), "(security band damaged)", fill="#9ca3af", font=_font(11))

    f = _font(18)
    fb = _font(18, bold=True)
    fl = _font(12, bold=True)
    if fake:
        # holder data: mismatched DOB (year clearly wrong relative to issue date)
        rows = [
            ("SURNAME", "RIVERA"),
            ("GIVEN NAMES", "MICHAEL J"),
            ("DATE OF BIRTH", "30 FEB 2020"),  # impossible date
            ("LICENCE NO.", "DL-99-AA-117"),
            ("ISSUE DATE", "12 MAR 2024"),
            ("EXPIRY", "12 MAR 2029"),
            ("ADDRESS", "12 OAK ST, ZAVA CITY"),
        ]
    else:
        rows = [
            ("SURNAME", "RIVERA"),
            ("GIVEN NAMES", "MICHAEL J"),
            ("DATE OF BIRTH", "08 JUL 1978"),
            ("LICENCE NO.", "DL-77-XK-204"),
            ("ISSUE DATE", "12 MAR 2024"),
            ("EXPIRY", "12 MAR 2029"),
            ("ADDRESS", "12 OAK ST, ZAVA CITY"),
        ]
    y = 130
    for label, value in rows:
        d.text((300, y), label, fill="#64748b", font=fl)
        font_used = fb if not fake or label != "DATE OF BIRTH" else _font(18, bold=True)
        # Render fake DOB in a different font to look retyped
        if fake and label == "DATE OF BIRTH":
            d.text((300, y + 14), value, fill="#7f1d1d", font=_font(20, mono=True, bold=True))
        else:
            d.text((300, y + 14), value, fill="#0f172a", font=font_used)
        y += 44

    # footer
    d.text((300, H - 70), "Issued by Zava State Roads Authority", fill="#475569", font=_font(13))
    d.text((300, H - 50), "Specimen — for demo purposes only", fill="#94a3b8", font=_font(11))
    img.save(path, "PNG")


# ───────────────────────── Passport ─────────────────────────
def passport(path: Path, *, fake: bool) -> None:
    W, H = 900, 600
    img = Image.new("RGB", (W, H), "#1f1147")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((20, 20, W - 20, H - 20), radius=16, fill="#fff8e7")

    d.text((40, 36), "ZAVA REPUBLIC — PASSPORT", fill="#1f1147", font=_font(26, bold=True))
    d.text((W - 220, 42), "SPECIMEN", fill="#b45309", font=_font(20, bold=True))

    # photo
    photo_box = (50, 110, 270, 360)
    d.rectangle(photo_box, fill="#e5d3a8", outline="#1f1147", width=2)
    d.text((110, 220), "PHOTO", fill="#1f1147", font=_font(22, bold=True))
    if fake:
        # visible re-paste / sticker around the photo
        d.rectangle((46, 106, 274, 364), outline="#dc2626", width=3)
        d.line((50, 110, 270, 360), fill="#dc2626", width=1)
        d.line((270, 110, 50, 360), fill="#dc2626", width=1)
        d.text((50, 366), "(photo region appears re-pasted)", fill="#7f1d1d", font=_font(11, bold=True))

    fb = _font(18, bold=True)
    fl = _font(12, bold=True)
    rows_legit = [
        ("Type / Code", "P / ZAV"),
        ("Passport No.", "ZA8842917"),
        ("Surname", "OKAFOR"),
        ("Given Names", "GRACE A"),
        ("Nationality", "ZAVAN"),
        ("Date of Birth", "14 NOV 1985"),
        ("Sex", "F"),
        ("Date of Issue", "02 FEB 2022"),
        ("Date of Expiry", "01 FEB 2032"),
    ]
    rows_fake = list(rows_legit)
    rows = rows_fake if fake else rows_legit
    y = 110
    for label, value in rows:
        d.text((300, y), label.upper(), fill="#6b7280", font=fl)
        d.text((300, y + 14), value, fill="#1f1147", font=fb)
        y += 28

    # MRZ
    if fake:
        # check digits inconsistent — clearly mangled
        mrz1 = "P<ZAVOKAFOR<<GRACE<A<<<<<<<<<<<<<<<<<<<<<<<<"
        mrz2 = "ZA8842917X9ZAV8511144F3201019<<<<<<<<<<<<<<00"  # bad final checks
    else:
        mrz1 = "P<ZAVOKAFOR<<GRACE<A<<<<<<<<<<<<<<<<<<<<<<<<"
        mrz2 = "ZA88429174ZAV8511144F3202012<<<<<<<<<<<<<<06"
    mrz_font = _font(20, mono=True, bold=True)
    d.rectangle((40, H - 130, W - 40, H - 30), fill="#fef3c7")
    d.text((50, H - 122), mrz1, fill="#1f1147", font=mrz_font)
    d.text((50, H - 92), mrz2, fill="#1f1147", font=mrz_font)
    d.text((50, H - 60), "Specimen — for demo purposes only", fill="#92400e", font=_font(11))
    img.save(path, "PNG")


# ───────────────────────── Receipt ─────────────────────────
def receipt(path: Path, *, duplicate: bool) -> None:
    W, H = 700, 900
    img = Image.new("RGB", (W, H), "#fafaf6")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((30, 30, W - 30, H - 30), radius=10, fill="white", outline="#e5e7eb", width=2)

    d.text((50, 50), "GADGET HOUSE — Zava City", fill="#0f172a", font=_font(24, bold=True))
    d.text((50, 84), "ABN 12 345 678 901   |   gadgethouse.zava", fill="#475569", font=_font(13))
    d.text((50, 106), "Receipt #: GH-2026-44827", fill="#475569", font=_font(13, mono=True))
    d.text((50, 126), "Date: 02 May 2026   |   Cashier: 014", fill="#475569", font=_font(13, mono=True))
    d.line((50, 156, W - 50, 156), fill="#94a3b8", width=1)

    items = [
        ("Lenovo ThinkPad X1 Carbon Gen 11", "1", "2,899.00"),
        ("Sony WH-1000XM5 Headphones", "1", "549.00"),
        ("Apple iPad Air 11\" 256GB", "1", "1,099.00"),
        ("Samsung 1TB Portable SSD T7", "2", "298.00"),
        ("USB-C Hub (4-port)", "1", "79.00"),
    ]
    fl = _font(14, mono=True)
    fb = _font(14, mono=True, bold=True)
    y = 175
    d.text((50, y), "ITEM", fill="#0f172a", font=fb)
    d.text((460, y), "QTY", fill="#0f172a", font=fb)
    d.text((560, y), "PRICE", fill="#0f172a", font=fb)
    y += 26
    for name, qty, price in items:
        d.text((50, y), name, fill="#0f172a", font=fl)
        d.text((472, y), qty, fill="#0f172a", font=fl)
        d.text((560, y), price, fill="#0f172a", font=fl)
        y += 26

    d.line((50, y + 6, W - 50, y + 6), fill="#94a3b8", width=1)
    y += 20
    d.text((50, y), "SUBTOTAL", fill="#0f172a", font=fb)
    d.text((560, y), "4,924.00", fill="#0f172a", font=fl)
    y += 26
    d.text((50, y), "GST (10%)", fill="#0f172a", font=fb)
    d.text((560, y), "  492.40", fill="#0f172a", font=fl)
    y += 26
    d.text((50, y), "TOTAL", fill="#0f172a", font=_font(18, mono=True, bold=True))
    d.text((520, y), "$5,416.40", fill="#0f172a", font=_font(18, mono=True, bold=True))

    y += 60
    d.text((50, y), "Paid: VISA ****-2191   Approval: 014823", fill="#475569", font=fl)
    y += 26
    d.text((50, y), "Returns within 30 days with this receipt.", fill="#475569", font=_font(13))

    if duplicate:
        # subtle stamp showing this is a re-used / duplicate document
        d.text((50, H - 110), "(This receipt has been submitted on a prior claim — duplicate)", fill="#9ca3af", font=_font(11, bold=True))

    d.text((50, H - 80), "Specimen — for demo purposes only", fill="#94a3b8", font=_font(11))
    img.save(path, "PNG")


# ───────────────────────── Repair quote ─────────────────────────
def repair_quote(path: Path, *, edited: bool) -> None:
    W, H = 800, 1000
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # letterhead
    d.rectangle((0, 0, W, 110), fill="#0f5132")
    d.text((40, 30), "NORTHSIDE PANEL & PAINT", fill="white", font=_font(26, bold=True))
    d.text((40, 66), "Licensed motor body repairer  |  Zava City  |  ABN 98 765 432 109", fill="#dcfce7", font=_font(13))

    d.text((40, 140), "REPAIR QUOTATION", fill="#0f172a", font=_font(22, bold=True))
    d.text((40, 176), "Quote #: NPP-Q-2026-00318", fill="#475569", font=_font(13, mono=True))
    d.text((40, 196), "Date: 03 May 2026", fill="#475569", font=_font(13, mono=True))
    d.text((40, 216), "Customer: A. Khan   |   Vehicle: 2021 Toyota Corolla — Rego ZAV-44K", fill="#475569", font=_font(13))

    d.line((40, 250, W - 40, 250), fill="#94a3b8", width=1)

    f = _font(13, mono=True)
    fb = _font(13, mono=True, bold=True)
    d.text((40, 268), "DESCRIPTION", fill="#0f172a", font=fb)
    d.text((520, 268), "LABOUR", fill="#0f172a", font=fb)
    d.text((640, 268), "PARTS", fill="#0f172a", font=fb)

    items = [
        ("Replace rear bumper assembly", "320.00", "780.00"),
        ("Replace tailgate skin", "640.00", "1,150.00"),
        ("Repaint rear quarter panels (2)", "880.00", "210.00"),
        ("Realign rear suspension geometry", "260.00", "0.00"),
        ("Sundries, masking, materials", "0.00", "120.00"),
    ]
    y = 296
    for desc, lab, parts in items:
        d.text((40, y), desc, fill="#0f172a", font=f)
        d.text((520, y), lab, fill="#0f172a", font=f)
        d.text((640, y), parts, fill="#0f172a", font=f)
        y += 26

    y += 10
    d.line((40, y, W - 40, y), fill="#94a3b8", width=1)
    y += 14
    d.text((40, y), "Labour subtotal", fill="#0f172a", font=fb)
    d.text((520, y), "2,100.00", fill="#0f172a", font=f)
    y += 22
    d.text((40, y), "Parts subtotal", fill="#0f172a", font=fb)
    d.text((520, y), "2,260.00", fill="#0f172a", font=f)
    y += 22
    d.text((40, y), "GST (10%)", fill="#0f172a", font=fb)
    d.text((520, y), "  436.00", fill="#0f172a", font=f)
    y += 28

    d.text((40, y), "QUOTED TOTAL", fill="#0f172a", font=_font(16, mono=True, bold=True))
    if edited:
        # Total visibly retyped in a clearly different font, slightly off baseline
        d.rectangle((500, y - 4, 760, y + 28), outline="#dc2626", width=1)
        d.text((506, y + 1), "$ 8,796.00", fill="#7f1d1d", font=_font(18, bold=True))
        d.text((40, y + 36), "(total field appears retyped in a different font)", fill="#9ca3af", font=_font(11, bold=True))
    else:
        d.text((520, y), "$4,796.00", fill="#0f172a", font=_font(16, mono=True, bold=True))

    y += 90
    d.text((40, y), "Quote valid for 30 days. Includes parts and labour as listed.", fill="#475569", font=_font(13))
    y += 22
    d.text((40, y), "Authorised by:  S. Mendez  (workshop manager)", fill="#475569", font=_font(13))

    d.text((40, H - 60), "Specimen — for demo purposes only", fill="#94a3b8", font=_font(11))
    img.save(path, "PNG")


# ───────────────────────── Manifest ─────────────────────────
SAMPLES = [
    {
        "id": "dl-real",
        "label": "Driver Licence — Michael Rivera (Zava State)",
        "kind": "driver-licence",
        "src": "/fraud/samples/driver-licence-real.png",
        "expected": "legit",
        "description": "Plausible Zava State driver licence for the home-burst-pipe persona.",
        "expectedHolderName": "Michael Rivera",
        "documentNumber": "DL-77-XK-204",
        "issuer": "Zava State Roads Authority",
    },
    {
        "id": "dl-fake",
        "label": "Driver Licence — Tampered (Zava State)",
        "kind": "driver-licence",
        "src": "/fraud/samples/driver-licence-tampered.png",
        "expected": "fake",
        "description": "Mismatched DOB, misspelt issuer banner, broken hologram security band.",
        "expectedHolderName": "Michael Rivera",
        "documentNumber": "DL-99-AA-117",
        "issuer": "Zavaa State Roads Authority",
    },
    {
        "id": "passport-real",
        "label": "Passport — Grace Okafor (Zava Republic)",
        "kind": "passport",
        "src": "/fraud/samples/passport-real.png",
        "expected": "legit",
        "description": "Plausible Zava Republic passport bio page.",
        "expectedHolderName": "Grace Okafor",
        "documentNumber": "ZA8842917",
        "issuer": "Zava Republic",
    },
    {
        "id": "passport-fake",
        "label": "Passport — Photo swap (Zava Republic)",
        "kind": "passport",
        "src": "/fraud/samples/passport-photo-swap.png",
        "expected": "fake",
        "description": "Photo region clearly re-pasted; MRZ check digits inconsistent.",
        "expectedHolderName": "Grace Okafor",
        "documentNumber": "ZA8842917X",
        "issuer": "Zava Republic",
    },
    {
        "id": "receipt-real",
        "label": "Electronics receipt — Gadget House #44827",
        "kind": "receipt",
        "src": "/fraud/samples/receipt-real.png",
        "expected": "legit",
        "description": "Itemised electronics receipt matching the staged-theft scenario contents.",
        "expectedTotal": 5416.40,
        "documentNumber": "GH-2026-44827",
        "issuer": "Gadget House",
    },
    {
        "id": "receipt-dup",
        "label": "Electronics receipt — Gadget House #44827 (duplicate)",
        "kind": "receipt",
        "src": "/fraud/samples/receipt-duplicate.png",
        "expected": "fake",
        "description": "Same receipt previously submitted on another claim — duplicate signal.",
        "expectedTotal": 5416.40,
        "documentNumber": "GH-2026-44827",
        "issuer": "Gadget House",
    },
    {
        "id": "quote-real",
        "label": "Repair quote — Northside Panel & Paint",
        "kind": "repair-quote",
        "src": "/fraud/samples/repair-quote-real.png",
        "expected": "legit",
        "description": "Body-repair quote for the rear-end collision scenario.",
        "expectedTotal": 4796.00,
        "documentNumber": "NPP-Q-2026-00318",
        "issuer": "Northside Panel & Paint",
    },
    {
        "id": "quote-edited",
        "label": "Repair quote — Northside Panel & Paint (edited total)",
        "kind": "repair-quote",
        "src": "/fraud/samples/repair-quote-edited.png",
        "expected": "fake",
        "description": "Same quote with the total visibly retyped in a different font.",
        "expectedTotal": 8796.00,
        "documentNumber": "NPP-Q-2026-00318",
        "issuer": "Northside Panel & Paint",
    },
]


def main() -> None:
    driver_licence(OUT_DIR / "driver-licence-real.png", fake=False)
    driver_licence(OUT_DIR / "driver-licence-tampered.png", fake=True)
    passport(OUT_DIR / "passport-real.png", fake=False)
    passport(OUT_DIR / "passport-photo-swap.png", fake=True)
    receipt(OUT_DIR / "receipt-real.png", duplicate=False)
    receipt(OUT_DIR / "receipt-duplicate.png", duplicate=True)
    repair_quote(OUT_DIR / "repair-quote-real.png", edited=False)
    repair_quote(OUT_DIR / "repair-quote-edited.png", edited=True)

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps({"samples": SAMPLES}, indent=2) + "\n")
    print(f"Wrote {len(SAMPLES)} samples and manifest to {OUT_DIR}")


if __name__ == "__main__":
    main()
