#!/usr/bin/env python3
"""
Download audio from YouTube video using yt-dlp
Downloads audio and saves it as a temporary file for Whisper processing
"""
import sys
import json
import os
import tempfile
import yt_dlp

# Custom logger class to redirect all yt-dlp output to stderr
class StderrLogger:
    def debug(self, msg):
        print(f"[yt-dlp] {msg}", file=sys.stderr)
    
    def info(self, msg):
        print(f"[yt-dlp] {msg}", file=sys.stderr)
    
    def warning(self, msg):
        print(f"[yt-dlp] WARNING: {msg}", file=sys.stderr)
    
    def error(self, msg):
        print(f"[yt-dlp] ERROR: {msg}", file=sys.stderr)

def download_audio(video_id, start_time=None, end_time=None):
    """Download audio from YouTube video
    
    Args:
        video_id: YouTube video ID
        start_time: Start time in seconds (optional)
        end_time: End time in seconds (optional)
    
    Returns:
        Dictionary with download results
    """
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Create temporary file for audio
        temp_dir = tempfile.gettempdir()
        temp_file = tempfile.NamedTemporaryFile(
            suffix='.mp3',
            delete=False,
            dir=temp_dir
        )
        temp_file.close()
        output_path = temp_file.name
        
        # Configure yt-dlp options
        # Use custom logger to redirect all output to stderr (not stdout)
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_path.replace('.mp3', '.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': False,
            'no_warnings': False,
            'noprogress': True,  # Disable progress bar to avoid stdout pollution
            'logger': StderrLogger(),  # Redirect all logs to stderr
        }
        
        # Add time range if specified
        if start_time is not None or end_time is not None:
            # Build postprocessor args for time range
            postprocessor_args = []
            if start_time is not None:
                postprocessor_args.extend(['-ss', str(start_time)])
            if end_time is not None:
                if start_time is not None:
                    postprocessor_args.extend(['-t', str(end_time - start_time)])
                else:
                    postprocessor_args.extend(['-t', str(end_time)])
            
            ydl_opts['postprocessor_args'] = {
                'ffmpeg': postprocessor_args
            }
        
        print(f"[yt-dlp] Downloading audio from: {url}", file=sys.stderr)
        if start_time is not None or end_time is not None:
            print(f"[yt-dlp] Time range: {start_time or 0}s - {end_time or 'end'}s", file=sys.stderr)
        
        # Download audio
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        # Find the actual output file (yt-dlp might change extension)
        actual_output = output_path.replace('.mp3', '.mp3')
        if not os.path.exists(actual_output):
            # Try to find any file with similar name
            base_name = output_path.replace('.mp3', '')
            for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                candidate = base_name + ext
                if os.path.exists(candidate):
                    actual_output = candidate
                    break
        
        if not os.path.exists(actual_output):
            return {
                "success": False,
                "error": "Downloaded file not found"
            }
        
        # Get file size
        file_size = os.path.getsize(actual_output)
        
        print(f"[yt-dlp] Audio downloaded successfully: {actual_output} ({file_size / 1024 / 1024:.2f} MB)", file=sys.stderr)
        
        return {
            "success": True,
            "filePath": actual_output,
            "fileSize": file_size,
            "videoId": video_id
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[yt-dlp] Error: {str(e)}", file=sys.stderr)
        print(f"[yt-dlp] Traceback: {error_trace}", file=sys.stderr)
        
        # Clean up temp file if it exists
        if 'output_path' in locals() and os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except:
                pass
        
        return {
            "success": False,
            "error": f"Download failed: {str(e)}",
            "details": error_trace
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Video ID is required"
        }))
        sys.exit(1)
    
    video_id = sys.argv[1]
    
    # Parse optional time parameters
    start_time = None
    if len(sys.argv) > 2 and sys.argv[2] and sys.argv[2].strip():
        try:
            start_time = float(sys.argv[2])
        except ValueError:
            start_time = None
    
    end_time = None
    if len(sys.argv) > 3 and sys.argv[3] and sys.argv[3].strip():
        try:
            end_time = float(sys.argv[3])
            if end_time == 0:
                end_time = None
        except ValueError:
            end_time = None
    
    result = download_audio(video_id, start_time, end_time)
    print(json.dumps(result))

