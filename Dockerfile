# Multi-stage Dockerfile for RunPod deployment
# Base image with CUDA support for GPU acceleration
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04 as base

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV NODE_VERSION=20.x
ENV HF_HOME=/root/.cache/huggingface

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    python3.10 \
    python3-pip \
    python3.10-venv \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION} | bash - \
    && apt-get install -y nodejs

# Create app directory
WORKDIR /app

# Python dependencies stage
FROM base as python-deps

# Create virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Install PyTorch with CUDA support
RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install faster-whisper (if not in requirements.txt)
RUN pip install --no-cache-dir faster-whisper

# Pre-download Whisper models during build (optional - comment out if you want to download on first run)
# This will increase build time but make first run faster
RUN python3 -c "from faster_whisper import WhisperModel; print('Pre-downloading base model...'); WhisperModel('base', device='cpu', compute_type='int8'); print('Base model ready')" || true

# Node.js dependencies stage
FROM base as node-deps

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Build stage
FROM base as builder

# Copy Python virtual environment
COPY --from=python-deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy Node.js dependencies
COPY --from=node-deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM base as production

# Copy Python virtual environment
COPY --from=python-deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy any pre-downloaded models from python-deps stage
COPY --from=python-deps /root/.cache/huggingface /root/.cache/huggingface

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/client/public ./client/public

# Make Python scripts executable
RUN chmod +x server/scripts/*.py

# Create directories for uploads and temp files
RUN mkdir -p /tmp/lecture-assistant-uploads /root/.cache/huggingface
RUN chmod 777 /tmp/lecture-assistant-uploads
RUN chmod 755 /root/.cache/huggingface

# Expose port
EXPOSE 5000

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV CUDA_VISIBLE_DEVICES=0
ENV PYTHON_CMD=python3
ENV HF_HOME=/root/.cache/huggingface

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Start script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

# Run the application
CMD ["/startup.sh"]
