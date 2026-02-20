#!/usr/bin/env python3
"""
Audio Transcription using Faster Whisper
Converts audio/video files to text transcript
"""
import sys
import json
import os
import re

# Check NumPy version FIRST (critical for PyTorch compatibility)
try:
    import numpy
    numpy_version = numpy.__version__
    major_version = int(numpy_version.split('.')[0])
    if major_version >= 2:
        print(f"[Whisper] ❌ ERROR: NumPy {numpy_version} is incompatible with PyTorch 2.1.0", file=sys.stderr)
        print(f"[Whisper] Please run: pip install 'numpy<2.0' --force-reinstall", file=sys.stderr)
        print(f"[Whisper] Or run: sudo ./setup-gpu.sh", file=sys.stderr)
        sys.exit(1)
except ImportError:
    pass  # NumPy will be installed with other dependencies

# Set library paths for cuDNN before importing torch
# Force set LD_LIBRARY_PATH (don't use setdefault - override if needed)
cudnn_paths = '/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64'
if 'LD_LIBRARY_PATH' in os.environ:
    os.environ['LD_LIBRARY_PATH'] = cudnn_paths + ':' + os.environ['LD_LIBRARY_PATH']
else:
    os.environ['LD_LIBRARY_PATH'] = cudnn_paths

# Create ALL cuDNN symlinks if they don't exist (CRITICAL!)
cudnn_lib_dir = '/usr/lib/x86_64-linux-gnu'
if os.path.isdir(cudnn_lib_dir):
    try:
        import subprocess
        
        # Function to create symlink if source exists
        def create_symlink(source, target):
            source_path = os.path.join(cudnn_lib_dir, source)
            target_path = os.path.join(cudnn_lib_dir, target)
            if os.path.exists(source_path) and not os.path.exists(target_path):
                subprocess.run(['ln', '-sf', source, target], cwd=cudnn_lib_dir, check=False)
                return True
            return False
        
        # 1. libcudnn.so
        if not os.path.exists(os.path.join(cudnn_lib_dir, 'libcudnn.so')):
            for version in ['8', '9']:
                if create_symlink(f'libcudnn.so.{version}', 'libcudnn.so'):
                    break
        
        # 2. libcudnn_ops.so (critical!)
        if not os.path.exists(os.path.join(cudnn_lib_dir, 'libcudnn_ops.so')):
            for pattern in ['libcudnn_ops_infer.so.8', 'libcudnn_ops.so.8', 'libcudnn_ops.so.9']:
                if create_symlink(pattern, 'libcudnn_ops.so'):
                    break
        
        # 3. libcudnn_cnn.so (NEW - required for convolution operations!)
        if not os.path.exists(os.path.join(cudnn_lib_dir, 'libcudnn_cnn.so')):
            for pattern in ['libcudnn_cnn_infer.so.8', 'libcudnn_cnn.so.8', 'libcudnn_cnn.so.9']:
                if create_symlink(pattern, 'libcudnn_cnn.so'):
                    break
        
        # 4. libcudnn_adv.so (may be needed)
        if not os.path.exists(os.path.join(cudnn_lib_dir, 'libcudnn_adv.so')):
            for pattern in ['libcudnn_adv_infer.so.8', 'libcudnn_adv.so.8', 'libcudnn_adv.so.9']:
                if create_symlink(pattern, 'libcudnn_adv.so'):
                    break
        
        # 5. libcudnn_cnn_train.so (may be needed)
        if not os.path.exists(os.path.join(cudnn_lib_dir, 'libcudnn_cnn_train.so')):
            for pattern in ['libcudnn_cnn_train.so.8', 'libcudnn_cnn_train.so.9']:
                if create_symlink(pattern, 'libcudnn_cnn_train.so'):
                    break
        
        # 6. libcudnn_ops_train.so (may be needed)
        if not os.path.exists(os.path.join(cudnn_lib_dir, 'libcudnn_ops_train.so')):
            for pattern in ['libcudnn_ops_train.so.8', 'libcudnn_ops_train.so.9']:
                if create_symlink(pattern, 'libcudnn_ops_train.so'):
                    break
                    
    except Exception as e:
        # Log error but continue
        print(f"[Whisper] Warning: Could not create all cuDNN symlinks: {e}", file=sys.stderr)

