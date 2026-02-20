#!/bin/bash
set -e

echo "🔧 GPU Setup for Whisper + cuDNN"
echo "=================================="
echo ""

# Must be run from project directory
cd "$(dirname "$0")"

# Activate venv
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "❌ Virtual environment not found. Run setup first."
    exit 1
fi

# 1. Fix NumPy version FIRST (critical!)
echo "📊 Step 1: Fixing NumPy version (CRITICAL!)..."
echo "   Current NumPy version:"
pip show numpy 2>/dev/null | grep Version || echo "   NumPy not installed"
echo "   Downgrading to NumPy <2.0..."
pip uninstall numpy -y -q 2>/dev/null || true
pip install "numpy<2.0" --no-cache-dir -q
echo "   ✓ NumPy fixed"

# 2. Install system cuDNN
echo ""
echo "📦 Step 2: Installing cuDNN system libraries..."
apt-get update -qq
apt-get install -y libcudnn8 libcudnn8-dev 2>&1 | grep -v "already" || true

# 3. Find and create cuDNN symlinks
echo ""
echo "🔗 Step 3: Creating cuDNN symlinks..."
CUDNN_LIB_DIR="/usr/lib/x86_64-linux-gnu"
if [ -d "$CUDNN_LIB_DIR" ]; then
    cd "$CUDNN_LIB_DIR"
    # Find cuDNN libraries
    CUDNN_SO=$(find . -name "libcudnn.so.*" -type f | head -1)
    if [ -n "$CUDNN_SO" ]; then
        # Create symlink if doesn't exist
        if [ ! -f "libcudnn.so" ]; then
            ln -sf "$(basename $CUDNN_SO)" libcudnn.so 2>/dev/null || true
            echo "   ✓ Created libcudnn.so symlink"
        fi
    fi
    
    # Find cuDNN ops libraries
    CUDNN_OPS_SO=$(find . -name "libcudnn_ops.so.*" -type f | head -1)
    if [ -n "$CUDNN_OPS_SO" ]; then
        if [ ! -f "libcudnn_ops.so" ]; then
            ln -sf "$(basename $CUDNN_OPS_SO)" libcudnn_ops.so 2>/dev/null || true
            echo "   ✓ Created libcudnn_ops.so symlink"
        fi
    fi
    cd - > /dev/null
fi

# 4. Set library paths
echo ""
echo "⚙️ Step 4: Setting library paths..."
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64:$LD_LIBRARY_PATH
export CUDA_HOME=/usr/local/cuda-11.8

# Add to bashrc if not already there
if ! grep -q "LD_LIBRARY_PATH.*x86_64-linux-gnu" ~/.bashrc; then
    echo 'export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
    echo 'export CUDA_HOME=/usr/local/cuda-11.8' >> ~/.bashrc
fi

# 5. Reinstall PyTorch with CUDA 11.8
echo ""
echo "🔥 Step 5: Reinstalling PyTorch CUDA 11.8..."
pip uninstall torch torchvision torchaudio -y -q
pip install torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu118 --no-cache-dir -q

# 6. Reinstall ctranslate2 (dependency of faster-whisper)
echo ""
echo "🔄 Step 6: Reinstalling ctranslate2..."
pip uninstall ctranslate2 -y -q 2>/dev/null || true
pip install ctranslate2 --no-cache-dir -q

# 7. Reinstall faster-whisper
echo ""
echo "🎤 Step 7: Reinstalling faster-whisper..."
pip uninstall faster-whisper -y -q
pip install faster-whisper --no-cache-dir -q

# 8. Verify installation
echo ""
echo "✅ Step 8: Verifying installation..."
python3 << 'EOF'
import os
import sys

# Set library path
os.environ['LD_LIBRARY_PATH'] = '/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64'

print("Testing components...")
print("")

# Test NumPy
try:
    import numpy
    print(f"✓ NumPy: {numpy.__version__}")
except Exception as e:
    print(f"✗ NumPy: {e}")
    sys.exit(1)

# Test PyTorch
try:
    import torch
    print(f"✓ PyTorch: {torch.__version__}")
    print(f"✓ CUDA Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"✓ GPU: {torch.cuda.get_device_name(0)}")
        print(f"✓ cuDNN Enabled: {torch.backends.cudnn.enabled}")
        if torch.backends.cudnn.enabled:
            print(f"✓ cuDNN Version: {torch.backends.cudnn.version()}")
except Exception as e:
    print(f"✗ PyTorch: {e}")
    sys.exit(1)

# Test faster-whisper on GPU
print("")
print("Testing Whisper on GPU...")
try:
    from faster_whisper import WhisperModel
    model = WhisperModel("base", device="cuda", compute_type="float16")
    print("✅ SUCCESS! Whisper works on GPU with cuDNN!")
    del model
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================="
    echo "✅ GPU Setup Complete!"
    echo "=================================="
    echo ""
    echo "🚀 GPU is ready for Whisper transcription!"
    echo ""
    echo "To start the server:"
    echo "  ./start.sh"
    echo ""
else
    echo ""
    echo "❌ GPU setup failed. Check errors above."
    exit 1
fi

