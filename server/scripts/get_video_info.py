#!/usr/bin/env python3
"""
YouTube Video Info Extractor
Extracts title, duration, and channel name from YouTube video
"""
import sys
import json
import re
import urllib.request
from html import unescape

def get_video_info(video_id):
    """Extract video info from YouTube page"""
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Fetch the video page
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
        
        # Extract title from <title> tag
        title_match = re.search(r'<title>(.*?)</title>', html)
        title = title_match.group(1) if title_match else f"YouTube Video {video_id}"
        # Remove " - YouTube" suffix
        title = title.replace(" - YouTube", "").strip()
        title = unescape(title)
        
        # Extract duration from videoDetails (in player response)
        duration_seconds = None
        duration_match = re.search(r'"lengthSeconds":"(\d+)"', html)
        if duration_match:
            duration_seconds = int(duration_match.group(1))
        else:
            # Try alternative pattern
            duration_match = re.search(r'"approxDurationMs":"(\d+)"', html)
            if duration_match:
                duration_seconds = int(duration_match.group(1)) // 1000
        
        # Format duration as MM:SS or HH:MM:SS
        duration = "0:00"
        if duration_seconds:
            hours = duration_seconds // 3600
            minutes = (duration_seconds % 3600) // 60
            seconds = duration_seconds % 60
            
            if hours > 0:
                duration = f"{hours}:{minutes:02d}:{seconds:02d}"
            else:
                duration = f"{minutes}:{seconds:02d}"
        
        # Extract channel name
        channel_name = None
        channel_match = re.search(r'"ownerChannelName":"([^"]+)"', html)
        if channel_match:
            channel_name = unescape(channel_match.group(1))
        else:
            # Try alternative pattern
            channel_match = re.search(r'<link itemprop="name" content="([^"]+)"', html)
            if channel_match:
                channel_name = unescape(channel_match.group(1))
        
        return {
            "success": True,
            "videoId": video_id,
            "title": title,
            "duration": duration,
            "durationSeconds": duration_seconds,
            "channelName": channel_name,
            "thumbnailUrl": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Error extracting video info: {str(e)}"
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Video ID is required"
        }))
        sys.exit(1)
    
    video_id = sys.argv[1]
    result = get_video_info(video_id)
    print(json.dumps(result))

