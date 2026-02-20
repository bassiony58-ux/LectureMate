# تعليمات رفع المشروع على GitHub

## الخطوة 1: تثبيت Git

1. حمّل Git من: https://git-scm.com/download/win
2. ثبت Git مع الخيارات الافتراضية
3. أعد تشغيل PowerShell أو Terminal

## الخطوة 2: تهيئة المشروع ورفعه

افتح PowerShell في مجلد المشروع وشغّل الأوامر التالية:

```powershell
# الانتقال إلى مجلد المشروع
cd C:\Users\tank\Downloads\DesignWebShow

# تهيئة Git repository
git init

# إضافة جميع الملفات
git add .

# عمل commit أولي
git commit -m "Initial commit: Lecture Assistant web app with AI features"

# إضافة remote repository
git remote add origin https://github.com/MohamedAdelDU/lecture-assistantv2.git

# رفع الكود إلى GitHub
git branch -M main
git push -u origin main
```

## ملاحظات مهمة:

- ✅ تم تحديث `.gitignore` لاستثناء الملفات الحساسة (.env, node_modules, dist)
- ✅ تم إنشاء `README.md` مع وصف المشروع
- ⚠️ **لا ترفع ملف `.env`** - يحتوي على API keys الحساسة

## إذا واجهت مشكلة في المصادقة:

إذا طُلب منك اسم المستخدم وكلمة المرور:

1. استخدم **Personal Access Token** بدلاً من كلمة المرور
2. أنشئ Token من: https://github.com/settings/tokens
3. اختر الصلاحيات: `repo` (Full control of private repositories)

## بعد الرفع:

المشروع سيكون متاحاً على:
**https://github.com/MohamedAdelDU/lecture-assistantv2**

