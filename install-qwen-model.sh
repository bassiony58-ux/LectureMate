#!/bin/bash
# Script to install and configure the best Qwen model based on available GPU

set -e

echo "=================================================="
echo "Qwen Model Installation Script"
echo "=================================================="
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama is not installed!"
    echo ""
    echo "Please install Ollama first:"
    echo "  - Linux: curl -fsSL https://ollama.ai/install.sh | sh"
    echo "  - Mac: brew install ollama"
    echo "  - Windows: Download from https://ollama.ai/download"
    echo ""
    exit 1
fi

echo "✓ Ollama is installed"
echo ""

# Check GPU availability
echo "Checking GPU availability..."
if command -v nvidia-smi &> /dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | head -1)
    GPU_NAME=$(echo "$GPU_INFO" | cut -d',' -f1 | xargs)
    GPU_MEMORY=$(echo "$GPU_INFO" | cut -d',' -f2 | xargs | sed 's/ MiB//')
    GPU_MEMORY_GB=$((GPU_MEMORY / 1024))
    
    echo "✓ GPU Detected: $GPU_NAME"
    echo "✓ GPU Memory: ${GPU_MEMORY_GB}GB"
    echo ""
    
    # Recommend model based on GPU memory
    if [ "$GPU_MEMORY_GB" -ge 40 ]; then
        RECOMMENDED_MODEL="qwen2.5:32b"
        echo "🎯 Recommended Model: qwen2.5:32b (Best quality)"
        echo "   Your GPU has enough memory for the largest model!"
    elif [ "$GPU_MEMORY_GB" -ge 20 ]; then
        RECOMMENDED_MODEL="qwen2.5:14b"
        echo "🎯 Recommended Model: qwen2.5:14b (Great quality)"
        echo "   Alternative: qwen2.5:32b (if you have system RAM for offloading)"
    elif [ "$GPU_MEMORY_GB" -ge 10 ]; then
        RECOMMENDED_MODEL="qwen2.5:7b"
        echo "🎯 Recommended Model: qwen2.5:7b (Good quality)"
        echo "   This is the minimum recommended for quality results"
    else
        RECOMMENDED_MODEL="qwen2.5:3b"
        echo "⚠️  Recommended Model: qwen2.5:3b (Basic quality)"
        echo "   Warning: Your GPU memory is limited. Consider using API mode instead."
    fi
else
    echo "❌ No NVIDIA GPU detected!"
    echo ""
    echo "You can still use Ollama with CPU, but it will be slower."
    RECOMMENDED_MODEL="qwen2.5:3b"
    echo "🎯 Recommended Model: qwen2.5:3b (CPU mode)"
fi

echo ""
echo "=================================================="
echo "Choose a model to install:"
echo "=================================================="
echo ""
echo "1) qwen2.5:32b  - Best quality (20GB+ VRAM) - Recommended for A100/A6000"
echo "2) qwen2.5:14b  - Great quality (10GB+ VRAM) - Recommended for RTX 3090/4090"
echo "3) qwen2.5:7b   - Good quality (5GB+ VRAM) - Minimum recommended"
echo "4) qwen2.5:3b   - Basic quality (2GB+ VRAM) - Fast but lower quality"
echo "5) qwen2.5-coder:32b - Best for technical content (20GB+ VRAM)"
echo ""
echo "Enter your choice (1-5), or press Enter for recommended ($RECOMMENDED_MODEL):"
read -r CHOICE

case "$CHOICE" in
    1)
        MODEL="qwen2.5:32b"
        ;;
    2)
        MODEL="qwen2.5:14b"
        ;;
    3)
        MODEL="qwen2.5:7b"
        ;;
    4)
        MODEL="qwen2.5:3b"
        ;;
    5)
        MODEL="qwen2.5-coder:32b"
        ;;
    "")
        MODEL="$RECOMMENDED_MODEL"
        ;;
    *)
        echo "Invalid choice. Using recommended model: $RECOMMENDED_MODEL"
        MODEL="$RECOMMENDED_MODEL"
        ;;
esac

echo ""
echo "=================================================="
echo "Installing $MODEL..."
echo "=================================================="
echo ""
echo "This may take several minutes depending on your internet speed."
echo "Model size: ~2GB (3b) to ~20GB (32b)"
echo ""

# Pull the model
ollama pull "$MODEL"

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo "✓ Model installed successfully!"
    echo "=================================================="
    echo ""
    echo "Model: $MODEL"
    echo ""
    echo "Next steps:"
    echo "1. Update your .env file with:"
    echo "   OLLAMA_MODEL=$MODEL"
    echo ""
    echo "2. Start Ollama server (if not running):"
    echo "   ollama serve"
    echo ""
    echo "3. Test the model:"
    echo "   ollama run $MODEL \"مرحبا، كيف حالك؟\""
    echo ""
    echo "4. Start your application:"
    echo "   npm run dev"
    echo ""
else
    echo ""
    echo "❌ Failed to install model!"
    echo ""
    echo "Please check:"
    echo "1. Internet connection"
    echo "2. Available disk space"
    echo "3. Ollama service is running"
    echo ""
    exit 1
fi

