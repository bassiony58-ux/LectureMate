# إعداد Firebase Storage لحفظ الملفات الصوتية

هذا الدليل يوضح كيفية إعداد Firebase Storage لحفظ الملفات الصوتية المحمّلة من YouTube.

## الخطوة 1: الحصول على Service Account Key من Firebase Console

1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. اختر مشروعك: **lecture-assistant-ab472**
3. اضغط على أيقونة الإعدادات ⚙️ → **Project settings**
4. اذهب إلى تبويب **Service accounts**
5. اضغط على **Generate new private key**
6. سيتم تحميل ملف JSON - احفظه بأمان

## الخطوة 2: حفظ Service Account Key في المشروع

### الطريقة الأولى: حفظ الملف مباشرة (موصى به للتطوير المحلي)

1. انسخ الملف المحمّل إلى جذر المشروع
2. أعد تسميته إلى: `firebase-service-account.json`
3. تأكد من إضافته إلى `.gitignore` (لا ترفعه إلى GitHub!)

```bash
# في جذر المشروع
cp ~/Downloads/your-service-account-key.json firebase-service-account.json
```

### الطريقة الثانية: استخدام متغير البيئة (موصى به للإنتاج)

1. احفظ الملف في مكان آمن (مثلاً: `~/.config/firebase/service-account.json`)
2. أضف المسار إلى ملف `.env`:

```env
# في ملف .env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-service-account.json

# أو
FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/firebase-service-account.json
```

## الخطوة 3: إضافة إلى .env

افتح ملف `.env` في جذر المشروع وأضف:

```env
# Firebase Storage Configuration
GOOGLE_APPLICATION_CREDENTIALS=/Users/tank/Downloads/lecture-assistantv2-main/firebase-service-account.json

# أو استخدم FIREBASE_SERVICE_ACCOUNT_KEY
FIREBASE_SERVICE_ACCOUNT_KEY=/Users/tank/Downloads/lecture-assistantv2-main/firebase-service-account.json
```

**ملاحظة:** استبدل المسار بمسار الملف الفعلي على جهازك.

## الخطوة 4: تحديث .gitignore

تأكد من إضافة الملفات الحساسة إلى `.gitignore`:

```gitignore
# Firebase
firebase-service-account.json
*.json
!package.json
!package-lock.json
!tsconfig.json
```

## الخطوة 5: نشر قواعد Firebase Storage

```bash
# نشر قواعد Storage
firebase deploy --only storage:rules
```

## التحقق من الإعداد

بعد الإعداد، عند تحميل فيديو من YouTube:
1. سيتم رفع الملف الصوتي تلقائياً إلى Firebase Storage
2. في المرة القادمة، سيتم تحميله من Firebase بدلاً من YouTube (أسرع!)

## هيكل الملفات في Firebase Storage

```
audio/
  └── {userId}/
      └── {videoId}.mp3
```

## استكشاف الأخطاء

### المشكلة: "Firebase Storage is not initialized"

**الحل:**
- تأكد من وجود Service Account Key
- تحقق من المسار في `.env`
- تأكد من أن الملف يحتوي على JSON صحيح

### المشكلة: "Permission denied"

**الحل:**
- تأكد من نشر قواعد Storage: `firebase deploy --only storage:rules`
- تحقق من أن Service Account لديه صلاحيات Storage Admin

### المشكلة: الملفات لا تُحفظ

**الحل:**
- تحقق من logs السيرفر
- تأكد من أن `userId` يتم إرساله في الطلب
- تأكد من أن Firebase Storage مُفعّل في Firebase Console

## على RunPod

على RunPod، يمكنك:

1. رفع Service Account Key إلى Pod
2. إضافة المسار إلى `.env`:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   ```

أو استخدام Application Default Credentials إذا كان Pod يعمل على GCP.

