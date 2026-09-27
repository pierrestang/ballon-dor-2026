"""Rideaux de théâtre de l'intro : détourage, agrandissement et recoloration noir et or.

Source : « Antique Toy Theater – Paper Curtain », EKDuncan (eveyd, DeviantArt),
dans assets-source/rideaux/rideaux-source.png. Le damier « transparent » y est dessiné
dans l'image : on le retire en gardant la zone reliée aux bords qui est grise ou blanche.

    python3 scripts/rideaux.py
→ public/assets/intro/rideau-gauche.webp et rideau-droit.webp (cadre : lambrequin et
  rideaux latéraux, en deux moitiés) et rideau-ferme.webp (panneau de velours plissé qui
  ferme la scène, généré : l'image source n'a pas de rideau fermé ; celui de droite est le
  même, retourné en CSS).
"""
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-source/rideaux/rideaux-source.png"
OUT = ROOT / "public/assets/intro"
ESRGAN = Path.home() / "joueurs/outils/realesrgan/realesrgan-ncnn-vulkan"

CROP_BOTTOM = 746      # la ligne de crédit commence en dessous
WIDTH = 1800           # largeur finale des deux moitiés réunies
QUALITY = 72

# Palette : velours rouge profond, franges dans l'or du site.
VELVET = [(0.0, (10, 1, 3)), (0.35, (66, 5, 12)), (0.7, (138, 16, 26)), (1.0, (214, 72, 72))]
GOLD = [(0.0, (40, 26, 6)), (0.3, (138, 97, 24)), (0.6, (217, 178, 95)), (1.0, (255, 240, 200))]


def gradient_map(lum, stops):
    """Associe à chaque luminance (0..1) une couleur interpolée entre les étapes."""
    xs = [s[0] for s in stops]
    return np.stack([np.interp(lum, xs, [s[1][c] for s in stops]) for c in range(3)], -1)


def closed_panel(path, w=1000, h=1400, seed=7):
    """Panneau de velours plissé : plis verticaux qui se resserrent vers le haut (fronces),
    ombre sous le lambrequin et au bord intérieur, grain de velours."""
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]
    xs = x * (1.35 - 0.35 * y)             # plis plus serrés en haut
    fold = np.zeros((h, w))
    for f, a in [(5, 1.0), (9, 0.55), (15, 0.3), (23, 0.15)]:
        phase = rng.uniform(0, 2 * np.pi)
        wobble = 0.02 * np.sin(2 * np.pi * (y * rng.uniform(0.6, 1.4)) + rng.uniform(0, 6))
        fold += a * np.cos(2 * np.pi * f * (xs + wobble) + phase)
    fold = (fold - fold.min()) / (fold.max() - fold.min())
    lum = 0.12 + 0.78 * fold ** 1.4                          # creux sombres, crêtes lumineuses
    lum *= 0.55 + 0.45 * np.clip(y / 0.25, 0, 1)             # ombre sous le lambrequin
    lum *= 1 - 0.35 * np.clip((y - 0.85) / 0.15, 0, 1)       # bas plus sombre
    lum *= 1 - 0.5 * np.clip((x - 0.9) / 0.1, 0, 1) ** 2     # bord intérieur (côté droit du panneau)
    lum += rng.normal(0, 0.025, (h, w))                      # grain du velours
    rgb = gradient_map(np.clip(lum, 0, 1), VELVET)
    Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).save(path, quality=QUALITY, method=6)


def main():
    im = Image.open(SRC).convert("RGB")
    im = im.crop((0, 0, im.width, CROP_BOTTOM))
    a = np.asarray(im).astype(np.float32)

    # Fond : pixels clairs et neutres (damier blanc / gris) reliés aux bords de l'image.
    spread = a.max(-1) - a.min(-1)
    light = (a.min(-1) > 205) & (spread < 14)
    labels, _ = ndimage.label(light)
    edge_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, edge_labels[edge_labels > 0])
    # Le damier entre les franges n'est pas toujours relié aux bords : grandes zones claires aussi.
    sizes = ndimage.sum(light, labels, range(labels.max() + 1))
    background |= light & (sizes[labels] > 400)
    background = ndimage.binary_dilation(background, iterations=1)
    alpha = Image.fromarray(((~background) * 255).astype(np.uint8))

    # Agrandissement ×4 (Real-ESRGAN) puis retour à la largeur voulue.
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.png", Path(tmp) / "out.png"
        im.save(src)
        subprocess.run([str(ESRGAN), "-i", str(src), "-o", str(dst), "-n", "realesrgan-x4plus",
                        "-s", "4", "-f", "png"], check=True, capture_output=True,
                       cwd=ESRGAN.parent)
        big = Image.open(dst).convert("RGB")
    size = (WIDTH, round(WIDTH * im.height / im.width))
    big = big.resize(size, Image.LANCZOS)
    alpha = alpha.resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))

    # Recoloration : le rouge devient velours noir, le jaune devient or, selon la teinte.
    rgb = np.asarray(big).astype(np.float32) / 255
    hsv = np.asarray(big.convert("HSV")).astype(np.float32) / 255
    hue, sat = hsv[..., 0] * 360, hsv[..., 1]
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    gold_w = np.clip(1 - np.abs(hue - 50) / 25, 0, 1) * np.clip((sat - 0.15) / 0.2, 0, 1)
    velvet_lum = np.clip(lum / 0.55, 0, 1) ** 1.1
    gold_lum = np.clip((lum - 0.05) / 0.75, 0, 1)
    out = (gradient_map(velvet_lum, VELVET) * (1 - gold_w[..., None])
           + gradient_map(gold_lum, GOLD) * gold_w[..., None])
    final = Image.fromarray(out.clip(0, 255).astype(np.uint8)).convert("RGBA")
    final.putalpha(alpha)

    OUT.mkdir(parents=True, exist_ok=True)
    half = WIDTH // 2
    final.crop((0, 0, half, size[1])).save(OUT / "rideau-gauche.webp", quality=QUALITY, method=6)
    final.crop((half, 0, WIDTH, size[1])).save(OUT / "rideau-droit.webp", quality=QUALITY, method=6)
    final.save(Path(tempfile.gettempdir()) / "rideaux-apercu.png")
    closed_panel(OUT / "rideau-ferme.webp")
    for f in ("rideau-gauche.webp", "rideau-droit.webp", "rideau-ferme.webp"):
        print(f, round((OUT / f).stat().st_size / 1024), "ko")


if __name__ == "__main__":
    main()
