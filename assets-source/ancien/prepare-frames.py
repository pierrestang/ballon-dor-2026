#!/usr/bin/env python3
"""
Étape 1 — Préparation des séquences 360° des joueurs.

Pour chaque vidéo public/assets/players/videos/<id>.mp4 :
  1. extraction sans perte (PNG rgb24, BT.709 -> RGB plein range) ;
  2. 72 images réparties uniformément sur la rotation (une tous les 5°),
     doublon final exclu ;
  3. détourage rembg (isnet-general-use) : masque calculé sur une copie réduite
     à 1024 px de haut, agrandi puis appliqué à l'image pleine résolution,
     contour adouci de ~1,5 px ;
  4. boîte de recadrage commune à toutes les vidéos traitées (+ 4 % de marge) ;
  5. sorties MASTER (PNG) et WEB (WebP q90, alpha q100, jamais agrandies).

Usage :
  .venv/bin/python scripts/prepare-frames.py --benchmark 10    # chronométrage
  .venv/bin/python scripts/prepare-frames.py --only haaland    # un joueur
  .venv/bin/python scripts/prepare-frames.py                   # tous les joueurs

Les images détourées plein cadre sont mises en cache dans assets-source/cache/<id>/ :
relancer le script ne refait que le recadrage et les sorties.
"""

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "public/assets/players/videos"
WEB_OUT = ROOT / "public/assets/players/frames"
MASTER_OUT = ROOT / "assets-source/frames-master"
CACHE = ROOT / "assets-source/cache"
CHECKS = ROOT / "assets-source/checks"
PLAYERS_JSON = ROOT / "src/data/players.json"
PLAYERS_JSON_FALLBACK = ROOT / "players.json"

FRAME_COUNT = 72
WORK_SIZE = (1920, 1080)      # toutes les vidéos sont ramenées à cette résolution
MASK_HEIGHT = 1024            # hauteur de la copie réduite servant au masque
FEATHER_RADIUS = 1.5          # adoucissement du contour (px, pleine résolution)
MARGIN = 0.04
WEB_MAX_WIDTH = 900
ALPHA_BBOX_THRESHOLD = 8      # alpha minimal (0-255) compté comme « joueur »
MODEL = "isnet-general-use"
CHECK_FRAMES = (1, 18, 36, 54)

APPLE_SILICON = sys.platform == "darwin" and platform.machine() == "arm64"


# --------------------------------------------------------------------------- #
# Dépendances
# --------------------------------------------------------------------------- #

