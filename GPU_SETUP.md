# GPU Setup Guide for Whisper Transcription

This guide explains how to set up GPU acceleration for Whisper transcription on RunPod or other GPU servers.

## Prerequisites

- NVIDIA GPU (tested on RTX 4090)
- CUDA 11.8 installed
- Ubuntu/Debian-based system
- Python 3.10+
- Node.js 20+

---

## Quick Setup

### 1. Clone and Setup Project

```bash
cd /workspace
git clone https://github.com/MohamedAdelF/newlec.git
cd newlec
```

### 2. Create Python Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies

```bash
# Install requirements
pip install -r requirements.txt

# Install PyTorch with CUDA 11.8
pip install torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu118

# Install faster-whisper
pip install faster-whisper
```

### 4. Install Node.js Dependencies

```bash
npm install
```

### 5. Run GPU Setup Script

```bash
chmod +x setup-gpu.sh
sudo ./setup-gpu.sh
```

This script will:
- Install cuDNN system libraries
- Set up library paths
- Fix NumPy version
- Reinstall PyTorch and faster-whisper
- Verify GPU functionality

### 6. Start the Application

```bash
chmod +x start.sh
./start.sh
```

---

## Manual Setup

If the automatic script fails, follow these manual steps:

### Install cuDNN

```bash
apt-get update
apt-get install -y libcudnn8 libcudnn8-dev
```

### Set Environment Variables

```bash
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64:$LD_LIBRARY_PATH
export CUDA_HOME=/usr/local/cuda-11.8

# Add to ~/.bashrc for persistence
echo 'export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
echo 'export CUDA_HOME=/usr/local/cuda-11.8' >> ~/.bashrc
```

### Fix NumPy Version

```bash
pip install "numpy<2.0" --force-reinstall
```

### Reinstall PyTorch

```bash
pip uninstall torch torchvision torchaudio -y
pip install torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu118
```

### Reinstall faster-whisper

```bash
pip uninstall faster-whisper -y
pip install faster-whisper --no-cache-dir
```

---

## Verification

### Test PyTorch + CUDA

```bash
python3 << 'EOF'
import torch
print(f"PyTorch: {torch.__version__}")
print(f"CUDA Available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"cuDNN Enabled: {torch.backends.cudnn.enabled}")
print(f"cuDNN Version: {torch.backends.cudnn.version()}")
EOF
```

Expected output:
```
PyTorch: 2.1.0+cu118
CUDA Available: True
GPU: NVIDIA GeForce RTX 4090
cuDNN Enabled: True
cuDNN Version: 8xxx
```

### Test Whisper on GPU

```bash
python3 << 'EOF'
import os
os.environ['LD_LIBRARY_PATH'] = '/usr/lib/x86_64-linux-gnu:/usr/local/cuda-11.8/lib64:/usr/local/cuda/lib64'

from faster_whisper import WhisperModel
model = WhisperModel("base", device="cuda", compute_type="float16")
print("✅ Whisper GPU works!")
EOF
```

---

## Troubleshooting

### Issue: "Unable to load libcudnn_ops.so"

**Cause:** cuDNN libraries not found

**Solution:**
```bash
# Find cuDNN libraries
find /usr -name "libcudnn*.so*" 2>/dev/null

# If not found, reinstall
apt-get install --reinstall libcudnn8 libcudnn8-dev

# Verify library path
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
```

### Issue: "NumPy version conflict"

**Cause:** NumPy 2.x not compatible with PyTorch 2.1.0

**Solution:**
```bash
pip install "numpy<2.0" --force-reinstall
```

### Issue: "CUDA not available"

**Cause:** PyTorch installed without CUDA support

**Solution:**
```bash
pip uninstall torch -y
pip install torch==2.1.0 --index-url https://download.pytorch.org/whl/cu118
```

---

## Performance

With RTX 4090 + Whisper large-v3:

| Audio Length | GPU Time | CPU Time | Speedup |
|--------------|----------|----------|---------|
| 10 minutes   | ~1-2 min | ~5-8 min | 3-4x    |
| 30 minutes   | ~3-5 min | ~15-25 min | 5x    |
| 60 minutes   | ~6-10 min | ~30-50 min | 5x    |

---

## RunPod Specific Setup

### Pod Configuration

```
GPU: RTX 4090 Featured ($0.50/hr)
Template: RunPod PyTorch 2.1
Container Image: runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04
Container Disk: 50 GB
Volume Disk: 50 GB (recommended for model caching)
HTTP Ports: 5000,8888,11434
```

### Environment Variables

```
OLLAMA_MODELS=/workspace/.ollama
HF_HOME=/workspace/.cache/huggingface
CUDA_VISIBLE_DEVICES=0
```

### First Time Setup

1. Start Pod
2. Connect via Web Terminal
3. Run the setup script:

```bash
cd /workspace
git clone https://github.com/MohamedAdelF/newlec.git
cd newlec
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install torch==2.1.0 --index-url https://download.pytorch.org/whl/cu118
pip install faster-whisper
npm install
sudo ./setup-gpu.sh
./start.sh
```

---

## Notes

- cuDNN 8 is required for GPU acceleration
- Library paths must be set before starting the application
- NumPy must be <2.0 for compatibility
- PyTorch 2.1.0 is the tested version for CUDA 11.8
- Models are cached in `/workspace/.cache` (persists on Volume)

---

## Support

For issues or questions:
- Check logs: `tail -f /tmp/ollama.log`
- Test GPU: `nvidia-smi`
- Verify environment: `echo $LD_LIBRARY_PATH`

