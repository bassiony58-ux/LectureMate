#!/usr/bin/env python3
"""
Pre-load Whisper models script
This script downloads and caches Whisper models before starting the server
"""
import sys
import os

def preload_models():
    """Pre-download Whisper models to cache"""
    try:
        from faster_whisper import WhisperModel
        import torch
    except ImportError as e:
        print(f"Error: Required library not found: {e}")
        print("Please install: pip install faster-whisper torch")
        return False

    # Check if GPU is available
    cuda_available = torch.cuda.is_available()
    
    if cuda_available:
        print("=" * 50)
        print("GPU DETECTED - Pre-loading large-v3 model")
        print("=" * 50)
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print(f"GPU: {gpu_name}")
        print(f"Memory: {gpu_memory:.1f} GB")
        print()
        
        models_to_load = [
            ("large-v3", "cuda", "float16"),
            ("base", "cpu", "int8"),  # Fallback model
        ]
    else:
        print("=" * 50)
        print("CPU MODE - Pre-loading base model")
        print("=" * 50)
        print("Note: GPU not available, using CPU model")
        print()
        
        models_to_load = [
            ("base", "cpu", "int8"),
        ]

    success_count = 0
    total_count = len(models_to_load)

    for model_name, device, compute_type in models_to_load:
        try:
            print(f"Loading {model_name} model on {device} with {compute_type}...")
            print(f"  This may take a few minutes on first run...")
            
            model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute_type,
                download_root=os.path.expanduser("~/.cache/huggingface")
            )
            
            print(f"  ✓ {model_name} model loaded successfully")
            print()
            
            # Clean up to free memory
            del model
            success_count += 1
            
        except Exception as e:
            print(f"  ✗ Failed to load {model_name}: {str(e)}")
            print(f"  Model will be downloaded on first use instead")
            print()

    print("=" * 50)
    print(f"Pre-loading complete: {success_count}/{total_count} models loaded")
    print("=" * 50)
    
    return success_count > 0

if __name__ == "__main__":
    print("\nWhisper Models Pre-loader\n")
    
    success = preload_models()
    
    if success:
        print("\n✓ Models are ready!")
        sys.exit(0)
    else:
        print("\n⚠ Warning: No models were pre-loaded")
        print("Models will be downloaded on first use")
        sys.exit(1)

