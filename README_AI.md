# دليل استخدام AI Models

## استخدام موديل محلي بدون API (Ollama)

### 1. تثبيت Ollama

**Windows:**
- حمّل من: https://ollama.ai/download
- أو استخدم: `winget install Ollama.Ollama`

**Mac:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### 2. تشغيل Ollama

```bash
ollama serve
```

### 3. تحميل موديل

```bash
# موديلات موصى بها:
ollama pull llama2          # موديل عام (7B)
ollama pull mistral         # موديل أفضل (7B)
ollama pull llama2:13b      # موديل أكبر (13B) - يحتاج RAM أكثر
ollama pull codellama       # للكود
```

### 4. إعداد Environment Variables (اختياري)

أنشئ ملف `.env` في جذر المشروع:

```env
# Ollama Configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# أو استخدم OpenAI (إذا كان متوفر)
OPENAI_API_KEY=sk-your-key-here
```

### 5. الأولوية في الاستخدام

الكود سيستخدم بالترتيب:
1. **Ollama** (إذا كان يعمل) - مجاني ومحلي
2. **OpenAI** (إذا كان API key موجود) - يحتاج دفع
3. **Simple Summary** (fallback) - بدون AI

## ملاحظات

- Ollama يعمل محلياً، لا يحتاج إنترنت بعد تحميل الموديل
- الموديلات تحتاج RAM (7B يحتاج ~8GB RAM)
- يمكن استخدام موديلات أصغر إذا كان RAM محدود
- الموديلات تدعم العربية بشكل جيد

## استكشاف الأخطاء

إذا لم يعمل Ollama:
1. تأكد أن `ollama serve` يعمل
2. تحقق من `http://localhost:11434/api/tags`
3. تأكد من تحميل موديل: `ollama list`
4. راجع logs في console