def ensure_python_deps():
    missing = []
    for module, package in [("rembg", "rembg[cpu]"), ("PIL", "pillow"),
                            ("numpy", "numpy"), ("imageio_ffmpeg", "imageio-ffmpeg")]:
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    if missing:
        print(f"Installation des dépendances manquantes : {', '.join(missing)}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])


def find_ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


# --------------------------------------------------------------------------- #
# Session rembg (une seule par processus, jamais rechargée)
# --------------------------------------------------------------------------- #

_session = None


def init_session(use_coreml):
    global _session
    from rembg import new_session
    providers = (["CoreMLExecutionProvider", "CPUExecutionProvider"] if use_coreml
                 else ["CPUExecutionProvider"])
    _session = new_session(MODEL, providers=providers)


# --------------------------------------------------------------------------- #
# Vérification des vidéos
# --------------------------------------------------------------------------- #

def probe(ffmpeg, video):
    """Résolution, fps, codec, format de pixel et nombre exact d'images décodées.
    (ffprobe n'est pas fourni par imageio-ffmpeg : ffmpeg donne les mêmes infos.)"""
    info = subprocess.run([ffmpeg, "-hide_banner", "-i", str(video)],
                          capture_output=True, text=True).stderr
    line = next(l for l in info.splitlines() if "Video:" in l)
    w, h = map(int, re.search(r", (\d{3,5})x(\d{3,5})", line).groups())
    fps = float(re.search(r"([\d.]+) fps", line).group(1))
    codec = re.search(r"Video: (\w+)", line).group(1)
    pix = re.search(r"Video: [^,]+, (\w+)", line).group(1)
    count_out = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(video), "-map", "0:v:0", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    frames = int(re.findall(r"frame=\s*(\d+)", count_out)[-1])
    return {"width": w, "height": h, "fps": fps, "codec": codec, "pix": pix, "frames": frames}


def print_probe_table(probes):
    values = lambda k: [p[k] for p in probes.values()]
    ref = {k: max(set(values(k)), key=values(k).count)
           for k in ("width", "height", "fps", "codec", "pix", "frames")}
    print(f"\n{'joueur':<15}{'résolution':<12}{'fps':>6}{'images':>8}  {'codec':<6}{'pixels':<14}écarts")
    print("-" * 78)
    for pid, p in probes.items():
        diffs = [k for k in ref if p[k] != ref[k]]
        flag = ("⚠ " + ", ".join(diffs)) if diffs else ""
        print(f"{pid:<15}{p['width']}x{p['height']:<7}{p['fps']:>6g}{p['frames']:>8}  "
              f"{p['codec']:<6}{p['pix']:<14}{flag}")
    print()


# --------------------------------------------------------------------------- #
# Extraction et sélection des 72 images
# --------------------------------------------------------------------------- #

def extract_frames(ffmpeg, video, dest, info):
    """PNG rgb24 sans perte. Matrice BT.709, range TV -> PC, arrondi précis.
    Une vidéo de résolution différente est réduite (jamais agrandie) à WORK_SIZE
    pour que tous les joueurs soient à la même échelle."""
    flags = "lanczos+accurate_rnd+full_chroma_int+full_chroma_inp"
    size = ""
    if (info["width"], info["height"]) != WORK_SIZE:
        if info["width"] < WORK_SIZE[0]:
            raise SystemExit(f"{video.name} : résolution inférieure à {WORK_SIZE}, arrêt.")
        size = f"w={WORK_SIZE[0]}:h={WORK_SIZE[1]}:"
    vf = (f"scale={size}in_color_matrix=bt709:out_color_matrix=bt709:"
          f"in_range=tv:out_range=pc:flags={flags},format=rgb24")
    subprocess.check_call([ffmpeg, "-v", "error", "-i", str(video), "-map", "0:v:0",
                           "-vf", vf, "-pix_fmt", "rgb24", "-compression_level", "3",
                           str(dest / "%04d.png")])
    return sorted(dest.glob("*.png"))


def pick_frames(files):
    """Retire la dernière image si elle duplique la première, puis prend 72 images
    uniformément réparties sur le tour complet."""
    import numpy as np
    from PIL import Image

    def arr(p):
        return np.asarray(Image.open(p).convert("L").reduce(4), dtype=np.float32)

    dup_diff = float(np.abs(arr(files[0]) - arr(files[-1])).mean())
    step_diff = float(np.abs(arr(files[0]) - arr(files[1])).mean())
    is_dup = dup_diff < step_diff * 0.5
    print(f"   écart dernière/première image : {dup_diff:.2f} "
          f"(entre 2 images successives : {step_diff:.2f}) → "
          f"{'doublon, retirée' if is_dup else 'pas un doublon'}")
    if is_dup:
        files = files[:-1]
    n = len(files)
    print(f"   {n} images sur un tour → {FRAME_COUNT} images (une tous les 5°)")
    return [files[round(i * n / FRAME_COUNT) % n] for i in range(FRAME_COUNT)]


# --------------------------------------------------------------------------- #
# Détourage
# --------------------------------------------------------------------------- #

def cutout(src, dest):
    """Masque isnet sur copie 1024 px de haut → agrandi → contour adouci →
    appliqué à l'image pleine résolution."""
    from PIL import Image, ImageFilter
    from rembg import remove
    img = Image.open(src).convert("RGB")
    small_w = round(img.width * MASK_HEIGHT / img.height)
    small = img.resize((small_w, MASK_HEIGHT), Image.LANCZOS)
    mask = remove(small, session=_session, only_mask=True)
    mask = mask.resize(img.size, Image.BICUBIC)
    mask = mask.filter(ImageFilter.GaussianBlur(FEATHER_RADIUS))
    img.putalpha(mask)
    img.save(dest, compress_level=6)


def cutout_job(args):
    cutout(*args)
    return args[1]


def run_cutouts(jobs, use_coreml, workers):
    """CoreML : un seul processus. Sinon : un processus par cœur, une session chacun."""
    start = time.time()
    total = len(jobs)

    def progress(i):
        elapsed = time.time() - start
        print(f"\r   détourage {i:3d}/{total}  ({elapsed / i:.2f} s/image, "
              f"~{elapsed / i * (total - i):.0f} s restantes)", end="", flush=True)

    if workers == 1:
        if _session is None:
            init_session(use_coreml)
        start = time.time()   # le chargement du modèle n'est pas chronométré
        for i, job in enumerate(jobs, 1):
            cutout(*job)
            progress(i)
    else:
        with ProcessPoolExecutor(workers, initializer=init_session,
                                 initargs=(False,)) as pool:
            for i, _ in enumerate(pool.map(cutout_job, jobs), 1):
                progress(i)
    print()
    return (time.time() - start) / total


def process_player(pid, ffmpeg, info, use_coreml, workers):
    """Extraction + détourage plein cadre, mis en cache."""
    cache = CACHE / pid
    if cache.exists() and len(list(cache.glob("*.png"))) == FRAME_COUNT:
        print(f"→ {pid} : détourage déjà en cache, réutilisé")
        return
    print(f"→ {pid} : extraction")
    shutil.rmtree(cache, ignore_errors=True)
    cache.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as tmp:
        files = pick_frames(extract_frames(ffmpeg, VIDEOS / f"{pid}.mp4", Path(tmp), info))
        jobs = [(f, cache / f"{i:03d}.png") for i, f in enumerate(files, 1)]
        run_cutouts(jobs, use_coreml, workers)


def benchmark(pid, n, ffmpeg, info, use_coreml, workers, total_frames):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "src").mkdir()
        files = pick_frames(extract_frames(ffmpeg, VIDEOS / f"{pid}.mp4", tmp / "src", info))
        jobs = [(f, tmp / f"out{i:03d}.png") for i, f in enumerate(files[:n], 1)]
        per_frame = run_cutouts(jobs, use_coreml, workers)
    print(f"\nTemps moyen : {per_frame:.2f} s/image")
    print(f"Estimation pour {total_frames} images ({total_frames // FRAME_COUNT} joueurs) : "
          f"~{per_frame * total_frames / 60:.0f} min de détourage "
          f"(+ ~15 s d'extraction par vidéo)")


