import os
import json

def generate_video_list():
    videos_dir = 'videos'
    if not os.path.exists(videos_dir):
        return []
    
    videos = [f for f in os.listdir(videos_dir) if f.endswith('.mp4')]
    return videos

if __name__ == '__main__':
    videos = generate_video_list()
    with open('video_list.json', 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)
    print(f"Generated video_list.json with {len(videos)} videos.")
