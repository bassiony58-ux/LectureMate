# إعداد المشروع على RunPod

هذا الدليل يوضح كيفية إعداد المشروع على RunPod للاستفادة من GPU القوي.

## المتطلبات الأساسية

1. **حساب RunPod** مع GPU متاح
2. **Pod** مع:
   - GPU: RTX 3090 أو أفضل (موصى به: A100, A6000)
   - RAM: 16GB+ (موصى به: 32GB+)
   - Storage: 50GB+ (لتحميل الموديلات)

## الطريقة الأولى: استخدام Docker (موصى به) 🐳

### 1. إنشاء Pod على RunPod

1. اذهب إلى [RunPod](https://www.runpod.io/)
2. اختر **GPU Pod**
3. اختر Template: **Docker** أو **PyTorch**
4. اختر GPU مناسب (A100 موصى به للموديلات الكبيرة)
5. اختر Storage: 50GB+

### 2. رفع المشروع إلى RunPod

#### الطريقة أ: رفع من GitHub

1. ارفع المشروع إلى GitHub (إذا لم يكن موجوداً)
2. في RunPod Pod، افتح Terminal
3. استنسخ المشروع:
```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

#### الطريقة ب: رفع الملفات مباشرة

1. في RunPod Pod، افتح Terminal
2. استخدم `scp` أو File Manager لرفع الملفات:
```bash
# من جهازك المحلي
scp -r /path/to/project root@your-pod-ip:/workspace/
```

### 3. بناء Docker Image

```bash
cd /workspace/your-repo

# بناء الصورة
docker build -t lecture-assistant:latest .

# أو استخدام docker-compose
docker-compose build
```

### 4. إعداد Environment Variables

أنشئ ملف `.env` في جذر المشروع:

```env
# GPU Configuration
CUDA_VISIBLE_DEVICES=0
PYTHON_CMD=python3

# API Keys
GEMINI_API_KEY=your_gemini_api_key_here
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# Firebase (إذا كنت تستخدمه)
GOOGLE_APPLICATION_CREDENTIALS=/app/firebase-service-account.json

# Server
NODE_ENV=production
PORT=5000
```

### 5. تشغيل Container

```bash
# طريقة 1: استخدام docker run
docker run -d \
  --name lecture-assistant \
  --gpus all \
  -p 5000:5000 \
  --env-file .env \
  -v $(pwd)/firebase-service-account.json:/app/firebase-service-account.json:ro \
  lecture-assistant:latest

# طريقة 2: استخدام docker-compose (أسهل)
docker-compose up -d
```

### 6. التحقق من التشغيل

```bash
# التحقق من الـ logs
docker logs lecture-assistant

# التحقق من Health endpoint
curl http://localhost:5000/api/health

# التحقق من GPU
docker exec lecture-assistant nvidia-smi
```

### 7. الوصول إلى التطبيق

- **من داخل RunPod**: `http://localhost:5000`
- **من خارج RunPod**: استخدم RunPod's Public URL أو Tunnel

## الطريقة الثانية: التثبيت اليدوي (بدون Docker)

### 1. إنشاء Pod على RunPod

1. اذهب إلى [RunPod](https://www.runpod.io/)
2. اختر **GPU Pod**
3. اختر Template: **PyTorch** أو **CUDA**
4. اختر GPU مناسب (A100 موصى به للموديلات الكبيرة)
5. اختر Storage: 50GB+

### 2. تثبيت المتطلبات

```bash
# تحديث النظام
sudo apt-get update
sudo apt-get upgrade -y

# تثبيت Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# تثبيت Python dependencies
pip install --upgrade pip
pip install faster-whisper torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# تثبيت متطلبات المشروع
pip install -r requirements.txt

# تثبيت Node.js dependencies
npm install
```

### 3. التحقق من GPU

```bash
# التحقق من توفر CUDA
python3 -c "import torch; print(f'CUDA Available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"

# التحقق من faster-whisper
python3 -c "from faster_whisper import WhisperModel; print('faster-whisper installed successfully')"
```

### 4. إعداد المتغيرات البيئية

أنشئ ملف `.env`:

```env
# GPU Configuration
CUDA_VISIBLE_DEVICES=0

# Python Path (if needed)
PYTHON_CMD=python3

# Other settings
GEMINI_API_KEY=your_key_here
OLLAMA_URL=http://localhost:11434
# Qwen Model - Choose the best for your GPU:
# qwen2.5:32b (Best quality - 20GB+ VRAM - Recommended for A100/A6000)
# qwen2.5:14b (Great quality - 10GB+ VRAM - Recommended for RTX 3090/4090)
# qwen2.5:7b (Good quality - 5GB+ VRAM - Minimum recommended)
OLLAMA_MODEL=qwen2.5:32b
```

### 5. بناء التطبيق

```bash
npm run build
```

### 6. تشغيل التطبيق

```bash
# Production mode
npm start

# أو Development mode
npm run dev
```

### 7. اختبار التحويل الصوتي

```bash
# اختبار بسيط
python3 server/scripts/transcribe_audio.py /path/to/audio.mp3 large-v3 None cuda
```

## الإعدادات الموصى بها

### للموديلات الكبيرة (large-v3):

- **GPU**: A100 40GB أو أفضل
- **RAM**: 32GB+
- **Compute Type**: float16 (افتراضي)
- **Beam Size**: 5

### للموديلات المتوسطة (medium):

- **GPU**: RTX 3090 أو أفضل
- **RAM**: 16GB+
- **Compute Type**: float16
- **Beam Size**: 5

## تحسينات الأداء

### 1. استخدام float16 للـ GPU

المشروع يستخدم تلقائياً `float16` للـ GPU للحصول على أفضل أداء.

### 2. تحميل الموديل مسبقاً

عند أول استخدام، سيتم تحميل الموديل تلقائياً. يمكنك تحميله مسبقاً:

```python
from faster_whisper import WhisperModel
model = WhisperModel("large-v3", device="cuda", compute_type="float16")
```

### 3. استخدام Batch Processing

للملفات المتعددة، يمكنك معالجتها بشكل متوازي.

## استكشاف الأخطاء

### المشكلة: CUDA not available

**الحل:**
```bash
# التحقق من CUDA
nvidia-smi

# في Docker
docker exec lecture-assistant nvidia-smi

# إعادة تثبيت PyTorch مع CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### المشكلة: Out of Memory

**الحل:**
- استخدم موديل أصغر (medium بدلاً من large-v3)
- استخدم `int8_float16` بدلاً من `float16`
- قلل `beam_size` إلى 3

### المشكلة: Model download failed

**الحل:**
```bash
# تحميل الموديل يدوياً
python3 -c "from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cuda')"
```

### المشكلة: Docker build failed

**الحل:**
```bash
# تنظيف Docker cache
docker system prune -a

# إعادة البناء بدون cache
docker build --no-cache -t lecture-assistant:latest .
```

### المشكلة: Port already in use

**الحل:**
```bash
# تغيير PORT في .env
PORT=8080

# أو إيقاف العملية التي تستخدم المنفذ
lsof -ti:5000 | xargs kill -9
```

## ملاحظات مهمة

1. **الموديل الافتراضي**: `large-v3` (الأفضل دقة)
2. **الجهاز الافتراضي**: GPU (cuda)
3. **Compute Type**: float16 للـ GPU (أفضل أداء)
4. **التحميل التلقائي**: الموديلات تُحمّل تلقائياً عند أول استخدام
5. **Docker**: موصى به للسهولة والاستقرار
6. **Storage**: تأكد من وجود مساحة كافية للموديلات (~3-5GB لكل موديل)

## الأداء المتوقع

### على A100 40GB:

- **large-v3**: ~2-5x أسرع من الوقت الفعلي للصوت
- **medium**: ~5-10x أسرع من الوقت الفعلي للصوت
- **base**: ~10-20x أسرع من الوقت الفعلي للصوت

### على RTX 3090:

- **large-v3**: ~1-3x أسرع من الوقت الفعلي للصوت
- **medium**: ~3-5x أسرع من الوقت الفعلي للصوت
- **base**: ~5-10x أسرع من الوقت الفعلي للصوت

## ملفات Docker المتوفرة

- `Dockerfile`: ملف بناء Docker الرئيسي
- `docker-compose.yml`: ملف تكوين Docker Compose
- `.dockerignore`: ملفات مستبعدة من Docker build
- `startup.sh`: سكريبت بدء التشغيل

## الدعم

إذا واجهت أي مشاكل، راجع:
- [faster-whisper Documentation](https://github.com/guillaumekln/faster-whisper)
- [RunPod Documentation](https://docs.runpod.io/)
- [Docker Documentation](https://docs.docker.com/)
