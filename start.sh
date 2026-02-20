#!/bin/bash
echo "============================================"
echo "🚀 Lecture Assistant - Qwen2.5:14b"
echo "============================================"

# Set environment for GPU support
export OLLAMA_MODELS=/workspace/.ollama
export HF_HOME=/workspace/.cache/huggingface
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64:$LD_LIBRARY_PATH
export CUDA_HOME=/usr/local/cuda-11.8
export CUDA_VISIBLE_DEVICES=0

# Start Ollama
echo "📦 Starting Ollama..."
pkill ollama 2>/dev/null
nohup ollama serve > /tmp/ollama.log 2>&1 &
sleep 3

# Activate Python virtual environment
cd "$(dirname "$0")"
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "❌ Virtual environment not found!"
    echo "Run: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Check NumPy version first
echo "📊 Checking NumPy version..."
python3 << 'EOF'
import sys
try:
    import numpy
    numpy_version = numpy.__version__
    major_version = int(numpy_version.split('.')[0])
    if major_version >= 2:
        print(f"   ❌ NumPy {numpy_version} is incompatible!")
        print(f"   Run: pip install 'numpy<2.0' --force-reinstall")
        print(f"   Or run: sudo ./setup-gpu.sh")
        sys.exit(1)
    else:
        print(f"   ✓ NumPy: {numpy_version}")
except ImportError:
    print("   ⚠ NumPy not installed")
except Exception as e:
    print(f"   ⚠ NumPy check failed: {e}")
EOF

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ NumPy version issue detected!"
    echo "   Please run: sudo ./setup-gpu.sh"
    exit 1
fi

# Check GPU status
echo ""
echo "🎮 GPU Status:"
python3 << 'EOF'
import os
os.environ['LD_LIBRARY_PATH'] = '/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64'
import torch
try:
    print(f"   ✓ CUDA: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"   ✓ GPU: {torch.cuda.get_device_name(0)}")
        print(f"   ✓ cuDNN: {torch.backends.cudnn.enabled}")
        if not torch.backends.cudnn.enabled:
            print(f"   ⚠ WARNING: cuDNN not enabled - GPU may fail!")
            print(f"   Run: sudo ./setup-gpu.sh")
except Exception as e:
    print(f"   ✗ Error: {e}")
EOF

echo ""
echo "🌐 Starting on port 5000 (dev mode)..."
echo "============================================"
echo ""

# Start the application
npm run dev

