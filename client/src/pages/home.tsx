import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Youtube, Sparkles, Upload, Mic, Star, Cpu, Cloud, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { FeatureShowcase } from "@/components/home/FeatureShowcase";
import { useAuth } from "@/contexts/AuthContext";
import { useLectures } from "@/hooks/useLectures";
import { extractVideoId, getYouTubeThumbnail, getYouTubeVideoInfo, getYouTubeTranscript, transcribeAudioFile, transcribeYouTubeWithWhisper } from "@/lib/youtubeService";
import { generateSummary, generateQuiz, generateSlides, generateFlashcards } from "@/lib/aiService";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { classifyLecture } from "@/lib/categoryClassifier";

export default function Home() {
  const { user } = useAuth();
  const { createLecture, updateLecture, isCreating } = useLectures();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingLectureId, setProcessingLectureId] = useState<string | null>(null);
  const [isProcessingStopped, setIsProcessingStopped] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"gpu" | "api">("api");
  const [enableTimeRange, setEnableTimeRange] = useState(false);
  const [startMinutes, setStartMinutes] = useState("");
  const [startSeconds, setStartSeconds] = useState("");
  const [endMinutes, setEndMinutes] = useState("");
  const [endSeconds, setEndSeconds] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const { language } = useLanguage();

  const t = {
    heroBadge:
      language === "ar"
        ? "جديد: البطاقات التعليمية متاحة الآن"
        : "New: Flashcard Generation Available",
    heroTitleLine1: language === "ar" ? "أتقن أي مادة" : "Master Any Subject",
    heroTitleLine2: language === "ar" ? "في نصف الوقت" : "In Half The Time",
    heroSubtitle:
      language === "ar"
        ? "رفيق الدراسة بالذكاء الاصطناعي: حوّل المحاضرات إلى ملخصات واختبارات وبطاقات تعليمية وشرائح عرض فوراً."
        : "The all-in-one AI study companion. Convert lectures into summaries, quizzes, flashcards, and slides instantly.",
    inputPlaceholder:
      language === "ar"
        ? "ألصق رابط فيديو يوتيوب هنا..."
        : "Paste video URL...",
    analyzeNow: language === "ar" ? "ابدأ التحليل" : "Analyze Now",
    uploadFile: language === "ar" ? "رفع ملف" : "Upload File",
    recordAudio: language === "ar" ? "تسجيل صوت" : "Record Audio",
    selectModel: language === "ar" ? "اختر الموديل" : "Select Model",
    selectTimeRange: language === "ar" ? "اختر جزء محدد من الفيديو" : "Select specific video segment",
    enableTimeRange: language === "ar" ? "تفعيل اختيار الوقت" : "Enable time selection",
    startTime: language === "ar" ? "وقت البداية" : "Start Time",
    endTime: language === "ar" ? "وقت النهاية" : "End Time",
    minutes: language === "ar" ? "دقائق" : "min",
    seconds: language === "ar" ? "ثواني" : "sec",
    modelGpu: language === "ar" ? "LM-Titan (GPU)" : "LM-Titan (GPU)",
    modelApi: language === "ar" ? "LM-Cloud (API)" : "LM-Cloud (API)",
    modelGpuDesc: language === "ar" ? "يعمل على الموديلات المحلية المعتمدة على GPU (Ollama)" : "Runs on local GPU-based models (Ollama)",
    modelApiDesc: language === "ar" ? "يعمل على API السحابي (Gemini)" : "Runs on cloud API (Gemini)",
    modelGpuTooltip: language === "ar"
      ? "يستخدم موديلات محلية تعمل على GPU الخاص بك. أسرع وأكثر خصوصية، لكن يتطلب GPU قوي."
      : "Uses local models running on your GPU. Faster and more private, but requires a powerful GPU.",
    modelApiTooltip: language === "ar"
      ? "يستخدم Google Gemini API السحابي. لا يحتاج GPU، لكن يتطلب اتصال بالإنترنت وAPI key."
      : "Uses Google Gemini cloud API. No GPU needed, but requires internet connection and API key.",
    howItWorksTitle: language === "ar" ? "كيف يعمل؟" : "How It Works",
    howItWorksSubtitle:
      language === "ar"
        ? "ثلاث خطوات بسيطة لتغيير تجربة تعلّمك."
        : "Three simple steps to transform your learning experience.",
    steps:
      language === "ar"
        ? [
          {
            step: "01",
            title: "ألصق الرابط",
            desc: "انسخ أي رابط محاضرة من يوتيوب وألصقه في المحلل.",
          },
          {
            step: "02",
            title: "معالجة بالذكاء الاصطناعي",
            desc: "نستخرج النص وننشئ ملخصاً وأسئلة وشرائح عرض.",
          },
          {
            step: "03",
            title: "ابدأ التعلّم",
            desc: "استعرض الملخص وأجب عن الأسئلة وراجع المادة بسهولة.",
          },
        ]
        : [
          {
            step: "01",
            title: "Paste URL",
            desc: "Copy any YouTube lecture link and paste it into our analyzer.",
          },
          {
            step: "02",
            title: "AI Processing",
            desc: "Our AI extracts transcripts, generates summaries, and creates quizzes.",
          },
          {
            step: "03",
            title: "Start Learning",
            desc: "Review the summary, take the quiz, and master the material.",
          },
        ],
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/webm",
        "audio/ogg",
        "audio/m4a",
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "audio/x-m4a",
        "audio/mp4",
        // Documents
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "application/msword", // .doc
        "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
        "application/vnd.ms-powerpoint" // .ppt
      ];

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const allowedExts = ['pdf', 'docx', 'doc', 'pptx', 'ppt'];

      if (!allowedTypes.includes(file.type) && !allowedExts.includes(fileExt || '')) {
        toast({
          title: "Error",
          description: "Invalid file type. Please upload audio, video, PDF, Word, or PowerPoint.",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (500MB max)
      if (file.size > 500 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "File size too large. Maximum size is 500MB.",
          variant: "destructive",
        });
        return;
      }

      setUploadedFile(file);
      setUrl(""); // Clear YouTube URL if file is uploaded

      toast({
        title: "File selected",
        description: `Ready to process: ${file.name}`,
      });
    }
  };

  const handleUploadClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,video/*,.pdf,.doc,.docx,.ppt,.pptx";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileUpload({ target: { files: [file] } } as any);
      }
    };
    input.click();
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if file is uploaded instead of URL
    if (uploadedFile) {
      await handleFileAnalyze(uploadedFile);
      return;
    }

    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a YouTube URL or upload an audio file",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to analyze lectures.",
        variant: "destructive",
      });
      setLocation("/sign-in");
      return;
    }

    setIsAnalyzing(true);

    try {
      // Extract video ID
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error("Invalid YouTube URL");
      }

      // Get video info
      const videoInfo = await getYouTubeVideoInfo(videoId);
      if (!videoInfo) {
        throw new Error("Could not fetch video information");
      }

      // Create lecture with processing status
      // Category will be classified by AI when transcript is available
      const lectureData = {
        title: videoInfo.title,
        thumbnailUrl: videoInfo.thumbnailUrl,
        duration: videoInfo.duration,
        status: "processing" as const,
        progress: 0,
        modelType: selectedModel,
      };
      const newLecture = await createLecture(lectureData);

      const lectureId = newLecture.id;
      if (!lectureId) {
        throw new Error("Failed to create lecture - no ID returned");
      }

      setProcessingLectureId(lectureId);
      setIsProcessingStopped(false);

      toast({
        title: "Lecture created!",
        description: "Processing your lecture...",
      });

      // Process in background
      processLecture(lectureId, videoId, videoInfo);

      // Redirect to lecture page
      setLocation(`/lecture/${lectureId}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to analyze lecture. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileAnalyze = async (file: File) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to analyze lectures.",
        variant: "destructive",
      });
      setLocation("/sign-in");
      return;
    }

    setIsAnalyzing(true);

    try {
      // Create lecture with processing status
      // Use a custom thumbnail for uploaded files
      const uploadThumbnail = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%238B5CF6;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%237C3AED;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='225' fill='url(%23grad)'/%3E%3Cg transform='translate(200, 112.5)'%3E%3Ccircle cx='0' cy='0' r='40' fill='white' opacity='0.2'/%3E%3Cpath d='M-15,-20 L15,0 L-15,20 Z' fill='white'/%3E%3C/g%3E%3Ctext x='200' y='180' font-family='Arial, sans-serif' font-size='18' fill='white' text-anchor='middle' font-weight='600'%3EAudio File%3C/text%3E%3C/svg%3E";

      // Category will be classified by AI when transcript is available
      const lectureData = {
        title: file.name,
        thumbnailUrl: uploadThumbnail,
        duration: "0:00",
        status: "processing" as const,
        progress: 0,
        modelType: selectedModel,
      };
      const newLecture = await createLecture(lectureData);

      const lectureId = newLecture.id;
      if (!lectureId) {
        throw new Error("Failed to create lecture - no ID returned");
      }

      setProcessingLectureId(lectureId);
      setIsProcessingStopped(false);

      toast({
        title: "File uploaded!",
        description: "Transcribing audio file...",
      });

      // Process in background
      processAudioFile(lectureId, file);

      // Redirect to lecture page
      setLocation(`/lecture/${lectureId}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process audio file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processAudioFile = async (lectureId: string, file: File) => {
    try {
      if (!user?.uid) return;

      // Check if processing was stopped
      if (isProcessingStopped && processingLectureId === lectureId) {
        return;
      }

      // Update progress
      await updateLecture({ lectureId, updates: { progress: 20 } });

      // Check again after update
      if (isProcessingStopped && processingLectureId === lectureId) {
        return;
      }

      // Transcribe audio file
      console.log(`[Home] Transcribing audio file: ${file.name}`);

      // Auto-configure based on selected model
      // For GPU model: use large-v3
      // For API model: use faster model (small) for CPU
      const whisperModel = selectedModel === "gpu" ? "large-v3" : "small";
      const device = selectedModel === "gpu" ? "cuda" : "cpu";

      console.log(`[Home] Using device: ${device}, model: ${whisperModel}`);

      // We need to upload the file to Firebase Storage first to get a URL, 
      // but for processing we need a local file path.
      // Since we already have the File object in the browser, we can just send it directly to the API.

      // However, for large files, it might be better to upload to Firebase first 
      // and then have the server download it.
      // For now, let's stick to sending the file directly to the API as it's simpler.

      const transcript = await transcribeAudioFile(file, whisperModel, undefined, device, lectureId);

      console.log(`[Home] Transcript received:`, {
        length: transcript?.length || 0,
        preview: transcript?.substring(0, 100) || "empty"
      });

      if (!transcript || transcript.length === 0) {
        throw new Error("Could not transcribe audio file or transcript is empty");
      }

      if (isProcessingStopped && processingLectureId === lectureId) {
        return;
      }

      console.log(`[Home] Saving transcript to Firestore for lecture: ${lectureId}`);
      // Classify category using AI with transcript for better accuracy
      const category = await classifyLecture({ title: file.name, transcript }, selectedModel);
      await updateLecture({ lectureId, updates: { progress: 40, transcript, category, modelType: selectedModel } });
      console.log(`[Home] Transcript saved successfully with category: ${category}, modelType: ${selectedModel}`);

      console.log(`[Home] Starting sequential AI generation (Summary -> Quiz -> Slides -> Flashcards)...`);
      await updateLecture({ lectureId, updates: { progress: 45 } });

      // 1. Generate Summary
      console.log(`[Home] Generating summary...`);
      const summary = await generateSummary(transcript, selectedModel);
      console.log(`[Home] Summary generated.`);
      await updateLecture({ lectureId, updates: { progress: 60, summary } });

      if (isProcessingStopped && processingLectureId === lectureId) return;

      // 2. Generate Quiz
      console.log(`[Home] Generating quiz...`);
      const questions = await generateQuiz(transcript, selectedModel);
      console.log(`[Home] Quiz generated.`);
      await updateLecture({ lectureId, updates: { progress: 75, questions } });

      if (isProcessingStopped && processingLectureId === lectureId) return;

      // 3. Generate Slides
      console.log(`[Home] Generating slides...`);
      const slides = await generateSlides(transcript, summary);
      console.log(`[Home] Slides generated.`);
      await updateLecture({ lectureId, updates: { progress: 90, slides } });

      if (isProcessingStopped && processingLectureId === lectureId) return;

      // 4. Generate Flashcards
      console.log(`[Home] Generating flashcards...`);
      const flashcards = await generateFlashcards(transcript, selectedModel);
      console.log(`[Home] Flashcards generated.`);

      await updateLecture({ lectureId, updates: { progress: 100, flashcards, status: "completed", modelType: selectedModel } });

      setProcessingLectureId(null);
      setIsProcessingStopped(false);
      setUploadedFile(null);

      toast({
        title: "Processing complete!",
        description: "Your audio file has been analyzed successfully.",
      });
    } catch (error: any) {
      if (!isProcessingStopped || processingLectureId !== lectureId) {
        console.error("[Home] Error processing audio file:", error);
        await updateLecture({
          lectureId,
          updates: { status: "failed", progress: 0 },
        });
        toast({
          title: "Error",
          description: error.message || "Failed to process audio file",
          variant: "destructive",
        });
      }
      setProcessingLectureId(null);
      setIsProcessingStopped(false);
      setUploadedFile(null);
    }
  };

  const processLecture = async (lectureId: string, videoId: string, videoInfo: any) => {
    try {
      if (!user?.uid) return;

      // Check if processing was stopped
      if (isProcessingStopped && processingLectureId === lectureId) {
        return;
      }

      // Update progress
      await updateLecture({ lectureId, updates: { progress: 20 } });

      // Check again after update
      if (isProcessingStopped && processingLectureId === lectureId) {
        return;
      }

      // Get transcript
      console.log(`[Home] Fetching transcript for video: ${videoId}`);

      // Calculate time range in seconds if enabled
      let startTimeSeconds: number | null = null;
      let endTimeSeconds: number | null = null;

      if (enableTimeRange) {
        // Parse time values - treat empty strings as 0
        const startMin = startMinutes.trim() === "" ? 0 : (parseInt(startMinutes) || 0);
        const startSec = startSeconds.trim() === "" ? 0 : (parseInt(startSeconds) || 0);
        const endMin = endMinutes.trim() === "" ? 0 : (parseInt(endMinutes) || 0);
        const endSec = endSeconds.trim() === "" ? 0 : (parseInt(endSeconds) || 0);

        startTimeSeconds = startMin * 60 + startSec;
        endTimeSeconds = endMin * 60 + endSec;

        // Validate time range - end must be greater than start
        // If both are 0 or end <= start, disable time filtering
        if (endTimeSeconds > startTimeSeconds && endTimeSeconds > 0) {
          console.log(`[Home] Using time range: ${startTimeSeconds}s - ${endTimeSeconds}s`);
        } else {
          // Invalid or empty range, disable it and use full transcript
          console.log(`[Home] Time range invalid or empty (start: ${startTimeSeconds}s, end: ${endTimeSeconds}s), using full transcript`);
          startTimeSeconds = null;
          endTimeSeconds = null;
        }
      }

      // Auto-configure based on selected model
      // For GPU model: use Whisper with GPU (cuda) and large-v3, fallback to CPU automatically if GPU not available
      // For API model: use YouTube transcript API
      let transcript: string | null = null;
      if (selectedModel === "gpu") {
        // LM-Titan: Use Whisper with GPU and large-v3
        const whisperModel = "large-v3"; // Always use best model
        const device = "cuda"; // Try GPU first, will fallback to CPU automatically if not available
        console.log(`[Home] Using Whisper to transcribe YouTube video: ${videoId} with GPU and ${whisperModel}`);
        transcript = await transcribeYouTubeWithWhisper(
          videoId,
          whisperModel,
          undefined, // auto-detect language (will be set to 'ar' if Arabic detected)
          device,
          startTimeSeconds,
          endTimeSeconds,
          user?.uid, // Pass user ID for Firebase Storage
          videoInfo?.title, // Pass video title for language detection
          videoInfo?.channelName, // Pass channel name for language detection
          lectureId // Pass lecture ID for process tracking
        );
      } else {
        // LM-Cloud: Use YouTube transcript API
        console.log(`[Home] Calling getYouTubeTranscript for video: ${videoId}...`);
        transcript = await getYouTubeTranscript(videoId, startTimeSeconds, endTimeSeconds);
        console.log(`[Home] getYouTubeTranscript completed.`);
      }

      console.log(`[Home] Transcript received:`, {
        length: transcript?.length || 0,
        preview: transcript?.substring(0, 100) || "empty",
        method: selectedModel === "gpu" ? "Whisper" : "Transcript API"
      });

      if (!transcript || transcript.length === 0) {
        throw new Error("Could not extract transcript or transcript is empty");
      }

      if (isProcessingStopped && processingLectureId === lectureId) {
        return;
      }

      console.log(`[Home] Saving transcript to Firestore for lecture: ${lectureId}`);
      // Classify category using AI with transcript for better accuracy
      console.log(`[Home] Classifying lecture...`);
      const category = await classifyLecture({ title: videoInfo?.title || "Untitled Lecture", transcript }, selectedModel);
      console.log(`[Home] Classification done: ${category}. Updating lecture in DB...`);
      await updateLecture({ lectureId, updates: { progress: 40, transcript, category, modelType: selectedModel } });
      console.log(`[Home] Transcript and category saved successfully.`);

      console.log(`[Home] Starting parallel AI generation (Summary, Quiz, Flashcards)...`);
      await updateLecture({ lectureId, updates: { progress: 45 } });

      // Start independent tasks in parallel
      const summaryPromise = generateSummary(transcript, selectedModel);
      const quizPromise = generateQuiz(transcript, selectedModel);
      const flashcardsPromise = generateFlashcards(transcript, selectedModel);

      // 1. Wait for Summary (needed for slides)
      const summary = await summaryPromise;
      console.log(`[Home] Summary generated.`);
      await updateLecture({ lectureId, updates: { progress: 60, summary } });

      if (isProcessingStopped && processingLectureId === lectureId) return;

      // 2. Start Slides (depends on summary)
      console.log(`[Home] Generating slides...`);
      const slidesPromise = generateSlides(transcript, summary);

      // 3. Wait for Quiz
      const questions = await quizPromise;
      console.log(`[Home] Quiz generated.`);
      await updateLecture({ lectureId, updates: { progress: 75, questions } });

      if (isProcessingStopped && processingLectureId === lectureId) return;

      // 4. Wait for Slides
      const slides = await slidesPromise;
      console.log(`[Home] Slides generated.`);
      await updateLecture({ lectureId, updates: { progress: 90, slides } });

      if (isProcessingStopped && processingLectureId === lectureId) return;

      // 5. Wait for Flashcards
      const flashcards = await flashcardsPromise;
      console.log(`[Home] Flashcards generated.`);

      await updateLecture({ lectureId, updates: { progress: 100, flashcards, status: "completed", modelType: selectedModel } });

      setProcessingLectureId(null);
      setIsProcessingStopped(false);

      toast({
        title: "Processing complete!",
        description: "Your lecture has been analyzed successfully.",
      });
    } catch (error: any) {
      if (!isProcessingStopped || processingLectureId !== lectureId) {
        await updateLecture({ lectureId, updates: { status: "failed" } });
        toast({
          title: "Processing failed",
          description: error.message || "Failed to process lecture.",
          variant: "destructive",
        });
      }
      setProcessingLectureId(null);
      setIsProcessingStopped(false);
    }
  };

  return (
    <AppLayout>
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className={`max-w-6xl mx-auto space-y-24 py-8 md:py-16 px-4 relative ${language === "ar" ? "rtl" : "ltr"}`}>

        {/* Hero Section */}
        <section className="text-center space-y-10 relative overflow-hidden">
          {/* Animated Background Gradient */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-primary/10 via-purple-500/10 to-blue-600/10 rounded-full blur-[140px] -z-10"
          />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6 relative z-10"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-primary/20 via-primary/15 to-primary/20 text-primary text-sm font-semibold border border-primary/30 shadow-lg shadow-primary/10 backdrop-blur-sm"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Star className="w-4 h-4 fill-primary" />
              </motion.div>
              <span>{t.heroBadge}</span>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]"
            >
              <span className="block">{t.heroTitleLine1}</span>
              <motion.span
                initial={{ opacity: 0, x: language === "ar" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-500 to-blue-600 animate-gradient"
              >
                {t.heroTitleLine2}
              </motion.span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            >
              {t.heroSubtitle}
            </motion.p>
          </motion.div>

          {/* Input Area */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="max-w-3xl mx-auto mt-12"
          >
            <Card className="border-2 shadow-2xl shadow-primary/20 overflow-hidden bg-card/50 backdrop-blur-sm hover:shadow-primary/30 transition-all duration-300">
              <CardContent className="p-4 md:p-6">
                <form onSubmit={handleAnalyze} className="flex flex-col gap-4">
                  <div className={`flex gap-3 ${language === "ar" ? "flex-row-reverse" : ""}`}>
                    <div className="relative flex-1 group">
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className={`absolute ${language === "ar" ? "right-4" : "left-4"} top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold border border-red-200 dark:border-red-800 shadow-sm group-hover:scale-105 transition-transform pointer-events-none`}
                      >
                        <Youtube className="w-3.5 h-3.5" />
                        <span>YouTube</span>
                      </motion.div>
                      <Input
                        placeholder={uploadedFile ? uploadedFile.name : t.inputPlaceholder}
                        className={`${language === "ar" ? "pr-28 sm:pr-32 text-right" : "pl-28 sm:pl-32"} h-16 text-base md:text-lg border-2 border-border/50 bg-background/80 backdrop-blur-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-all relative z-0`}
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          if (e.target.value) {
                            setUploadedFile(null); // Clear uploaded file if URL is entered
                          }
                        }}
                        dir={language === "ar" ? "rtl" : "ltr"}
                        disabled={!!uploadedFile}
                      />
                      {uploadedFile && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`absolute ${language === "ar" ? "right-4" : "left-4"} top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 text-green-600 dark:text-green-400 rounded-lg text-xs font-bold border border-green-200 dark:border-green-800 shadow-sm`}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span className="max-w-[150px] truncate">{uploadedFile.name}</span>
                        </motion.div>
                      )}
                    </div>
                    <motion.div
                      whileHover={{
                        scale: 1.02,
                        y: -2,
                      }}
                      whileTap={{
                        scale: 0.98,
                        y: 0,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 17,
                      }}
                      className="relative"
                    >
                      <motion.div
                        className="absolute inset-0 rounded-md bg-gradient-to-r from-primary via-purple-500 to-primary opacity-0 blur-xl"
                        animate={{
                          opacity: isAnalyzing || isCreating ? [0.5, 0.8, 0.5] : 0,
                          scale: [1, 1.2, 1],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <Button
                        size="lg"
                        type="submit"
                        className="relative h-16 px-8 md:px-10 text-base font-semibold shadow-xl shadow-primary/30 hover:shadow-primary/50 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 transition-all duration-300 overflow-hidden group"
                        disabled={isAnalyzing || isCreating}
                      >
                        {/* Shimmer effect */}
                        <motion.div
                          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                          animate={{
                            translateX: isAnalyzing || isCreating ? ["100%", "200%"] : "100%",
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />

                        {isAnalyzing || isCreating ? (
                          <motion.div
                            className="flex items-center gap-2 relative z-10"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <motion.div
                              animate={{
                                rotate: 360,
                                scale: [1, 1.1, 1],
                              }}
                              transition={{
                                rotate: {
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: "linear",
                                },
                                scale: {
                                  duration: 1.5,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                },
                              }}
                            >
                              <Sparkles className="w-5 h-5" />
                            </motion.div>
                            <motion.span
                              className={language === "ar" ? "mr-2" : "ml-2"}
                              animate={{
                                opacity: [0.7, 1, 0.7],
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            >
                              {language === "ar" ? "جاري التحليل..." : "Analyzing..."}
                            </motion.span>
                          </motion.div>
                        ) : (
                          <motion.div
                            className="flex items-center gap-2 relative z-10"
                            initial={false}
                            whileHover={{
                              x: language === "ar" ? -4 : 4,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 17,
                            }}
                          >
                            <span>{t.analyzeNow}</span>
                            <motion.div
                              animate={{
                                x: [0, language === "ar" ? -3 : 3, 0],
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            >
                              <ArrowRight className={`w-5 h-5 ${language === "ar" ? "mr-2 rotate-180" : "ml-2"}`} />
                            </motion.div>
                          </motion.div>
                        )}
                      </Button>
                    </motion.div>
                  </div>

                  {/* Model Selection & Time Range */}
                  <div className="space-y-3">
                    {/* Model Selection */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.9 }}
                      className={`flex items-center gap-3 px-2 ${language === "ar" ? "flex-row-reverse" : ""}`}
                    >
                      <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">{t.selectModel}:</span>
                      <div className={`flex gap-2 flex-1 ${language === "ar" ? "flex-row-reverse" : ""}`}>
                        <motion.button
                          type="button"
                          onClick={() => setSelectedModel("gpu")}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${selectedModel === "gpu"
                            ? "bg-gradient-to-r from-primary to-purple-600 text-primary-foreground shadow-lg shadow-primary/30"
                            : "bg-secondary/80 text-secondary-foreground hover:bg-secondary border border-border/50"
                            }`}
                        >
                          <Cpu className="w-4 h-4" />
                          <span>{t.modelGpu}</span>
                        </motion.button>
                        <motion.button
                          type="button"
                          onClick={() => setSelectedModel("api")}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${selectedModel === "api"
                            ? "bg-gradient-to-r from-primary to-purple-600 text-primary-foreground shadow-lg shadow-primary/30"
                            : "bg-secondary/80 text-secondary-foreground hover:bg-secondary border border-border/50"
                            }`}
                        >
                          <Cloud className="w-4 h-4" />
                          <span>{t.modelApi}</span>
                        </motion.button>
                      </div>

                      {/* Time Range Toggle */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1 }}
                        className={`flex items-center gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}
                      >
                        <motion.button
                          type="button"
                          onClick={() => setEnableTimeRange(!enableTimeRange)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${enableTimeRange
                            ? "bg-primary/10 text-primary border border-primary/30"
                            : "bg-secondary/50 text-muted-foreground border border-border/50 hover:bg-secondary"
                            }`}
                        >
                          <Clock className={`w-3.5 h-3.5 ${enableTimeRange ? "text-primary" : "text-muted-foreground"}`} />
                          <span>{t.enableTimeRange}</span>
                        </motion.button>
                      </motion.div>
                    </motion.div>

                    {/* Time Range Inputs */}
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{
                        opacity: enableTimeRange ? 1 : 0,
                        height: enableTimeRange ? "auto" : 0
                      }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      {enableTimeRange && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className={`grid grid-cols-2 gap-4 px-2 pt-2 ${language === "ar" ? "rtl" : "ltr"}`}
                        >
                          {/* Start Time */}
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground block">
                              {t.startTime}
                            </label>
                            <div className={`flex gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}>
                              <div className="flex-1">
                                <Input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  value={startMinutes}
                                  onChange={(e) => setStartMinutes(e.target.value)}
                                  className="h-10 text-center"
                                  dir="ltr"
                                />
                                <span className="text-xs text-muted-foreground mt-1 block text-center">{t.minutes}</span>
                              </div>
                              <div className="flex items-center pt-6">
                                <span className="text-muted-foreground">:</span>
                              </div>
                              <div className="flex-1">
                                <Input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  max="59"
                                  value={startSeconds}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
                                      setStartSeconds(val);
                                    }
                                  }}
                                  className="h-10 text-center"
                                  dir="ltr"
                                />
                                <span className="text-xs text-muted-foreground mt-1 block text-center">{t.seconds}</span>
                              </div>
                            </div>
                          </div>

                          {/* End Time */}
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground block">
                              {t.endTime}
                            </label>
                            <div className={`flex gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}>
                              <div className="flex-1">
                                <Input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  value={endMinutes}
                                  onChange={(e) => setEndMinutes(e.target.value)}
                                  className="h-10 text-center"
                                  dir="ltr"
                                />
                                <span className="text-xs text-muted-foreground mt-1 block text-center">{t.minutes}</span>
                              </div>
                              <div className="flex items-center pt-6">
                                <span className="text-muted-foreground">:</span>
                              </div>
                              <div className="flex-1">
                                <Input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  max="59"
                                  value={endSeconds}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
                                      setEndSeconds(val);
                                    }
                                  }}
                                  className="h-10 text-center"
                                  dir="ltr"
                                />
                                <span className="text-xs text-muted-foreground mt-1 block text-center">{t.seconds}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  </div>
                </form>
              </CardContent>
            </Card>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className={`flex justify-center gap-8 mt-8 text-sm font-medium text-muted-foreground ${language === "ar" ? "flex-row-reverse" : ""}`}
            >
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleUploadClick}
                className="flex items-center gap-2 hover:text-primary transition-colors group"
              >
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="p-2.5 bg-secondary rounded-full group-hover:bg-primary/10 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                </motion.div>
                {t.uploadFile}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  toast({
                    title: language === "ar" ? "قريباً" : "Coming Soon",
                    description: language === "ar"
                      ? "ميزة التسجيل الصوتي سيتم إضافتها قريباً"
                      : "Audio recording feature will be added soon",
                  });
                }}
                className="flex items-center gap-2 hover:text-primary transition-colors group cursor-pointer"
              >
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="p-2.5 bg-secondary rounded-full group-hover:bg-primary/10 transition-colors"
                >
                  <Mic className="w-4 h-4" />
                </motion.div>
                {t.recordAudio}
              </motion.button>
            </motion.div>
          </motion.div>
        </section>

        <FeatureShowcase />

        {/* Models Comparison Section */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="py-16 bg-gradient-to-b from-background via-secondary/5 to-background rounded-3xl border border-border/50"
        >
          <div className="max-w-5xl mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {language === "ar" ? "اختر الموديل المناسب لك" : "Choose the Right Model for You"}
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                {language === "ar"
                  ? "اختر الموديل المناسب لاحتياجاتك - كلاهما يعمل على سيرفراتنا السحابية القوية"
                  : "Choose the model that fits your needs - both run on our powerful cloud servers"}
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* GPU Model Card */}
              <motion.div
                initial={{ opacity: 0, x: language === "ar" ? 20 : -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                whileHover={{ y: -5, scale: 1.02 }}
                className="relative group"
              >
                <Card className="h-full border-2 border-blue-500/20 hover:border-blue-500/50 transition-all duration-300 shadow-lg hover:shadow-xl bg-gradient-to-br from-blue-50/50 dark:from-blue-950/20 to-background">
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                        <Cpu className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold mb-1">{t.modelGpu}</h3>
                        <p className="text-sm text-muted-foreground">
                          {language === "ar"
                            ? "معالجة سريعة على سيرفرات GPU قوية - مثالي للمحاضرات الطويلة"
                            : "Fast processing on powerful GPU servers - perfect for long lectures"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-foreground flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          {language === "ar" ? "المميزات" : "Advantages"}
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-1">✓</span>
                            <span>{language === "ar" ? "أسرع معالجة - سيرفرات GPU احترافية" : "Faster processing - Professional GPU servers"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-1">✓</span>
                            <span>{language === "ar" ? "مثالي للمحاضرات الطويلة والفيديوهات الكبيرة" : "Perfect for long lectures and large videos"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-1">✓</span>
                            <span>{language === "ar" ? "جودة عالية - نماذج متقدمة" : "High quality - Advanced models"}</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-foreground flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          {language === "ar" ? "متى تستخدمه؟" : "When to use?"}
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-start gap-2">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>{language === "ar" ? "محاضرات طويلة (أكثر من 30 دقيقة)" : "Long lectures (30+ minutes)"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>{language === "ar" ? "ملفات صوتية/فيديو كبيرة" : "Large audio/video files"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>{language === "ar" ? "عند الحاجة لسرعة عالية" : "When you need maximum speed"}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* API Model Card */}
              <motion.div
                initial={{ opacity: 0, x: language === "ar" ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                whileHover={{ y: -5, scale: 1.02 }}
                className="relative group"
              >
                <Card className="h-full border-2 border-purple-500/20 hover:border-purple-500/50 transition-all duration-300 shadow-lg hover:shadow-xl bg-gradient-to-br from-purple-50/50 dark:from-purple-950/20 to-background">
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg">
                        <Cloud className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold mb-1">{t.modelApi}</h3>
                        <p className="text-sm text-muted-foreground">
                          {language === "ar"
                            ? "معالجة سحابية موثوقة من Google - مثالي للمحاضرات القصيرة والمتوسطة"
                            : "Reliable cloud processing by Google - perfect for short and medium lectures"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-foreground flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          {language === "ar" ? "المميزات" : "Advantages"}
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-1">✓</span>
                            <span>{language === "ar" ? "ممتاز للعربي - دقة عالية جداً" : "Excellent for Arabic - Very high accuracy"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-1">✓</span>
                            <span>{language === "ar" ? "موثوق وسريع - من Google Gemini" : "Reliable and fast - Powered by Google Gemini"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-1">✓</span>
                            <span>{language === "ar" ? "مثالي للمحاضرات القصيرة والمتوسطة" : "Perfect for short and medium lectures"}</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-foreground flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                          {language === "ar" ? "متى تستخدمه؟" : "When to use?"}
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-start gap-2">
                            <span className="text-purple-500 mt-1">•</span>
                            <span>{language === "ar" ? "محاضرات عربية (دقة ممتازة)" : "Arabic lectures (excellent accuracy)"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-purple-500 mt-1">•</span>
                            <span>{language === "ar" ? "محاضرات قصيرة ومتوسطة (أقل من 30 دقيقة)" : "Short/medium lectures (under 30 min)"}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-purple-500 mt-1">•</span>
                            <span>{language === "ar" ? "عند الحاجة لدقة عالية في التفريغ" : "When you need high transcription accuracy"}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Recommendation */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-purple-500/10 to-blue-600/10 border border-primary/20"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-2">{language === "ar" ? "نصيحة" : "Recommendation"}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {language === "ar"
                      ? "للمحاضرات العربية: استخدم LM-Cloud للحصول على أفضل دقة. للمحاضرات الطويلة أو الملفات الكبيرة: استخدم LM-Titan للسرعة العالية. كلاهما يعمل على سيرفراتنا السحابية القوية."
                      : "For Arabic lectures: Use LM-Cloud for best accuracy. For long lectures or large files: Use LM-Titan for maximum speed. Both run on our powerful cloud servers."}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* How it Works Section */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="py-16 border-t border-b border-border/50 bg-gradient-to-b from-secondary/5 via-background to-secondary/5 -mx-4 md:-mx-8 px-4 md:px-8"
        >
          <div className="max-w-5xl mx-auto text-center space-y-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-4"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {t.howItWorksTitle}
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                {t.howItWorksSubtitle}
              </p>
            </motion.div>

            <div className="relative">
              <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative">
                {t.steps.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.2 }}
                    whileHover={{ y: -8, scale: 1.02 }}
                    className="relative p-8 rounded-2xl bg-background border-2 border-border/50 shadow-lg hover:shadow-xl hover:border-primary/30 transition-all duration-300 group"
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground font-bold text-base py-2 px-5 rounded-full shadow-lg group-hover:shadow-primary/30 transition-shadow z-10"
                    >
                      {item.step}
                    </motion.div>
                    <h3 className="font-bold text-xl mt-6 mb-3 text-foreground group-hover:text-primary transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {item.desc}
                    </p>

                    {/* Arrow between cards */}
                    {i < t.steps.length - 1 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 + i * 0.2, type: "spring", stiffness: 200 }}
                        className={`hidden md:flex absolute top-1/2 ${language === "ar" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 via-purple-500/20 to-primary/20 border-2 border-primary/30 shadow-md items-center justify-center z-20`}
                      >
                        <ArrowRight className={`w-5 h-5 text-primary ${language === "ar" ? "rotate-180" : ""}`} />
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* Stats Section */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="py-12"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { number: "10K+", label: language === "ar" ? "محاضرة معالجة" : "Lectures Processed" },
              { number: "50K+", label: language === "ar" ? "سؤال منشأ" : "Questions Generated" },
              { number: "95%", label: language === "ar" ? "دقة" : "Accuracy" },
              { number: "24/7", label: language === "ar" ? "متاح دائماً" : "Always Available" },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                whileHover={{ scale: 1.05 }}
                className="text-center p-6 rounded-2xl bg-gradient-to-br from-card to-card/50 border border-border/50 shadow-lg hover:shadow-xl transition-all"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 + 0.2, type: "spring" }}
                  className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent mb-2"
                >
                  {stat.number}
                </motion.div>
                <p className="text-sm text-muted-foreground font-medium">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>


      </div>
    </AppLayout>
  );
}
