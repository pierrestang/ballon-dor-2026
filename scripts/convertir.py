#!/usr/bin/env python3
"""
Vidéo fond vert (un tour complet du joueur) → séquence WebP pour le site.

  public/assets/players/sequences/<id>/000.avif … 047.avif   (rotation, ~1,7 Mo)
  public/assets/players/sequences/<id>/face.avif             (photo studio nette)
  public/assets/players/sequences/<id>/poster.avif           (photo de face réduite, ~20 ko)
  public/assets/players/sequences/<id>/dos.avif              (vue de dos réduite, inutilisée)
  public/assets/players/sequences/<id>/bust.avif             (tête et buste, cartes de la page 1)

Étapes : extraction de toutes les images, retrait de la dernière si elle duplique
la première, 48 images réparties sur le tour, incrustation chroma (fond vert →
transparent, suppression du reflet vert sur les bords), puis mise à l'échelle :
tous les joueurs ont la même taille, pieds en bas du cadre, axe de rotation au centre.

La photo studio détourée de face (dossier ~/joueurs, cf. compétence detourage-joueurs)
est bien plus nette que la vidéo : elle est calée sur l'image 000 et le site l'affiche
quand le scroll s'arrête de face. Pas de photo de dos : l'image de dos de la vidéo
diffère trop de la photo (nom et numéro dédoublés pendant le fondu).

Usage (depuis BO2026/) :
  python3 scripts/convertir.py ~/videos/<id>.mp4 <id-du-joueur>
  python3 scripts/convertir.py ~/videos/<id>.mp4 <id> --controle   # + planche de contrôle
  python3 scripts/convertir.py ~/videos/lionel-messi.mp4 lionel-messi --forcer-photo
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets/players/sequences"
CHECKS = ROOT / "assets-source/checks"
PHOTOS = Path.home() / "joueurs"   # detoures/*.png + projet.json (noms et vues)

FRAME_COUNT = 48
CANVAS = (810, 1440)          # taille de chaque image de la séquence (l × h)
BODY_HEIGHT = 0.94            # hauteur du joueur (tête → crampons) dans le cadre
FOOT_MARGIN = 0.02            # marge sous les crampons
POSTER_HEIGHT = 800
# AVIF : à poids égal, nettement plus fin que WebP (rayures des maillots, visages).
QUALITY = 70
POSTER_QUALITY = 55
AVIF_SPEED = 4                # 0 = plus lent/meilleur, 10 = plus rapide

# Les vidéos IA ont du flou de bougé quand le joueur passe de profil : on prend la
# plus nette parmi les images voisines, puis on accentue d'autant plus que l'image est floue.
# Photo studio refusée si sa silhouette recouvre trop peu celle de l'image 000
# (pose différente de la vidéo : dédoublement visible pendant le fondu).
MIN_OVERLAP = 0.80
SEARCH = 1                    # voisines examinées de part et d'autre (±3° d'angle)
SHARPEN_RADIUS = 1.2          # px, à la taille de sortie
SHARPEN_MIN, SHARPEN_MAX = 60, 140   # % d'accentuation : image la plus nette → la plus floue

# Incrustation : « excès de vert » = G − max(R, B), rapporté à celui du fond.
KEY_OPAQUE = 0.22             # en dessous : joueur (opaque)
KEY_TRANSPARENT = 0.55        # au-dessus : fond (transparent)


def find_ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit("ffmpeg introuvable : installer ffmpeg ou imageio-ffmpeg (.venv/bin/python)")


def extract(ffmpeg, video, dest):
    subprocess.check_call([ffmpeg, "-v", "error", "-i", str(video), "-map", "0:v:0",
                           "-vf", "scale=in_color_matrix=bt709:out_color_matrix=bt709:"
                           "in_range=tv:out_range=pc:flags=lanczos+accurate_rnd+full_chroma_int,"
                           "format=rgb24", "-fps_mode", "passthrough",
                           str(dest / "%04d.png")])
    files = sorted(dest.glob("*.png"))
    if not files:
        sys.exit(f"Aucune image extraite de {video}")
    return files


def sharpness(path):
    """Variance du laplacien : plus elle est haute, plus l'image est nette."""
    import cv2
    g = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE).astype(np.float32)
    return float(cv2.Laplacian(g, cv2.CV_32F).var())


