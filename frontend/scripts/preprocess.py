import cv2
import numpy as np
import os
import glob

def create_feather_mask(w, h, inner_fade=80, outer_fade=5):
    mask = np.zeros((h, w), dtype=np.float32)
    
    for y in range(h):
        for x in range(w):
            # distance to inner rectangle
            dx = max(inner_fade - x, 0, x - (w - inner_fade - 1))
            dy = max(inner_fade - y, 0, y - (h - inner_fade - 1))
            dist_to_inner = np.sqrt(dx*dx + dy*dy)
            
            fade_width = inner_fade - outer_fade
            if dist_to_inner == 0:
                mask[y, x] = 1.0
            elif dist_to_inner >= fade_width:
                mask[y, x] = 0.0
            else:
                t = 1.0 - (dist_to_inner / fade_width)
                # smoothstep
                mask[y, x] = t * t * (3 - 2 * t)
                
    return np.stack([mask, mask, mask], axis=2)

def sharpen(img, strength=0.5):
    kernel = np.array([
        [0, -strength, 0],
        [-strength, 1 + 4 * strength, -strength],
        [0, -strength, 0]
    ])
    return cv2.filter2D(img, -1, kernel)

def process_video(input_path, output_path, mask):
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    if frame_count == 0 or fps == 0:
        return
        
    # We want the video to be exactly 1.5 seconds
    target_duration = 1.5
    target_fps = frame_count / target_duration
    
    w, h = 480, 480
    
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, target_fps, (w, h))
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        # Resize
        frame = cv2.resize(frame, (w, h))
        
        # Sharpen
        frame = sharpen(frame, strength=0.5)
        
        # Apply mask (fade to black)
        # Since we use lighten blend mode in browser, black is transparent
        frame = (frame * mask).astype(np.uint8)
        
        out.write(frame)
        
    out.release()
    cap.release()

def main():
    os.makedirs('processed_videos', exist_ok=True)
    print("Generating feather mask...")
    mask = create_feather_mask(480, 480)
    
    videos = glob.glob('videos/*.mp4')
    for i, v in enumerate(videos):
        out_name = os.path.basename(v)
        out_path = os.path.join('processed_videos', out_name)
        print(f"[{i+1}/{len(videos)}] Processing {out_name}...")
        process_video(v, out_path, mask)
        
    print("All videos processed!")

if __name__ == '__main__':
    main()