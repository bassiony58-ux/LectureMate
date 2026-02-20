#!/bin/bash
set -e

echo "========================================="
echo "Starting Lecture Assistant on RunPod"
echo "========================================="

# Check GPU availability
if command -v nvidia-smi &> /dev/null; then
    echo "GPU Information:"
    nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader
    echo ""
fi

# Check CUDA availability
if [ -n "$CUDA_VISIBLE_DEVICES" ]; then
    echo "CUDA_VISIBLE_DEVICES: $CUDA_VISIBLE_DEVICES"
fi

# Verify Python environment
echo "Python version: $(python3 --version)"
echo "Python path: $(which python3)"
echo ""

# Verify Node.js
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo ""

# Check environment variables
echo "Environment variables:"
echo "  NODE_ENV: ${NODE_ENV:-not set}"
echo "  PORT: ${PORT:-5000}"
echo "  GEMINI_API_KEY: ${GEMINI_API_KEY:+set (hidden)}"
echo "  OLLAMA_URL: ${OLLAMA_URL:-not set}"
echo "  OLLAMA_MODEL: ${OLLAMA_MODEL:-not set}"
echo ""

echo "========================================="
echo "Checking and Loading Dependencies"
echo "========================================="

# Check Python dependencies
echo "1. Checking Python dependencies..."
python3 -c "import faster_whisper; print('  ✓ faster-whisper installed')" 2>/dev/null || {
    echo "  ✗ faster-whisper not found - installing..."
    pip install faster-whisper
}

python3 -c "import torch; print(f'  ✓ PyTorch installed (CUDA: {torch.cuda.is_available()})')" 2>/dev/null || {
    echo "  ✗ PyTorch not found - installing..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
}

python3 -c "import yt_dlp; print('  ✓ yt-dlp installed')" 2>/dev/null || {
    echo "  ✗ yt-dlp not found - installing..."
    pip install yt-dlp
}

python3 -c "from youtube_transcript_api import YouTubeTranscriptApi; print('  ✓ youtube-transcript-api installed')" 2>/dev/null || {
    echo "  ✗ youtube-transcript-api not found - installing..."
    pip install youtube-transcript-api
}

echo ""
echo "2. Pre-loading Whisper models..."

# Pre-download Whisper models to cache
# This ensures models are ready before the server starts
python3 << EOF
import sys
import os
from faster_whisper import WhisperModel

models_to_load = []

# Determine which models to pre-load based on GPU availability
try:
    import torch
    if torch.cuda.is_available():
        print("  GPU detected - pre-loading large-v3 model...")
        models_to_load = [("large-v3", "cuda", "float16")]
    else:
        print("  CPU detected - pre-loading base model...")
        models_to_load = [("base", "cpu", "int8")]
except ImportError:
    print("  Torch not available - pre-loading base model on CPU...")
    models_to_load = [("base", "cpu", "int8")]

for model_name, device, compute_type in models_to_load:
    try:
        print(f"  Loading model: {model_name} on {device} with {compute_type}...")
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
        print(f"  ✓ {model_name} model loaded successfully")
        del model  # Free memory
    except Exception as e:
        print(f"  ⚠ Warning: Could not pre-load {model_name}: {str(e)}")
        print(f"  Model will be loaded on first use instead.")

print("  ✓ Model pre-loading complete")
EOF

echo ""
echo "3. Verifying all systems..."

# Final verification
python3 << EOF
import sys

checks_passed = True

# Check faster-whisper
try:
    from faster_whisper import WhisperModel
    print("  ✓ faster-whisper ready")
except Exception as e:
    print(f"  ✗ faster-whisper error: {e}")
    checks_passed = False

# Check torch and CUDA
try:
    import torch
    cuda_status = "available" if torch.cuda.is_available() else "not available"
    print(f"  ✓ PyTorch ready (CUDA: {cuda_status})")
    if torch.cuda.is_available():
        print(f"    GPU: {torch.cuda.get_device_name(0)}")
        print(f"    Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
except Exception as e:
    print(f"  ✗ PyTorch error: {e}")
    checks_passed = False

# Check yt-dlp
try:
    import yt_dlp
    print("  ✓ yt-dlp ready")
except Exception as e:
    print(f"  ✗ yt-dlp error: {e}")
    checks_passed = False

# Check youtube-transcript-api
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    print("  ✓ youtube-transcript-api ready")
except Exception as e:
    print(f"  ✗ youtube-transcript-api error: {e}")
    checks_passed = False

if not checks_passed:
    print("\n  ⚠ Warning: Some dependencies are missing or failed to load")
    print("  The application may not work correctly")
    sys.exit(1)

print("\n  ✓ All dependencies verified successfully")
EOF

echo ""
echo "========================================="
echo "Creating necessary directories..."
echo "========================================="

# Create necessary directories
mkdir -p /tmp/lecture-assistant-uploads
chmod 777 /tmp/lecture-assistant-uploads
echo "  ✓ Upload directory created"

# Create cache directory for models
mkdir -p /root/.cache/huggingface
chmod 755 /root/.cache/huggingface
echo "  ✓ Model cache directory ready"

echo ""
echo "========================================="
echo "All systems ready! Starting application..."
echo "========================================="
echo "Starting on port ${PORT:-5000}..."
echo ""

# Small delay to ensure everything is settled
sleep 2

# Use the built application if in production, otherwise run dev
if [ "$NODE_ENV" = "production" ]; then
    exec node dist/index.mjs
else
    exec npm run dev
fi