# --------------------------------------------------------------------------- #
# Recadrage commun et sorties
# --------------------------------------------------------------------------- #

def union_bbox(pids):
    import numpy as np
    from PIL import Image
    box = [WORK_SIZE[0], WORK_SIZE[1], 0, 0]
    for pid in pids:
        for f in sorted((CACHE / pid).glob("*.png")):
            a = np.asarray(Image.open(f).getchannel("A"))
            ys, xs = np.nonzero(a > ALPHA_BBOX_THRESHOLD)
            if len(xs):
                box = [min(box[0], xs.min()), min(box[1], ys.min()),
                       max(box[2], xs.max() + 1), max(box[3], ys.max() + 1)]
    x0, y0, x1, y1 = map(int, box)
    touches = [s for s, cond in [("gauche", x0 == 0), ("haut", y0 == 0),
                                 ("droite", x1 == WORK_SIZE[0]), ("bas", y1 == WORK_SIZE[1])] if cond]
    if touches:
        print(f"⚠ le joueur touche le bord de la vidéo ({', '.join(touches)}) : "
              "une partie du corps est peut-être hors champ à la source.")
    mx, my = round((x1 - x0) * MARGIN), round((y1 - y0) * MARGIN)
    # La marge peut dépasser le cadre vidéo : la zone ajoutée reste transparente.
    return (x0 - mx, y0 - my, x1 + mx, y1 + my)