def pick(files):
    """Retire la dernière image si elle duplique la première, puis en garde 48
    réparties sur le tour (000 = de face), chacune remplacée par sa voisine la plus
    nette. Renvoie les fichiers et leur netteté."""
    def small(p):
        return np.asarray(Image.open(p).convert("L").reduce(4), dtype=np.float32)
    dup = np.abs(small(files[0]) - small(files[-1])).mean()
    step = np.abs(small(files[0]) - small(files[1])).mean()
    if dup < step * 0.5:
        files = files[:-1]
    n = len(files)
    print(f"   {n} images sur un tour → {FRAME_COUNT}")
    scores = [sharpness(f) for f in files]
    chosen = [0]
    for i in range(1, FRAME_COUNT):
        t = round(i * n / FRAME_COUNT)
        candidates = [j for j in range(t - SEARCH, t + SEARCH + 1) if chosen[-1] < j < n]
        chosen.append(max(candidates, key=lambda j: scores[j]))
    moved = sum(c != round(i * n / FRAME_COUNT) for i, c in enumerate(chosen))
    print(f"   {moved} positions remplacées par une voisine plus nette")
    return [files[j] for j in chosen], [scores[j] for j in chosen]


def background_key(rgb):
    border = np.concatenate([rgb[:16].reshape(-1, 3), rgb[:, :16].reshape(-1, 3),
                             rgb[:, -16:].reshape(-1, 3)]).astype(np.float32)
    bg = np.median(border, axis=0)
    key = bg[1] - max(bg[0], bg[2])
    if key < 80:
        sys.exit(f"Le fond ne semble pas vert (RVB médian {bg.astype(int)})")
    return key


def chroma(rgb, bg_key):
    """RVB uint8 → RVBA float32 : fond vert transparent, reflet vert retiré."""
    import cv2
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    excess = (g - np.maximum(r, b)) / bg_key
    alpha = 1 - np.clip((excess - KEY_OPAQUE) / (KEY_TRANSPARENT - KEY_OPAQUE), 0, 1)

    # Ne garder que le joueur (plus grande zone opaque) : retire poussières et bruit.
    solid = (alpha > 0.5).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    if n > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        near = cv2.dilate((labels == biggest).astype(np.uint8), np.ones((9, 9), np.uint8))
        alpha *= near

    # Suppression du reflet vert : G plafonné à max(R, B).
    g = np.minimum(g, np.maximum(r, b))
    return np.dstack([r, g, b, alpha * 255])


