#!/usr/bin/env python3
"""
YouTube Transcript Extractor
Similar to the working Python code
"""
import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled

def get_video_id(url):
    """Extract video ID from YouTube URL"""
    import re
    match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
    if match:
        return match.group(1)
    return None

def fetch_transcript(video_id, start_time=None, end_time=None):
    """Fetch transcript from YouTube video
    
    Args:
        video_id: YouTube video ID
        start_time: Start time in seconds (optional)
        end_time: End time in seconds (optional)
    """
    try:
        # Instantiate and call the fetch method
        try:
            transcript = YouTubeTranscriptApi().fetch(video_id, languages=['ar', 'en'])
        except Exception:
            # Fallback to default if ar/en not specifically found
            transcript = YouTubeTranscriptApi().fetch(video_id)
        
        # Extract text: loop over the FetchedTranscript object
        full_text = ""
        for snippet in transcript:
            # snippet is a FetchedTranscriptSnippet object with attributes: text, start, duration
            snippet_start = snippet.start
            snippet_duration = snippet.duration
            snippet_end = snippet_start + snippet_duration
            
            # Filter by time range if specified
            if start_time is not None and snippet_end < start_time:
                continue
            if end_time is not None and snippet_start > end_time:
                continue
            
            # Include snippet if it overlaps with the time range
            if start_time is None and end_time is None:
                # No time filter, include all
                full_text += snippet.text + " "
            elif start_time is not None and end_time is not None:
                # Both start and end specified
                if snippet_start <= end_time and snippet_end >= start_time:
                    full_text += snippet.text + " "
            elif start_time is not None:
                # Only start specified
                if snippet_end >= start_time:
                    full_text += snippet.text + " "
            elif end_time is not None:
                # Only end specified
                if snippet_start <= end_time:
                    full_text += snippet.text + " "
        
        # Clean up the text
        full_text = " ".join(full_text.split()).strip()
        
        return {
            "success": True,
            "transcript": full_text,
            "wordCount": len(full_text.split()),
            "language": "auto" # The library doesn't easily expose the language code from get_transcript
        }
    except NoTranscriptFound:
        return {
            "success": False,
            "error": "No transcript available for this video (no manual or automatic captions).",
            "details": "Try another video, or check if the video has CC (captions) enabled on YouTube."
        }
    except TranscriptsDisabled:
        return {
            "success": False,
            "error": "Transcripts are disabled by the video creator."
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Error: {str(e)}"
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Video ID is required"
        }))
        sys.exit(1)
    
    video_id = sys.argv[1]
    
    # Parse start_time - only if provided and not empty
    start_time = None
    if len(sys.argv) > 2 and sys.argv[2] and sys.argv[2].strip():
        try:
            start_time = float(sys.argv[2])
            # If start_time is 0, treat it as valid (start from beginning)
        except ValueError:
            start_time = None
    
    # Parse end_time - only if provided and not empty
    end_time = None
    if len(sys.argv) > 3 and sys.argv[3] and sys.argv[3].strip():
        try:
            end_time = float(sys.argv[3])
            # If end_time is 0, treat it as None (no end limit)
            if end_time == 0:
                end_time = None
        except ValueError:
            end_time = None
    
    result = fetch_transcript(video_id, start_time, end_time)
    print(json.dumps(result))

