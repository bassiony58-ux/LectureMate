import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, List, HelpCircle, Presentation, Share2, Download, ChevronLeft, Trash2, X, Sparkles, Clock, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { TranscriptView } from "@/components/lecture/TranscriptView";
import { SummaryView } from "@/components/lecture/SummaryView";
import { QuizView } from "@/components/lecture/QuizView";
import { SlidesView } from "@/components/lecture/SlidesView";
import { FlashcardsView } from "@/components/lecture/FlashcardsView";
import { ChatAssistant } from "@/components/lecture/ChatAssistant";
import { Brain } from "lucide-react";
import { useLecture, useLectures } from "@/hooks/useLectures";
import { generateSummary, generateQuiz, generateSlides, generateFlashcards } from "@/lib/aiService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useLanguage } from "@/contexts/LanguageContext";
import { Cpu, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";

export default function LectureView() {
  const { id } = useParams();
  const { lecture, isLoading } = useLecture(id);
  const { deleteLecture, updateLecture, isDeleting, isUpdating } = useLectures();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { language, isRTL } = useLanguage();
  const [selectedModel, setSelectedModel] = useState<"gpu" | "api">("api");

  // Track previous state to detect completion
  const prevStateRef = useRef<{
    transcript: boolean;
    summary: boolean;
    quiz: boolean;
    slides: boolean;
    flashcards: boolean;
  }>({
    transcript: false,
    summary: false,
    quiz: false,
    slides: false,
    flashcards: false,
  });

  // Function to play notification sound
  const playNotificationSound = () => {
    try {
      // Create a simple notification sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Higher pitch for success
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      // Fallback: use browser notification sound if available
      console.log("Audio notification played");
    }
  };

  // Track section completions and show notifications
  useEffect(() => {
    if (!lecture || lecture.status !== "processing") return;

    const currentState = {
      transcript: !!(lecture.transcript && lecture.transcript.length > 0),
      summary: !!(lecture.summary && (typeof lecture.summary === 'string' ? lecture.summary.length > 0 : Array.isArray(lecture.summary) && lecture.summary.length > 0)),
      quiz: !!(lecture.quiz_sets && Object.values(lecture.quiz_sets).some(set => set.length > 0)),
      slides: !!(lecture.slides && lecture.slides.length > 0),
      flashcards: !!(lecture.flashcards && lecture.flashcards.length > 0),
    };

    const prevState = prevStateRef.current;

    // Check for newly completed sections
    if (currentState.transcript && !prevState.transcript) {
      playNotificationSound();
      toast({
        title: language === "ar" ? "اكتمل النص" : "Transcript Ready",
        description: language === "ar" ? "تم استخراج النص بنجاح" : "Transcript has been extracted successfully",
        duration: 3000,
      });
    }
    if (currentState.summary && !prevState.summary) {
      playNotificationSound();
      toast({
        title: language === "ar" ? "اكتمل الملخص" : "Summary Ready",
        description: language === "ar" ? "تم إنشاء الملخص بنجاح" : "Summary has been generated successfully",
        duration: 3000,
      });
    }
    if (currentState.quiz && !prevState.quiz) {
      playNotificationSound();
      toast({
        title: language === "ar" ? "اكتمل الاختبار" : "Quiz Ready",
        description: language === "ar" ? "تم إنشاء الاختبار بنجاح" : "Quiz has been generated successfully",
        duration: 3000,
      });
    }
    if (currentState.slides && !prevState.slides) {
      playNotificationSound();
      toast({
        title: language === "ar" ? "اكتملت الشرائح" : "Slides Ready",
        description: language === "ar" ? "تم إنشاء الشرائح بنجاح" : "Slides have been generated successfully",
        duration: 3000,
      });
    }
    if (currentState.flashcards && !prevState.flashcards) {
      playNotificationSound();
      toast({
        title: language === "ar" ? "اكتملت البطاقات" : "Flashcards Ready",
        description: language === "ar" ? "تم إنشاء البطاقات بنجاح" : "Flashcards have been generated successfully",
        duration: 3000,
      });
    }

    // Update previous state
    prevStateRef.current = currentState;
  }, [lecture?.transcript, lecture?.summary, lecture?.quiz_sets, lecture?.slides, lecture?.flashcards, lecture?.status, toast, language]);

  const t = {
    loadingLecture: language === "ar" ? "جاري تحميل المحاضرة..." : "Loading lecture...",
    notFound: language === "ar" ? "المحاضرة غير موجودة." : "Lecture not found.",
    backToDashboard: language === "ar" ? "العودة للوحة التحكم" : "Back to Dashboard",
    stopProcessing: language === "ar" ? "إيقاف المعالجة" : "Stop Processing",
    rerunAI: language === "ar" ? "إعادة تشغيل الذكاء الاصطناعي" : "Re-run AI",
    share: language === "ar" ? "مشاركة" : "Share",
    exportAll: language === "ar" ? "تصدير الكل" : "Export All",
    delete: language === "ar" ? "حذف" : "Delete",
    deleting: language === "ar" ? "جاري الحذف..." : "Deleting...",
    areYouSure: language === "ar" ? "هل أنت متأكد؟" : "Are you sure?",
    deleteConfirm: language === "ar"
      ? "لا يمكن التراجع عن هذا الإجراء. سيتم حذف المحاضرة وكل بياناتها نهائياً."
      : "This action cannot be undone. This will permanently delete the lecture and all of its data.",
    cancel: language === "ar" ? "إلغاء" : "Cancel",
    transcript: language === "ar" ? "النص الكامل" : "Transcript",
    summary: language === "ar" ? "الملخص" : "Summary",
    quiz: language === "ar" ? "الاختبار" : "Quiz",
    slides: language === "ar" ? "الشرائح" : "Slides",
    cards: language === "ar" ? "البطاقات" : "Cards",
    status: {
      completed: language === "ar" ? "مكتمل" : "completed",
      processing: language === "ar" ? "جاري المعالجة" : "processing",
      failed: language === "ar" ? "فشل" : "failed",
    },
    toast: {
      exportSuccess: language === "ar" ? "تم التصدير بنجاح" : "Export successful",
      exportSuccessDesc: language === "ar" ? "تم تصدير كل المحتوى كملف PDF." : "All content has been exported as PDF.",
      exportFailed: language === "ar" ? "فشل التصدير" : "Export failed",
      exportFailedDesc: language === "ar" ? "فشل تصدير PDF. يرجى المحاولة مرة أخرى." : "Failed to export PDF. Please try again.",
      deleted: language === "ar" ? "تم حذف المحاضرة" : "Lecture deleted",
      deletedDesc: language === "ar" ? "تم حذف المحاضرة بنجاح." : "The lecture has been deleted successfully.",
      error: language === "ar" ? "خطأ" : "Error",
      stopProcessing: language === "ar" ? "تم إيقاف المعالجة" : "Processing stopped",
      stopProcessingDesc: language === "ar" ? "تم إيقاف معالجة المحاضرة." : "The lecture processing has been stopped.",
      cannotReprocess: language === "ar" ? "لا يمكن إعادة المعالجة" : "Cannot re-process",
      cannotReprocessDesc: language === "ar" ? "النص مفقود أو قصير جداً للمعالجة." : "Transcript is missing or too short to process.",
      reprocessStarted: language === "ar" ? "بدأت إعادة المعالجة" : "Re-processing started",
      reprocessStartedDesc: language === "ar" ? "جاري إعادة إنشاء الملخص والاختبار والشرائح لهذه المحاضرة." : "Regenerating summary, quiz, and slides for this lecture.",
      reprocessComplete: language === "ar" ? "اكتملت إعادة المعالجة" : "Re-processing complete",
      reprocessCompleteDesc: language === "ar" ? "تم إعادة إنشاء محتوى الذكاء الاصطناعي لهذه المحاضرة." : "AI content for this lecture has been regenerated.",
      reprocessFailed: language === "ar" ? "فشلت إعادة المعالجة" : "Re-processing failed",
      shared: language === "ar" ? "تمت المشاركة بنجاح" : "Shared successfully",
      sharedDesc: language === "ar" ? "تم مشاركة رابط المحاضرة." : "The lecture link has been shared.",
      copied: language === "ar" ? "تم النسخ" : "Copied to clipboard",
      copiedDesc: language === "ar" ? "تم نسخ رابط المحاضرة إلى الحافظة." : "Lecture link has been copied to your clipboard.",
    },
    selectModel: language === "ar" ? "اختر الموديل" : "Select Model",
    modelGpu: language === "ar" ? "LM-Titan (GPU)" : "LM-Titan (GPU)",
    modelApi: language === "ar" ? "LM-Cloud (API)" : "LM-Cloud (API)",
    loading: {
      transcript: language === "ar" ? "جاري استخراج النص..." : "Extracting transcript...",
      summary: language === "ar" ? "جاري إنشاء الملخص..." : "Generating summary...",
      quiz: language === "ar" ? "جاري إنشاء الاختبار..." : "Generating quiz...",
      slides: language === "ar" ? "جاري إنشاء الشرائح..." : "Generating slides...",
      flashcards: language === "ar" ? "جاري إنشاء البطاقات..." : "Generating flashcards...",
    },
  };

  // Helper function to check if a section is loading
  const isSectionLoading = (section: "transcript" | "summary" | "quiz" | "slides" | "flashcards") => {
    if (!lecture || lecture.status !== "processing") return false;
    const progress = lecture.progress || 0;

    switch (section) {
      case "transcript":
        // Show loading if progress < 40 OR if transcript doesn't exist yet
        return (progress < 40 || !lecture.transcript || lecture.transcript.length === 0);
      case "summary":
        // Show loading if progress < 60 OR if summary doesn't exist yet
        // Also show if we're in the summary processing range (40-60)
        return (progress < 60 || !lecture.summary || (typeof lecture.summary === 'string' ? lecture.summary.length === 0 : Array.isArray(lecture.summary) && lecture.summary.length === 0));
      case "quiz":
        // Show loading if progress < 80 OR if quiz_sets don't exist yet
        return (progress < 80 || !lecture.quiz_sets || !Object.values(lecture.quiz_sets).some(set => set.length > 0));
      case "slides":
        // Show loading if progress < 90 OR if slides don't exist yet
        // Also show if we're in the slides processing range (80-90)
        return (progress < 90 || !lecture.slides || lecture.slides.length === 0);
      case "flashcards":
        // Show loading if progress < 100 OR if flashcards don't exist yet
        // Also show if we're in the flashcards processing range (90-100)
        return (progress < 100 || !lecture.flashcards || lecture.flashcards.length === 0);
      default:
        return false;
    }
  };

  // Loading component for each section
  const SectionLoading = ({ section, icon: Icon }: { section: "transcript" | "summary" | "quiz" | "slides" | "flashcards", icon: any }) => {
    const getProgress = () => {
      if (!lecture?.progress) return 0;
      const progress = lecture.progress;

      switch (section) {
        case "transcript":
          // Transcript: 0-40% of overall progress
          if (progress >= 40) return 100;
          return Math.min((progress / 40) * 100, 100);
        case "summary":
          // Summary: 40-60% of overall progress
          if (progress < 40) return 0;
          if (progress >= 60) return 100;
          // Show progress from 0% to 100% within the 40-60% range
          return Math.min(((progress - 40) / 20) * 100, 100);
        case "quiz":
          // Quiz: 60-80% of overall progress
          if (progress < 60) return 0;
          if (progress >= 80) return 100;
          // Show progress from 0% to 100% within the 60-80% range
          return Math.min(((progress - 60) / 20) * 100, 100);
        case "slides":
          // Slides: 80-90% of overall progress
          if (progress < 80) return 0;
          if (progress >= 90) return 100;
          // Show progress from 0% to 100% within the 80-90% range
          return Math.min(((progress - 80) / 10) * 100, 100);
        case "flashcards":
          // Flashcards: 90-100% of overall progress
          if (progress < 90) return 0;
          if (progress >= 100) return 100;
          // Show progress from 0% to 100% within the 90-100% range
          return Math.min(((progress - 90) / 10) * 100, 100);
        default:
          return 0;
      }
    };

    const progressValue = getProgress();

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6 p-8">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-primary/10 rounded-full p-6 border-2 border-primary/20">
            <Icon className="w-8 h-8 text-primary animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-3 w-full max-w-md">
          <p className="text-xl font-semibold text-foreground">{t.loading[section]}</p>
          <p className="text-sm text-muted-foreground">
            {language === "ar" ? "جاري المعالجة، يرجى الانتظار..." : "Processing, please wait..."}
          </p>
          <div className="space-y-2 pt-2">
            <Progress value={progressValue} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {Math.round(progressValue)}%
            </p>
          </div>
        </div>
        <div className="w-full max-w-md space-y-3 mt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      </div>
    );
  };

  const handleExportAll = async () => {
    if (!lecture) return;

    try {
      // Check if content contains Arabic characters
      const contentText = [
        lecture.title,
        lecture.transcript,
        Array.isArray(lecture.summary) ? lecture.summary.join(" ") : lecture.summary || "",
        lecture.quiz_sets ? [
          ...(lecture.quiz_sets.easy || []),
          ...(lecture.quiz_sets.medium || []),
          ...(lecture.quiz_sets.hard || [])
        ].map((q: any) => q.text || "").join(" ") : "",
        lecture.slides?.map((s: any) => Array.isArray(s.content) ? s.content.join(" ") : s.content || "").join(" "),
      ].join(" ");
      const hasArabic = /[\u0600-\u06FF]/.test(contentText);
      const dir = hasArabic ? "rtl" : "ltr";
      const textAlign = hasArabic ? "right" : "left";

      // Colors matching the app theme
      const primaryColor = "#8B5CF6";
      const primaryDark = "#7C3AED";
      const primaryLight = "#EDE9FE";
      const textColor = "#0A0A0B";
      const mutedBg = "#F4F4F5";
      const borderColor = "#E4E4E7";
      const successColor = "#10B981";

      // Build HTML content
      let htmlContent = `
        <div style="font-family: ${hasArabic ? "Tajawal, Arial, sans-serif" : "Arial, sans-serif"}; direction: ${dir}; color: ${textColor};">
          <!-- Title -->
          <div style="margin-bottom: 30px; padding-bottom: 15px; border-bottom: 3px solid ${primaryColor};">
            <h1 style="font-size: 24px; font-weight: bold; color: ${primaryColor}; margin: 0; text-align: ${textAlign};">
              ${lecture.title}
            </h1>
          </div>
      `;

      // Transcript
      if (lecture.transcript) {
        htmlContent += `
          <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 8px; margin-bottom: 15px; text-align: ${textAlign};">
              ${language === "ar" ? "📝 النص الكامل" : "📝 Transcript"}
            </h2>
            <div style="font-size: 12px; line-height: 1.8; text-align: justify; padding: 15px; background-color: ${mutedBg}; border-${hasArabic ? "right" : "left"}: 4px solid ${primaryColor}; border-radius: 8px;">
              ${lecture.transcript.replace(/\n/g, "<br>")}
            </div>
          </div>
        `;
      }

      // Summary
      if (lecture.summary) {
        htmlContent += `
          <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 8px; margin-bottom: 15px; text-align: ${textAlign};">
              ${language === "ar" ? "📊 الملخص" : "📊 Summary"}
            </h2>
            <div style="font-size: 13px; line-height: 1.9; text-align: justify; padding: 15px; background-color: ${primaryLight}; border-${hasArabic ? "right" : "left"}: 4px solid ${primaryDark}; border-radius: 8px;">
        `;

        if (Array.isArray(lecture.summary)) {
          lecture.summary.forEach((item: string, index: number) => {
            htmlContent += `<div style="margin-bottom: 10px;">${index + 1}. ${item.replace(/\*\*(.+?)\*\*/g, `<strong style="color: ${primaryDark};">$1</strong>`)}</div>`;
          });
        } else if (typeof lecture.summary === "string") {
          htmlContent += lecture.summary.replace(/\*\*(.+?)\*\*/g, `<strong style="color: ${primaryDark};">$1</strong>`).replace(/\n/g, "<br>");
        }

        htmlContent += `</div></div>`;
      }

      // Quiz (All Levels Combined for full export)
      if (lecture.quiz_sets) {
        htmlContent += `
          <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 8px; margin-bottom: 15px; text-align: ${textAlign};">
              ${language === "ar" ? "❓ بنك الأسئلة الشامل (90+ سؤال)" : "❓ Comprehensive Question Bank (90+ Questions)"}
            </h2>
        `;

        const allSets = [
          { name: language === "ar" ? "مستوى سهل" : "Easy", q: lecture.quiz_sets.easy || [] },
          { name: language === "ar" ? "مستوى متوسط" : "Medium", q: lecture.quiz_sets.medium || [] },
          { name: language === "ar" ? "مستوى متقدم" : "Hard", q: lecture.quiz_sets.hard || [] }
        ];

        allSets.forEach(set => {
          if (set.q.length === 0) return;

          htmlContent += `<h3 style="margin-top: 20px; color: ${primaryDark}; text-decoration: underline;">${set.name}</h3>`;

          set.q.forEach((q: any, index: number) => {
            const questionText = q.text || "";
            htmlContent += `
              <div style="margin-bottom: 15px; padding: 12px; background-color: ${mutedBg}; border-radius: 8px;">
                <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">
                  ${index + 1}: ${questionText.replace(/\*\*(.+?)\*\*/g, `<strong>$1</strong>`)}
                </div>
            `;

            if (q.options && q.options.length > 0) {
              q.options.forEach((opt: string, optIndex: number) => {
                const isCorrect = optIndex === q.correctIndex;
                htmlContent += `
                  <div style="margin-bottom: 3px; font-size: 12px; ${isCorrect ? `color: ${successColor}; font-weight: bold;` : ""}">
                    ${String.fromCharCode(65 + optIndex)}. ${opt} ${isCorrect ? " ✓" : ""}
                  </div>
                `;
              });
            } else if (q.type === "open_ended") {
              htmlContent += `
                <div style="font-size: 12px; color: #6b7280; font-style: italic;">
                  ${language === "ar" ? "الكلمات المفتاحية المطلوبة:" : "Keywords matching:"} ${q.expected_keywords?.join(", ") || ""}
                </div>
              `;
            }

            htmlContent += `</div>`;
          });
        });

        htmlContent += `</div>`;
      }

      // Slides
      if (lecture.slides && lecture.slides.length > 0) {
        htmlContent += `
          <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 8px; margin-bottom: 15px; text-align: ${textAlign};">
              ${language === "ar" ? "📊 الشرائح" : "📊 Slides"}
            </h2>
        `;

        lecture.slides.forEach((slide: any, index: number) => {
          const slideTitle = slide.title || `${language === "ar" ? "شريحة" : "Slide"} ${index + 1}`;
          const slideContent = Array.isArray(slide.content) ? slide.content : [slide.content || ""];

          htmlContent += `
            <div style="margin-bottom: 20px; padding: 15px; background-color: ${primaryLight}; border-radius: 8px; border-${hasArabic ? "right" : "left"}: 4px solid ${primaryDark};">
              <h3 style="font-size: 16px; font-weight: bold; color: ${primaryDark}; margin-bottom: 10px;">
                ${slideTitle}
              </h3>
              <div style="font-size: 13px; line-height: 1.8;">
                ${slideContent.map((item: string) => `<div style="margin-bottom: 5px;">• ${item}</div>`).join("")}
              </div>
            </div>
          `;
        });

        htmlContent += `</div>`;
      }

      htmlContent += `</div>`;

      // Create temporary container
      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.width = "210mm"; // A4 width
      container.style.padding = "15mm";
      container.style.backgroundColor = "white";
      container.style.fontFamily = hasArabic ? "Tajawal, Arial, sans-serif" : "Arial, sans-serif";
      document.body.appendChild(container);

      // Wait for fonts to load
      await new Promise(resolve => setTimeout(resolve, 200));

      // Convert HTML to Canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 794, // A4 width in pixels at 96 DPI
        windowHeight: container.scrollHeight,
      });

      // Remove temporary container
      document.body.removeChild(container);

      // Create PDF
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      const pdf = new jsPDF("p", "mm", "a4");
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      // Add first page
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Save PDF
      const fileName = `${lecture.title.replace(/[^a-z0-9\u0600-\u06FF]/gi, "_")}_export.pdf`;
      pdf.save(fileName);

      toast({
        title: t.toast.exportSuccess,
        description: t.toast.exportSuccessDesc,
      });
    } catch (error: any) {
      console.error("Error exporting PDF:", error);
      toast({
        title: t.toast.exportFailed,
        description: error?.message || t.toast.exportFailedDesc,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!lecture) return;
    try {
      // Stop backend processes first if processing
      if (lecture.status === "processing") {
        try {
          const stopResponse = await fetch(`/api/lecture/${lecture.id}/stop`, {
            method: "POST",
          });
          if (stopResponse.ok) {
            const stopData = await stopResponse.json();
            console.log(`[LectureView] Stopped ${stopData.stopped || 0} process(es) before deletion`);
          }
        } catch (stopError) {
          console.error("[LectureView] Error stopping processes before deletion:", stopError);
          // Continue even if stop endpoint fails
        }
      }

      await deleteLecture(lecture.id);
      toast({
        title: t.toast.deleted,
        description: t.toast.deletedDesc,
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lecture.",
        variant: "destructive",
      });
    }
  };

  const handleStopProcessing = async () => {
    if (!lecture) return;
    try {
      // Stop backend processes first
      try {
        const stopResponse = await fetch(`/api/lecture/${lecture.id}/stop`, {
          method: "POST",
        });
        if (stopResponse.ok) {
          const stopData = await stopResponse.json();
          console.log(`[LectureView] Stopped ${stopData.stopped || 0} process(es)`);
        }
      } catch (stopError) {
        console.error("[LectureView] Error stopping processes:", stopError);
        // Continue even if stop endpoint fails
      }

      await updateLecture({ lectureId: lecture.id, updates: { status: "failed" } });
      toast({
        title: t.toast.stopProcessing,
        description: t.toast.stopProcessingDesc,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to stop processing.",
        variant: "destructive",
      });
    }
  };

  const handleReprocess = async () => {
    if (!lecture) return;

    if (!lecture.transcript || lecture.transcript.length < 100) {
      toast({
        title: t.toast.cannotReprocess,
        description: t.toast.cannotReprocessDesc,
        variant: "destructive",
      });
      return;
    }

    try {
      // Mark as processing again
      await updateLecture({
        lectureId: lecture.id,
        updates: {
          status: "processing",
          progress: 10,
          modelType: selectedModel, // Update model type
          // optionally clear previous AI outputs
          summary: [],
          quiz_sets: { easy: [], medium: [], hard: [] },
          slides: [],
          flashcards: [],
        },
      });

      toast({
        title: t.toast.reprocessStarted,
        description: t.toast.reprocessStartedDesc,
      });

      const transcript = lecture.transcript;

      // Generate summary with selected model
      const summary = await generateSummary(transcript, selectedModel);
      await updateLecture({
        lectureId: lecture.id,
        updates: {
          progress: 50,
          summary,
        },
      });

      // Generate quiz with selected model
      const questions = await generateQuiz(transcript, selectedModel, "comprehensive", lecture.title);
      await updateLecture({
        lectureId: lecture.id,
        updates: {
          progress: 75,
          questions: questions as any,
        },
      });

      // Generate slides
      const slides = await generateSlides(transcript, summary);
      await updateLecture({
        lectureId: lecture.id,
        updates: {
          progress: 90,
          slides,
        },
      });

      // Generate flashcards
      const flashcards = await generateFlashcards(transcript, selectedModel);
      await updateLecture({
        lectureId: lecture.id,
        updates: {
          progress: 100,
          flashcards,
          status: "completed",
          modelType: selectedModel, // Ensure model type is saved
        },
      });

      toast({
        title: t.toast.reprocessComplete,
        description: t.toast.reprocessCompleteDesc,
      });
    } catch (error: any) {
      console.error("Error re-processing lecture:", error);
      await updateLecture({
        lectureId: lecture.id,
        updates: { status: "failed" },
      });
      toast({
        title: t.toast.reprocessFailed,
        description: error?.message || (language === "ar" ? "فشل إعادة معالجة هذه المحاضرة." : "Failed to re-process this lecture."),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">{t.loadingLecture}</div>
        </div>
      </AppLayout>
    );
  }

  if (!lecture) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">{t.notFound}</p>
            <Link href="/dashboard">
              <Button>{t.backToDashboard}</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8 pb-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className={`w-4 h-4 ${language === "ar" ? "ml-1" : "mr-1"}`} />
              {t.backToDashboard}
            </Button>
          </Link>

          {/* Lecture Header Card */}
          <div className="bg-gradient-to-br from-card via-card to-card/80 border rounded-2xl p-6 shadow-lg shadow-primary/5">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Thumbnail */}
              {lecture.thumbnailUrl && (
                <div className="relative w-full lg:w-80 aspect-video rounded-xl overflow-hidden flex-shrink-0 shadow-md group">
                  <img
                    src={lecture.thumbnailUrl}
                    alt={lecture.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <Badge className="bg-black/70 text-white border-0 backdrop-blur-sm">
                      <Clock className="w-3 h-3 mr-1" />
                      {lecture.duration}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={lecture.status === "completed" ? "default" : lecture.status === "processing" ? "secondary" : "destructive"} className="text-xs font-semibold">
                    {t.status[lecture.status as keyof typeof t.status] || lecture.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Calendar className="w-3 h-3 mr-1" />
                    {lecture.date}
                  </Badge>
                  {lecture.modelType && (
                    <Badge
                      variant="outline"
                      className={`text-xs font-medium ${lecture.modelType === "gpu"
                        ? "bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-300"
                        : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300"
                        }`}
                    >
                      {lecture.modelType === "gpu" ? (
                        <>
                          <Cpu className="w-3 h-3 mr-1" />
                          {t.modelGpu}
                        </>
                      ) : (
                        <>
                          <Cloud className="w-3 h-3 mr-1" />
                          {t.modelApi}
                        </>
                      )}
                    </Badge>
                  )}
                </div>

                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground leading-tight">
                  {lecture.title}
                </h1>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {lecture.status === "processing" && (
                    <Button variant="outline" onClick={handleStopProcessing} disabled={isUpdating} className="border-orange-200 text-orange-600 hover:bg-orange-50">
                      <X className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
                      {t.stopProcessing}
                    </Button>
                  )}

                  {(lecture.status === "completed" || lecture.status === "failed") && (
                    <>
                      <div className="flex gap-1 border rounded-lg p-1 bg-secondary/30 backdrop-blur-sm">
                        <button
                          onClick={() => setSelectedModel("gpu")}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${selectedModel === "gpu"
                            ? "bg-primary text-primary-foreground shadow-sm scale-105"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            }`}
                        >
                          <Cpu className="w-3 h-3" />
                          {t.modelGpu}
                        </button>
                        <button
                          onClick={() => setSelectedModel("api")}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${selectedModel === "api"
                            ? "bg-primary text-primary-foreground shadow-sm scale-105"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            }`}
                        >
                          <Cloud className="w-3 h-3" />
                          {t.modelApi}
                        </button>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleReprocess}
                        disabled={isUpdating}
                        className="hover:bg-primary/10 hover:border-primary/50"
                      >
                        <Sparkles className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
                        {t.rerunAI}
                      </Button>
                    </>
                  )}

                  <Button
                    variant="outline"
                    onClick={async () => {
                      const url = window.location.href;
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: lecture.title,
                            text: language === "ar" ? `اطلع على هذه المحاضرة: ${lecture.title}` : `Check out this lecture: ${lecture.title}`,
                            url: url,
                          });
                          toast({
                            title: t.toast.shared,
                            description: t.toast.sharedDesc,
                          });
                        } catch (error: any) {
                          if (error.name !== "AbortError") {
                            await navigator.clipboard.writeText(url);
                            toast({
                              title: t.toast.copied,
                              description: t.toast.copiedDesc,
                            });
                          }
                        }
                      } else {
                        await navigator.clipboard.writeText(url);
                        toast({
                          title: t.toast.copied,
                          description: t.toast.copiedDesc,
                        });
                      }
                    }}
                    className="hover:bg-primary/10 hover:border-primary/50"
                  >
                    <Share2 className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
                    {t.share}
                  </Button>

                  <Button
                    onClick={handleExportAll}
                    disabled={!lecture || lecture.status !== "completed"}
                    className="bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
                  >
                    <Download className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
                    {t.exportAll}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="hover:bg-destructive/90">
                        <Trash2 className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
                        {t.delete}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.areYouSure}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t.deleteConfirm} "{lecture.title}"
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isDeleting}>
                          {isDeleting ? t.deleting : t.delete}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Model Info Panel */}
        {lecture.modelType && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className={`border rounded-xl p-4 ${lecture.modelType === "gpu"
              ? "bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200 dark:from-purple-950/50 dark:to-purple-900/30 dark:border-purple-800"
              : "bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200 dark:from-blue-950/50 dark:to-blue-900/30 dark:border-blue-800"
              }`}
          >
            <div className="flex items-center gap-3">
              {lecture.modelType === "gpu" ? (
                <div className="p-2 rounded-lg bg-purple-200 dark:bg-purple-800">
                  <Cpu className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-blue-200 dark:bg-blue-800">
                  <Cloud className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {language === "ar" ? "نموذج المعالجة:" : "Processing Model:"}
                </p>
                <p className={`text-xs mt-0.5 ${lecture.modelType === "gpu"
                  ? "text-purple-700 dark:text-purple-300"
                  : "text-blue-700 dark:text-blue-300"
                  }`}>
                  {lecture.modelType === "gpu"
                    ? (language === "ar" ? "تمت المعالجة باستخدام LM-Titan (GPU)" : "Processed using LM-Titan (GPU)")
                    : (language === "ar" ? "تمت المعالجة باستخدام LM-Cloud (API)" : "Processed using LM-Cloud (API)")
                  }
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >

          <Tabs defaultValue="summary" className="w-full">
            <div className="border-b border-border/40 mb-6">
              <TabsList className={`grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto bg-transparent p-0 gap-1 ${language === "ar" ? "[direction:rtl]" : ""}`}>
                {language === "ar" ? (
                  // Arabic order: النص الكامل > الملخص > الاختبار > الشرائح > البطاقات (from right to left)
                  <>
                    <TabsTrigger
                      value="transcript"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <FileText className="w-4 h-4 ml-2" />
                      <span className="hidden sm:inline">{t.transcript}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="summary"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <List className="w-4 h-4 ml-2" />
                      <span className="hidden sm:inline">{t.summary}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="quiz"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <HelpCircle className="w-4 h-4 ml-2" />
                      <span className="hidden sm:inline">{t.quiz}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="slides"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <Presentation className="w-4 h-4 ml-2" />
                      <span className="hidden sm:inline">{t.slides}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="flashcards"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <Brain className="w-4 h-4 ml-2" />
                      <span className="hidden sm:inline">{t.cards}</span>
                    </TabsTrigger>
                  </>
                ) : (
                  // English order: Transcript > Summary > Quiz > Slides > Flashcards (from left to right)
                  <>
                    <TabsTrigger
                      value="transcript"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">{t.transcript}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="summary"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <List className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">{t.summary}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="quiz"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <HelpCircle className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">{t.quiz}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="slides"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <Presentation className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">{t.slides}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="flashcards"
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg px-4 py-2.5 transition-all"
                    >
                      <Brain className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">{t.cards}</span>
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            <div className="min-h-[500px]">
              <TabsContent value="transcript" className="mt-0 animate-in fade-in-50 duration-300">
                {isSectionLoading("transcript") ? (
                  <SectionLoading section="transcript" icon={FileText} />
                ) : (
                  <TranscriptView text={lecture.transcript || "No transcript available."} title={lecture.title} />
                )}
              </TabsContent>

              <TabsContent value="summary" className="mt-0 animate-in fade-in-50 duration-300">
                {isSectionLoading("summary") ? (
                  <SectionLoading section="summary" icon={List} />
                ) : (
                  <SummaryView summary={lecture.summary || []} title={lecture.title} />
                )}
              </TabsContent>

              <TabsContent value="quiz" className="mt-0 animate-in fade-in-50 duration-300">
                {isSectionLoading("quiz") ? (
                  <SectionLoading section="quiz" icon={HelpCircle} />
                ) : (
                  <QuizView
                    questions={lecture.questions}
                    title={lecture.title}
                    lectureId={lecture.id}
                    transcript={lecture.transcript}
                    modelType={selectedModel}
                  />
                )}
              </TabsContent>

              <TabsContent value="slides" className="mt-0 animate-in fade-in-50 duration-300">
                {isSectionLoading("slides") ? (
                  <SectionLoading section="slides" icon={Presentation} />
                ) : (
                  <SlidesView
                    slides={lecture.slides || []}
                    title={lecture.title}
                    transcript={lecture.transcript}
                    summary={lecture.summary}
                    lectureId={lecture.id}
                  />
                )}
              </TabsContent>

              <TabsContent value="flashcards" className="mt-0 animate-in fade-in-50 duration-300">
                {isSectionLoading("flashcards") ? (
                  <SectionLoading section="flashcards" icon={Brain} />
                ) : (
                  <FlashcardsView flashcards={lecture.flashcards || []} />
                )}
              </TabsContent>
            </div>
          </Tabs>
        </motion.div>
      </div>
      <ChatAssistant />
    </AppLayout>
  );
}
