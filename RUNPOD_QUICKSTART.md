# دليل سريع للنشر على RunPod

## خطوات سريعة (5 دقائق)

### 1. إنشاء Pod على RunPod

1. اذهب إلى [RunPod](https://www.runpod.io/)
2. اختر **GPU Pod** → **Docker**
3. اختر GPU: **A100** أو **RTX 3090**
4. Storage: **50GB+**

### 2. رفع المشروع

```bash
# في RunPod Terminal
cd /workspace
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

### 3. إعداد Environment Variables

```bash
# أنشئ ملف .env
cat > .env << EOF
GEMINI_API_KEY=your_key_here
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:32b
NODE_ENV=production
PORT=5000
CUDA_VISIBLE_DEVICES=0
EOF
```

### 4. بناء وتشغيل Docker

```bash
# بناء الصورة
docker build -t lecture-assistant:latest .

# تشغيل Container
docker run -d \
  --name lecture-assistant \
  --gpus all \
  -p 5000:5000 \
  --env-file .env \
  --restart unless-stopped \
  lecture-assistant:latest
```

### 5. التحقق

```bash
# عرض الـ logs
docker logs -f lecture-assistant

# التحقق من Health
curl http://localhost:5000/api/health
```

### 6. الوصول للتطبيق

- استخدم RunPod's **Public URL** أو **Tunnel**
- أو من داخل Pod: `http://localhost:5000`

## استكشاف الأخطاء السريع

```bash
# إعادة تشغيل Container
docker restart lecture-assistant

# عرض الـ logs
docker logs lecture-assistant

# التحقق من GPU
docker exec lecture-assistant nvidia-smi

# الدخول إلى Container
docker exec -it lecture-assistant bash
```

## ملاحظات

- الموديلات تُحمّل تلقائياً عند أول استخدام (~3-5GB)
- تأكد من وجود مساحة تخزين كافية
- استخدم `docker-compose up -d` إذا كنت تفضل ذلك

