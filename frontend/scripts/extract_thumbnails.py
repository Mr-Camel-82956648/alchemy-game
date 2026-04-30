"""
One-time script: extract mid-frame thumbnail from each processed video,
save as small WebP, and output a JSON seed file for the frontend.
"""
import cv2
import json
import os
import base64
from pathlib import Path

VIDEOS_DIR = "processed_videos"
THUMB_DIR = "assets/thumbnails"
THUMB_SIZE = (180, 180)
OUTPUT_JSON = "assets/seed_cards.json"

ELEMENT_CYCLE = ["fire", "ice", "thunder", "poison"]
NAME_MAP = {
    "effect_01": "炎爆法阵",
    "effect_02": "寒冰法阵",
    "effect_03": "雷霆法阵",
}

os.makedirs(THUMB_DIR, exist_ok=True)

video_list = json.load(open("video_list.json", encoding="utf-8"))
cards = []

for i, filename in enumerate(video_list):
    video_path = os.path.join(VIDEOS_DIR, filename)
    if not os.path.exists(video_path):
        print(f"SKIP (not found): {video_path}")
        continue

    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    mid_frame = total_frames // 2
    cap.set(cv2.CAP_PROP_POS_FRAMES, mid_frame)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        print(f"SKIP (no frame): {video_path}")
        continue

    h, w = frame.shape[:2]
    scale = min(THUMB_SIZE[0] / w, THUMB_SIZE[1] / h)
    new_w, new_h = int(w * scale), int(h * scale)
    thumb = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

    thumb_filename = f"thumb_{i:02d}.webp"
    thumb_path = os.path.join(THUMB_DIR, thumb_filename)
    cv2.imwrite(thumb_path, thumb, [cv2.IMWRITE_WEBP_QUALITY, 80])

    stem = Path(filename).stem
    name = NAME_MAP.get(stem, f"法阵·{i+1:02d}")
    element = ELEMENT_CYCLE[i % len(ELEMENT_CYCLE)]

    cards.append({
        "name": name,
        "type": "spell",
        "videoUrl": f"processed_videos/{filename}",
        "thumbnailUrl": f"assets/thumbnails/{thumb_filename}",
        "element": element,
    })
    print(f"OK: {filename} -> {thumb_filename} ({new_w}x{new_h})")

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(cards, f, ensure_ascii=False, indent=2)

print(f"\nDone! {len(cards)} cards written to {OUTPUT_JSON}")