from faster_whisper import WhisperModel

# Try to import torch for GPU detection (optional, won't fail if not available)
try:
    import torch
except ImportError:
    torch = None

def transcribe_audio(file_path, model_size="base", language=None, device="cpu"):
    """Transcribe audio file using Faster Whisper
    
    Args:
        file_path: Path to audio/video file
        model_size: Whisper model size (tiny, base, small, medium, large-v2, large-v3)
        language: Language code (e.g., 'ar', 'en') or None for auto-detection
        device: 'cpu' or 'cuda' for GPU acceleration
    
    Returns:
        Dictionary with transcription results
    """
    try:
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File not found: {file_path}"
            }
        
        # Initialize Whisper model
        # Use appropriate compute type based on device
        # For GPU: use float16 for best performance on RunPod/GPU servers
        # For CPU: use int8 for better performance
        
        # Check if CUDA is actually available (optional - torch may not be installed)
        # faster-whisper will handle CUDA detection internally, but we can check with torch if available
        torch_module = None
        cuda_available = False
        
        try:
            import torch as torch_module
            if hasattr(torch_module, 'cuda') and torch_module.cuda:
                cuda_available = torch_module.cuda.is_available()
                if cuda_available:
                    print(f"[Whisper] CUDA available: {torch_module.cuda.get_device_name(0)}", file=sys.stderr)
        except ImportError:
            # torch not installed - faster-whisper will detect CUDA itself
            print(f"[Whisper] torch not installed, faster-whisper will detect CUDA automatically", file=sys.stderr)
            # If device is cuda/gpu, let faster-whisper try to use it
            cuda_available = (device == "cuda" or device == "gpu")
        
        # Try GPU if requested (faster-whisper will error if GPU not available)
        if (device == "cuda" or device == "gpu"):
            # Log GPU info if torch is available
            if torch_module and torch_module.cuda.is_available():
                print(f"[Whisper] GPU Device: {torch_module.cuda.get_device_name(0)}", file=sys.stderr)
                print(f"[Whisper] GPU Memory: {torch_module.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB", file=sys.stderr)
                if torch_module.backends.cudnn.enabled:
                    print(f"[Whisper] cuDNN Enabled: version {torch_module.backends.cudnn.version()}", file=sys.stderr)
                else:
                    print(f"[Whisper] WARNING: cuDNN not enabled - may cause errors!", file=sys.stderr)
            
            # Try float16 first for GPU (best performance on RunPod)
            try:
                print(f"[Whisper] Loading model: {model_size} on GPU with float16", file=sys.stderr)
                model = WhisperModel(model_size, device="cuda", compute_type="float16")
                print(f"[Whisper] Model loaded successfully on GPU with float16", file=sys.stderr)
            except Exception as e:
                error_msg = str(e).lower()
                if "cudnn" in error_msg or "libcudnn" in error_msg:
                    print(f"[Whisper] ❌ cuDNN Error: {e}", file=sys.stderr)
                    print(f"[Whisper] Please run: sudo ./setup-gpu.sh", file=sys.stderr)
                    raise RuntimeError(f"cuDNN libraries not found or incompatible. Run setup-gpu.sh to fix. Error: {e}")
                print(f"[Whisper] float16 not available, trying int8_float16: {e}", file=sys.stderr)
                try:
                    # Fallback to int8_float16 (still uses GPU)
                    model = WhisperModel(model_size, device="cuda", compute_type="int8_float16")
                    print(f"[Whisper] Model loaded successfully on GPU with int8_float16", file=sys.stderr)
                except Exception as e2:
                    error_msg2 = str(e2).lower()
                    if "cudnn" in error_msg2 or "libcudnn" in error_msg2:
                        print(f"[Whisper] ❌ cuDNN Error: {e2}", file=sys.stderr)
                        print(f"[Whisper] Please run: sudo ./setup-gpu.sh", file=sys.stderr)
                        raise RuntimeError(f"cuDNN libraries not found or incompatible. Run setup-gpu.sh to fix. Error: {e2}")
                    print(f"[Whisper] ❌ GPU initialization failed: {e2}", file=sys.stderr)
                    raise RuntimeError(f"GPU initialization failed. Check CUDA installation. Error: {e2}")
        else:
            # CPU mode
            print(f"[Whisper] Loading model: {model_size} on CPU", file=sys.stderr)
            model = WhisperModel(model_size, device="cpu", compute_type="int8")
        
        # Transcribe audio with ANTI-HALLUCINATION settings for Arabic
        is_gpu = (device == "cuda" or device == "gpu")
        is_large_model = "large" in model_size.lower() or "medium" in model_size.lower()
        is_arabic = (language == "ar")
        
        # Optimize beam_size - LOWER for Arabic to prevent hallucination
        # Too high beam_size can cause repetition in Whisper
        if is_gpu and is_large_model and is_arabic:
            beam_size = 5  # REDUCED for Arabic to prevent hallucination (was 12)
            print(f"[Whisper] Using ANTI-HALLUCINATION settings for GPU + large model + ARABIC (beam_size={beam_size})", file=sys.stderr)
        elif is_gpu and is_large_model:
            beam_size = 5  # Standard for large models
            print(f"[Whisper] Using quality settings for GPU + large model (beam_size={beam_size})", file=sys.stderr)
        elif is_gpu:
            beam_size = 5  # Standard for GPU
            print(f"[Whisper] Using quality settings for GPU (beam_size={beam_size})", file=sys.stderr)
        else:
            beam_size = 5  # Standard for CPU
            print(f"[Whisper] Using balanced settings for CPU (beam_size={beam_size})", file=sys.stderr)
        
        print(f"[Whisper] Transcribing audio file: {file_path}", file=sys.stderr)
        print(f"[Whisper] Language: {language or 'auto-detect'}", file=sys.stderr)
        
        # Modified prompt to support code-switching (Arabic + English terms)
        # This tells Whisper it's okay to mix languages
        initial_prompt = "هذا النص باللغة العربية، ولكن المصطلحات التقنية والأسماء قد تكون باللغة الإنجليزية (English)."
        
        if language == "ar":
            print(f"[Whisper] Arabic detected - using code-switching friendly prompt", file=sys.stderr)
        else:
            initial_prompt = "The transcript may contain mixed languages."
        
        # ANTI-HALLUCINATION transcription parameters
        # Special settings for Arabic to prevent repetition
        segments, info = model.transcribe(
            file_path,
            language=language,  # Use specified language
            beam_size=beam_size,  # Kept moderate to prevent hallucination
            best_of=5,  # Standard value (high values can cause repetition)
            patience=1.0,  # Reduced to prevent over-thinking (was 2.0)
            length_penalty=1.0,  # Neutral
            repetition_penalty=1.5,  # MUCH HIGHER to prevent repetition (was 1.01)
            temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),  # Temperature fallback to reduce hallucination
            
            # VAD (Voice Activity Detection) - stricter to prevent false detections
            vad_filter=True,
            vad_parameters=dict(
                threshold=0.5,  # Higher = less sensitive, fewer false positives (was 0.3)
                min_speech_duration_ms=250,  # Longer minimum (was 100)
                max_speech_duration_s=30.0,  # Limit segment length to prevent hallucination
                min_silence_duration_ms=1500,  # Longer pause before split (was 1000)
                speech_pad_ms=400,  # More padding (was 200)
            ),
            
            # Quality thresholds - STRICTER to filter hallucinations
            compression_ratio_threshold=2.2,  # LOWER to reject repetitive text (was 2.8)
            log_prob_threshold=-1.0,  # Standard (was -0.8)
            no_speech_threshold=0.6,  # Standard (was 0.5)
            
            # Anti-hallucination settings
            condition_on_previous_text=False,  # DISABLED - can cause repetition in Arabic
            initial_prompt=initial_prompt,
            prefix=None,
            suppress_blank=True,
            suppress_tokens=[-1],
            without_timestamps=False,
            max_initial_timestamp=1.0,
            word_timestamps=False,
            prepend_punctuations="\"'([{-",
            append_punctuations="\"'.,:;!?)]}",
            clip_timestamps="0",
            hallucination_silence_threshold=2.0,  # ENABLED - detect and skip hallucinations (was None)
        )
        
        # Extract detected language
        detected_language = info.language if hasattr(info, 'language') else language or 'unknown'
        detected_probability = info.language_probability if hasattr(info, 'language_probability') else 0.0
        print(f"[Whisper] Detected language: {detected_language} (confidence: {detected_probability:.2f})", file=sys.stderr)
        
        # Collect all segments with ANTI-HALLUCINATION processing
        full_text = ""
        segments_list = []
        segment_count = 0
        last_segment_text = ""
        repetition_count = 0
        
        for segment in segments:
            segment_text = segment.text.strip()
            
            # Skip empty or very short segments
            if not segment_text or len(segment_text) < 2:
                continue
            
            # Skip segments that are likely noise or errors
            if len(set(segment_text)) < 3:  # Too few unique characters
                continue
            
            # CRITICAL: Detect and skip repetitions (hallucination detection)
            # Check if this segment is very similar to the last one
            if last_segment_text:
                # Calculate similarity (simple word-based)
                last_words = set(last_segment_text.lower().split())
                current_words = set(segment_text.lower().split())
                if last_words and current_words:
                    similarity = len(last_words & current_words) / len(last_words | current_words)
                    if similarity > 0.7:  # 70% similar = likely repetition
                        repetition_count += 1
                        print(f"[Whisper] Skipping repetitive segment: {segment_text[:50]}...", file=sys.stderr)
                        continue
            
            # Check for exact repetition in recent text
            if segment_text in full_text[-len(segment_text)*3:]:  # Check last portion
                repetition_count += 1
                print(f"[Whisper] Skipping exact repetition: {segment_text[:50]}...", file=sys.stderr)
                continue
            
            # Add space before segment if not starting with punctuation
            if full_text and not segment_text[0] in '.،,!?؛':
                full_text += " "
            
            full_text += segment_text
            segments_list.append({
                "text": segment_text,
                "start": segment.start,
                "end": segment.end
            })
            segment_count += 1
            last_segment_text = segment_text
        
        # Clean up text - remove extra spaces and normalize
        full_text = re.sub(r'\s+', ' ', full_text).strip()  # Normalize spaces
        full_text = re.sub(r'\s+([.,!?;:،؛])', r'\1', full_text)  # Fix punctuation spacing
        full_text = re.sub(r'([.,!?;:،؛])([^\s])', r'\1 \2', full_text)  # Add space after punctuation
        
        # Remove phrase-level repetitions (e.g., "البرمجة الاصطناعية، البرمجة الاصطناعية")
        words = full_text.split()
        cleaned_words = []
        i = 0
        while i < len(words):
            # Check for phrase repetition (2-5 words)
            found_repetition = False
            for phrase_len in range(5, 1, -1):  # Check longer phrases first
                if i + phrase_len * 2 <= len(words):
                    phrase1 = ' '.join(words[i:i+phrase_len])
                    phrase2 = ' '.join(words[i+phrase_len:i+phrase_len*2])
                    if phrase1 == phrase2:
                        # Found repetition, skip the repeated part
                        cleaned_words.extend(words[i:i+phrase_len])
                        i += phrase_len * 2  # Skip both occurrences (keep only one)
                        found_repetition = True
                        break
            
            if not found_repetition:
                cleaned_words.append(words[i])
                i += 1
        
        full_text = ' '.join(cleaned_words)
        
        print(f"[Whisper] Transcription complete: {segment_count} segments processed, {len(full_text)} characters, {len(full_text.split())} words", file=sys.stderr)
        if repetition_count > 0:
            print(f"[Whisper] Removed {repetition_count} repetitive/hallucinated segments", file=sys.stderr)
        print(f"[Whisper] Quality: Language confidence {detected_probability:.2%}", file=sys.stderr)
        
        return {
            "success": True,
            "transcript": full_text,
            "wordCount": len(full_text.split()),
            "characterCount": len(full_text),
            "language": detected_language,
            "segments": segments_list
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[Whisper] Error: {str(e)}", file=sys.stderr)
        print(f"[Whisper] Traceback: {error_trace}", file=sys.stderr)
        return {
            "success": False,
            "error": f"Transcription failed: {str(e)}",
            "details": error_trace
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "File path is required"
        }))
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    # Optional parameters
    model_size = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else "base"
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    device = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else "cpu"
    
    # If language is "None" string, convert to None
    if language == "None" or language == "":
        language = None
    
    result = transcribe_audio(file_path, model_size, language, device)
    print(json.dumps(result))

