# تثبيت Git على Windows

## الطريقة 1: تثبيت Git مباشرة

1. **حمّل Git من الموقع الرسمي:**
   - اذهب إلى: https://git-scm.com/download/win
   - حمّل النسخة المناسبة (64-bit أو 32-bit)

2. **شغّل المثبت:**
   - اضغط Next في جميع الخطوات
   - **مهم**: في صفحة "Adjusting your PATH environment"، اختر:
     - ✅ **"Git from the command line and also from 3rd-party software"**
   - اضغط Next حتى النهاية

3. **أعد تشغيل PowerShell:**
   - أغلق PowerShell الحالي
   - افتح PowerShell جديد
   - اكتب: `git --version` للتأكد من التثبيت

## الطريقة 2: استخدام GitHub Desktop (أسهل)

1. **حمّل GitHub Desktop:**
   - اذهب إلى: https://desktop.github.com/
   - حمّل وثبت GitHub Desktop

2. **بعد التثبيت:**
   - افتح GitHub Desktop
   - سجل دخول بحساب GitHub
   - اضغط File > Add Local Repository
   - اختر مجلد المشروع: `C:\Users\tank\Downloads\DesignWebShow`
   - اضغط Publish repository

## الطريقة 3: استخدام Chocolatey (إذا كان مثبتاً)

```powershell
# تشغيل PowerShell كـ Administrator
choco install git -y
```

## بعد التثبيت

بعد تثبيت Git، شغّل الأوامر التالية:

```powershell
cd C:\Users\tank\Downloads\DesignWebShow
git init
git add .
git commit -m "Initial commit: Lecture Assistant web app"
git remote add origin https://github.com/MohamedAdelDU/lecture-assistantv2.git
git branch -M main
git push -u origin main
```