def bbox(alpha, threshold=128):
    ys, xs = np.nonzero(alpha > threshold)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(rgba, scale, cx, feet_y):
    """Met à l'échelle et place l'image sur le canevas : axe cx au centre, pieds en bas."""
    W, H = CANVAS
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8))
    # Prémultiplier avant réduction pour éviter les franges sombres/vertes sur les bords.
    img = img.convert("RGBa").resize((round(img.width * scale), round(img.height * scale)),
                                     Image.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    ox = round(W / 2 - cx * scale)
    oy = round(H * (1 - FOOT_MARGIN) - feet_y * scale)
    canvas.paste(img, (ox, oy))
    return canvas


def sharpen(frame, percent):
    """Accentuation (masque flou) sur l'intérieur du joueur uniquement : les bords
    semi-transparents ne sont pas touchés, pour ne pas créer de halo."""
    import cv2
    from PIL import ImageFilter
    rgb = frame.convert("RGB")
    base = np.asarray(rgb, np.float32)
    sharp = np.asarray(rgb.filter(ImageFilter.UnsharpMask(SHARPEN_RADIUS, round(percent), 2)),
                       np.float32)
    alpha = frame.getchannel("A")
    inner = cv2.erode((np.asarray(alpha) > 250).astype(np.uint8), np.ones((5, 5), np.uint8))
    inner = cv2.GaussianBlur(inner.astype(np.float32), (0, 0), 1.5)[..., None]
    out = Image.fromarray(np.clip(base + (sharp - base) * inner, 0, 255).astype(np.uint8))
    out.putalpha(alpha)
    return out


def studio_photo(pid, source):
    """Photo détourée de face de ce joueur, ou None si absente.
    projet.json associe chaque fichier à un nom court (« mbappe ») et une vue."""
    config = source / "projet.json"
    if not config.exists():
        return None
    for stem, info in json.loads(config.read_text())["joueurs"].items():
        if info["nom"] in pid.split("-") and info["vue"] == "face":
            return Image.open(source / "detoures" / f"{stem}.png").convert("RGBA")
    return None


def align(photo, target):
    """Cale la photo sur l'image de séquence : même hauteur de silhouette, même centre
    horizontal, crampons sur la même ligne."""
    tx0, ty0, tx1, ty1 = bbox(np.asarray(target.getchannel("A")))
    px0, py0, px1, py1 = bbox(np.asarray(photo.getchannel("A")))
    scale = (ty1 - ty0) / (py1 - py0)
    img = photo.crop((px0, py0, px1, py1)).convert("RGBa")
    img = img.resize((round(img.width * scale), ty1 - ty0), Image.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.paste(img, (round((tx0 + tx1) / 2 - img.width / 2), ty0))
    return canvas


def control_sheet(pid, frames):
    picks = [frames[i] for i in (0, 12, 24, 36)]
    W, H = CANVAS
    sheet = Image.new("RGB", (W * 4, H * 2), "#111111")
    checker = Image.new("RGB", CANVAS, "#ffffff")
    for y in range(0, H, 24):
        for x in range(0, W, 24):
            if (x // 24 + y // 24) % 2:
                checker.paste("#cccccc", (x, y, x + 24, y + 24))
    for i, fr in enumerate(picks):
        sheet.paste(fr, (i * W, 0), fr)
        c = checker.copy()
        c.paste(fr, (0, 0), fr)
        sheet.paste(c, (i * W, H))
    CHECKS.mkdir(parents=True, exist_ok=True)
    out = CHECKS / f"{pid}.jpg"
    sheet.save(out, quality=85)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    parser.add_argument("id")
    parser.add_argument("--photos", type=Path, default=PHOTOS,
                        help=f"dossier des photos studio détourées (défaut : {PHOTOS})")
    parser.add_argument("--forcer-photo", action="store_true",
                        help="utiliser la photo de face même si sa pose diffère de la vidéo")
    parser.add_argument("--controle", action="store_true",
                        help="écrit une planche de contrôle dans assets-source/checks/")
    args = parser.parse_args()

    video = args.video.expanduser()
    if not video.exists():
        sys.exit(f"Vidéo introuvable : {video}")
    ids = {p["id"] for p in json.loads((ROOT / "players.json").read_text())}
    if args.id not in ids:
        sys.exit(f"« {args.id} » n'est pas un id de players.json : {', '.join(sorted(ids))}")

    print(f"→ {args.id}")
    with tempfile.TemporaryDirectory() as tmp:
        files, scores = pick(extract(find_ffmpeg(), video, Path(tmp)))
        first = np.asarray(Image.open(files[0]).convert("RGB"))
        bg_key = background_key(first)
        keyed = [chroma(np.asarray(Image.open(f).convert("RGB")), bg_key) for f in files]

    # Échelle commune à toute la séquence, calculée sur l'image de face.
    x0, y0, x1, y1 = bbox(keyed[0][..., 3])
    scale = CANVAS[1] * BODY_HEIGHT / (y1 - y0)
    boxes = [bbox(k[..., 3]) for k in keyed]
    ux0, ux1 = min(b[0] for b in boxes), max(b[2] for b in boxes)
    cx = (x0 + x1) / 2
    feet_y = max(b[3] for b in boxes)
    half = max(cx - ux0, ux1 - cx) * scale
    if half > CANVAS[0] / 2:
        print(f"   ⚠ le joueur dépasse du cadre de {half - CANVAS[0] / 2:.0f} px par côté")
    if scale > 1:
        print(f"   ⚠ image agrandie ×{scale:.2f} (joueur petit dans la vidéo source)")

    best = max(scores)
    frames = [sharpen(place(k, scale, cx, feet_y),
                      SHARPEN_MAX - (SHARPEN_MAX - SHARPEN_MIN) * sc / best)
              for k, sc in zip(keyed, scores)]

    dest = OUT / args.id
    shutil.rmtree(dest, ignore_errors=True)
    dest.mkdir(parents=True)
    with ThreadPoolExecutor() as pool:
        list(pool.map(lambda i: frames[i].save(dest / f"{i:03d}.avif", "AVIF", quality=QUALITY,
                                               speed=AVIF_SPEED), range(len(frames))))
    face = studio_photo(args.id, args.photos.expanduser())
    if face:
        face = align(face, frames[0])
        a = np.asarray(frames[0].getchannel("A")) > 128
        b = np.asarray(face.getchannel("A")) > 128
        overlap = (a & b).sum() / (a | b).sum()
        if overlap < MIN_OVERLAP and args.forcer_photo:
            print(f"   ⚠ photo de face forcée malgré une pose différente (recouvrement {overlap:.2f})")
        elif overlap < MIN_OVERLAP:
            print(f"   ⚠ photo de face écartée : pose trop différente de la vidéo "
                  f"(recouvrement {overlap:.2f} < {MIN_OVERLAP}), image 000 à la place")
            face = frames[0]
    else:
        print("   ⚠ pas de photo studio de face : image 000 de la vidéo à la place")
        face = frames[0]
    face.save(dest / "face.avif", "AVIF", quality=QUALITY, speed=AVIF_SPEED)
    poster = face.resize((round(CANVAS[0] * POSTER_HEIGHT / CANVAS[1]), POSTER_HEIGHT),
                              Image.LANCZOS)
    poster.save(dest / "poster.avif", "AVIF", quality=POSTER_QUALITY, speed=AVIF_SPEED)
    # Tête et haut du buste, jusqu'aux biceps : cartes de la page 1. Cadre identique pour
    # tous les joueurs (58 % × 28 % de l'image, calé sur le haut et le centre de la tête),
    # pour que tous les visages aient la même taille sur les cartes.
    a = np.asarray(face.getchannel("A")) > 128
    top = int(np.nonzero(a.any(axis=1))[0].min())
    bh, bw = round(face.height * 0.28), round(face.width * 0.58)
    cx = int(np.nonzero(a[top:top + round(bh * 0.3)].any(axis=0))[0].mean())
    y0 = max(0, top - round(bh * 0.03))
    bust = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    bust.paste(face.crop((cx - bw // 2, y0, cx - bw // 2 + bw, y0 + bh)), (0, 0))
    bust.save(dest / "bust.avif", "AVIF", quality=60, speed=AVIF_SPEED)
    # Vue de dos (image du milieu du tour), même taille que le poster : page 1.
    dos = frames[FRAME_COUNT // 2].resize(poster.size, Image.LANCZOS)
    dos.save(dest / "dos.avif", "AVIF", quality=POSTER_QUALITY, speed=AVIF_SPEED)

    seq = sum(f.stat().st_size for f in dest.glob("0*.avif"))
    print(f"   séquence {seq / 1024:.0f} ko, poster "
          f"{(dest / 'poster.avif').stat().st_size / 1024:.0f} ko → {dest.relative_to(ROOT)}")
    if args.controle:
        print(f"   contrôle : {control_sheet(args.id, frames).relative_to(ROOT)}")


if __name__ == "__main__":
    main()