def write_outputs(pid, box):
    from PIL import Image
    master = MASTER_OUT / pid
    web = WEB_OUT / pid
    for d in (master, web):
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True)
    w, h = box[2] - box[0], box[3] - box[1]
    web_size = (w, h) if w <= WEB_MAX_WIDTH else (WEB_MAX_WIDTH, round(h * WEB_MAX_WIDTH / w))
    for f in sorted((CACHE / pid).glob("*.png")):
        im = Image.open(f).crop(box)   # crop hors cadre = pixels transparents
        im.save(master / f.name, optimize=True)
        if web_size != (w, h):
            im = im.resize(web_size, Image.LANCZOS)
        im.save(web / f"{f.stem}.webp", "WEBP", quality=90, alpha_quality=100, method=6)
    return (w, h), web_size


def folder_size(path):
    return sum(f.stat().st_size for f in path.glob("*") if f.is_file())


def fmt_mb(n):
    return f"{n / 1_048_576:.1f} Mo"


# --------------------------------------------------------------------------- #
# Planche de contrôle
# --------------------------------------------------------------------------- #

def control_sheet(pid, nation_color):
    import numpy as np
    from PIL import Image, ImageDraw
    src = MASTER_OUT / pid
    frames = [Image.open(src / f"{n:03d}.png") for n in CHECK_FRAMES]
    fw, fh = frames[0].size
    gap, label_h = 16, 28

    def checker(size, sq=12):
        img = Image.new("RGB", size, "#FFFFFF")
        d = ImageDraw.Draw(img)
        for y in range(0, size[1], sq):
            for x in range(0, size[0], sq):
                if (x // sq + y // sq) % 2:
                    d.rectangle([x, y, x + sq - 1, y + sq - 1], fill="#C8C8C8")
        return img

    def on_bg(im, color):
        base = checker(im.size) if color is None else Image.new("RGB", im.size, color)
        base.paste(im, (0, 0), im)
        return base

    backgrounds = [("damier", None), ("#0A0A0A", "#0A0A0A"), (nation_color, nation_color)]

    # Zooms ×3 (pixels réels, sans lissage) sur la tête et les crampons de l'image 001
    a = np.asarray(frames[0].getchannel("A"))
    ys, xs = np.nonzero(a > ALPHA_BBOX_THRESHOLD)
    top, bottom = int(ys.min()), int(ys.max())
    body_h = bottom - top
    zh = round(body_h * 0.15)
    head_x = xs[ys < top + zh]
    hc = int(head_x.mean())
    head = (hc - zh // 2 - 10, top - 10, hc + zh // 2 + 10, top + zh)
    feet_x = xs[ys > bottom - body_h * 0.08]
    feet = (int(feet_x.min()) - 12, bottom - round(body_h * 0.1), int(feet_x.max()) + 12, bottom + 10)
    zooms = []
    for name, box in (("tête ×3", head), ("crampons ×3", feet)):
        crop = frames[0].crop(box)
        zooms.append((name, crop.resize((crop.width * 3, crop.height * 3), Image.NEAREST)))

    grid_w = len(frames) * (fw + gap) + gap
    zoom_rows_w = [sum(z.width + gap for _ in backgrounds) + gap for _, z in zooms]
    sheet_w = max(grid_w, *zoom_rows_w)
    sheet_h = (gap + 3 * (fh + label_h + gap)
               + sum(z.height + label_h + gap for _, z in zooms))
    sheet = Image.new("RGB", (sheet_w, sheet_h), "#FFFFFF")
    draw = ImageDraw.Draw(sheet)

    y = gap
    for bg_name, color in backgrounds:
        x = gap
        for n, fr in zip(CHECK_FRAMES, frames):
            sheet.paste(on_bg(fr, color), (x, y + label_h))
            draw.text((x, y + 8), f"{n:03d} — {bg_name}", fill="#000000")
            x += fw + gap
        y += fh + label_h + gap

    for name, z in zooms:
        x = gap
        for bg_name, color in backgrounds:
            sheet.paste(on_bg(z, color), (x, y + label_h))
            draw.text((x, y + 8), f"{name} (001) — {bg_name}", fill="#000000")
            x += z.width + gap
        y += z.height + label_h + gap

    CHECKS.mkdir(parents=True, exist_ok=True)
    out = CHECKS / f"{pid}-controle.png"
    sheet.save(out)
    return out


# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="+", metavar="ID",
                        help="ne traiter que ces joueurs (ex. --only haaland)")
    parser.add_argument("--benchmark", type=int, metavar="N",
                        help="chronométrer le détourage de N images (premier joueur de --only, "
                             "haaland par défaut) sans rien écrire dans le projet")
    parser.add_argument("--no-coreml", action="store_true",
                        help="désactiver CoreML sur Apple Silicon (bascule en multi-processus)")
    args = parser.parse_args()

    ensure_python_deps()
    ffmpeg = find_ffmpeg()
    data = json.loads((PLAYERS_JSON if PLAYERS_JSON.exists() else PLAYERS_JSON_FALLBACK).read_text())
    players = {p["id"]: p for p in data["players"]}

    videos = {p.stem: p for p in sorted(VIDEOS.glob("*.mp4"))}
    unknown = set(videos) - set(players)
    missing = set(players) - set(videos)
    if unknown or missing:
        raise SystemExit(f"Vidéos inconnues : {sorted(unknown)} / manquantes : {sorted(missing)}")

    use_coreml = APPLE_SILICON and not args.no_coreml
    workers = 1 if use_coreml else max(1, (os.cpu_count() or 2) - 1)
    print(f"Modèle : {MODEL} — accélération : "
          f"{'CoreML (Apple Silicon)' if use_coreml else f'CPU, {workers} processus'}")

    print("Vérification des vidéos…")
    probes = {pid: probe(ffmpeg, v) for pid, v in videos.items()}
    print_probe_table(probes)

    if args.benchmark:
        pid = (args.only or ["haaland"])[0]
        benchmark(pid, args.benchmark, ffmpeg, probes[pid], use_coreml, workers,
                  FRAME_COUNT * len(videos))
        return

    targets = args.only or list(videos)
    for pid in targets:
        process_player(pid, ffmpeg, probes[pid], use_coreml, workers)

    cached = [pid for pid in videos if len(list((CACHE / pid).glob("*.png"))) == FRAME_COUNT]
    if set(cached) != set(videos):
        print(f"⚠ Boîte de recadrage calculée sur {len(cached)}/{len(videos)} joueurs "
              f"({', '.join(cached)}) : elle sera recalculée quand tous seront traités.")
    box = union_bbox(cached)
    print(f"Boîte de recadrage commune : x {box[0]}→{box[2]}, y {box[1]}→{box[3]}")

    print(f"\n{'joueur':<15}{'master':>10}{'web':>10}   dimensions")
    for pid in cached:
        native, web_size = write_outputs(pid, box)
        print(f"{pid:<15}{fmt_mb(folder_size(MASTER_OUT / pid)):>10}"
              f"{fmt_mb(folder_size(WEB_OUT / pid)):>10}   "
              f"master {native[0]}×{native[1]}, web {web_size[0]}×{web_size[1]}")

    for pid in targets:
        out = control_sheet(pid, players[pid]["colors"]["background"])
        print(f"\nPlanche de contrôle : {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
