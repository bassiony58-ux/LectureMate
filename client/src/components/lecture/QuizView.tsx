import { useState, useEffect, useMemo } from "react";
import { Question } from "@/lib/mockData";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, HelpCircle, ArrowRight, RotateCcw, Download, Eye, EyeOff, Info, Search, BookOpen, Sparkles, Target, Timer } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import { generateQuiz, evaluateEssayAnswer, EssayEvaluation } from "@/lib/aiService";
import { useLectures } from "@/hooks/useLectures";

interface QuizViewProps {
  questions?: Question[];
  title?: string;
  lectureId?: string;
  transcript?: string;
  modelType?: "gpu" | "api";
}

export function QuizView({ questions: initialQuestions, title = "Quiz", lectureId, transcript, modelType = "api" }: QuizViewProps) {
  const { updateLecture } = useLectures();
  const [isGenerating, setIsGenerating] = useState(false);
  // Removed difficulty state

  // Use provided questions or empty array
  const [questions, setQuestions] = useState<Question[]>(initialQuestions || []);

  // Sync with prop when it changes
  useEffect(() => {
    if (initialQuestions) {
      setQuestions(initialQuestions);
    }
  }, [initialQuestions]);

  const { language } = useLanguage();
  const { toast } = useToast();

  // Detect language from quiz content (for question/answer text only)
  const detectContentLanguage = useMemo(() => {
    if (questions.length === 0) return language;

    // Check all questions for Arabic
    const allText = questions
      .map(q => `${q.text} ${q.options?.join(" ") || ""}`)
      .join(" ");
    const hasArabic = /[\u0600-\u06FF]/.test(allText);

    // Use content language if detected, otherwise use UI language
    return hasArabic ? "ar" : language;
  }, [questions, language]);

  // Set display direction and text alignment based on detected language (for content only)
  const contentDir = detectContentLanguage === "ar" ? "rtl" : "ltr";
  const contentTextAlign = detectContentLanguage === "ar" ? "right" : "left";

  // Use UI language for UI elements (buttons, menus, etc.)
  const uiDir = language === "ar" ? "rtl" : "ltr";

  const t = {
    complete: language === "ar" ? "اكتمل الاختبار!" : "Quiz Complete!",
    scored: language === "ar" ? "حصلت على" : "You scored",
    outOf: language === "ar" ? "من" : "out of",
    retake: language === "ar" ? "إعادة الاختبار" : "Retake Quiz",
    noQuestions: language === "ar" ? "لا توجد أسئلة متاحة." : "No questions available.",
    question: language === "ar" ? "سؤال" : "Question",
    score: language === "ar" ? "النتيجة" : "Score",
    checkAnswer: language === "ar" ? "تحقق من الإجابة" : "Check Answer",
    nextQuestion: language === "ar" ? "السؤال التالي" : "Next Question",
    finishQuiz: language === "ar" ? "إنهاء الاختبار" : "Finish Quiz",
    reviewAnswers: language === "ar" ? "مراجعة إجاباتي" : "Review My Answers",
    hideReview: language === "ar" ? "إخفاء المراجعة" : "Hide Review",
    correctAnswer: language === "ar" ? "الإجابة الصحيحة" : "Correct Answer",
    yourAnswer: language === "ar" ? "إجابتك" : "Your Answer",
    exportPDF: language === "ar" ? "تصدير PDF" : "Export PDF",
    startQuiz: language === "ar" ? "بدء الاختبار" : "Start Quiz",
    viewQuestions: language === "ar" ? "عرض الأسئلة مع الإجابات" : "View Questions with Answers",
    generateQuiz: language === "ar" ? "إنشاء اختبار" : "Generate Quiz",
    generateDesc: language === "ar" ? "لا يوجد اختبار لهذه المحاضرة بعد. انقر لإنشاء اختبار." : "No quiz exists for this lecture yet. Click to generate one.",
    backToMenu: language === "ar" ? "عودة للقائمة" : "Back to Menu",
    toast: {
      exported: language === "ar" ? "تم تصدير PDF" : "PDF exported",
      exportedDesc: language === "ar" ? "تم تصدير الاختبار كملف PDF." : "The quiz has been exported as PDF.",
      exportFailed: language === "ar" ? "فشل التصدير" : "Export failed",
      exportFailedDesc: language === "ar" ? "فشل تصدير PDF. يرجى المحاولة مرة أخرى." : "Failed to export PDF. Please try again.",
    },
  };



  const [quizReadyToStart, setQuizReadyToStart] = useState(false);
  const [quizMode, setQuizMode] = useState<"menu" | "view" | "quiz" | "review">("menu");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [userTextAnswer, setUserTextAnswer] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [userTextAnswers, setUserTextAnswers] = useState<Record<number, string>>({});
  const [userEssayEvaluations, setUserEssayEvaluations] = useState<Record<number, EssayEvaluation>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isChoosingLevel, setIsChoosingLevel] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const currentQuestion = questions[currentQuestionIndex];

  // Restart timer on new question
  useEffect(() => {
    if (quizMode === "quiz" && !isAnswered && currentQuestion?.type !== "open_ended") {
      setTimeLeft(30);
    } else {
      setTimeLeft(null);
    }
  }, [quizMode, currentQuestionIndex, isAnswered, currentQuestion]);

  // Handle countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || isAnswered || quizMode !== "quiz") return;

    const timerId = setInterval(() => {
      setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft, isAnswered, quizMode]);

  // Handle timeout
  useEffect(() => {
    if (timeLeft === 0 && !isAnswered && quizMode === "quiz" && currentQuestion?.type !== "open_ended") {
      setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: -1 }));
      setIsAnswered(true);
      toast({
        title: language === "ar" ? "انتهى الوقت!" : "Time's up!",
        description: language === "ar" ? "لم تقم بالإجابة في الوقت المحدد." : "You didn't answer in time.",
        variant: "destructive",
      });
    }
  }, [timeLeft, isAnswered, quizMode, currentQuestionIndex, currentQuestion, language, toast]);

  const handleOptionSelect = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
  };

  const handleSubmit = async () => {
    if (currentQuestion.type === "open_ended") {
      if (!userTextAnswer.trim()) return;
      setUserTextAnswers(prev => ({ ...prev, [currentQuestionIndex]: userTextAnswer }));

      setIsEvaluating(true);
      try {
        const evaluation = await evaluateEssayAnswer(
          currentQuestion.text,
          userTextAnswer,
          currentQuestion.correct_answer || "",
          currentQuestion.expected_keywords || [],
          currentQuestion.numerical_answer || null
        );
        setUserEssayEvaluations(prev => ({ ...prev, [currentQuestionIndex]: evaluation }));

        if (evaluation.isCorrect) {
          setScore(s => s + 1);
        }
      } catch (err) {
        console.error("Evaluation failed", err);
        toast({
          title: language === "ar" ? "خطأ في التقييم" : "Evaluation Error",
          description: language === "ar" ? "تعذر تقييم إجابتك، يرجى المحاولة مرة أخرى." : "Could not evaluate your answer, please try again.",
          variant: "destructive"
        });
      } finally {
        setIsEvaluating(false);
        setIsAnswered(true);
      }
    } else {
      if (selectedOption === null) return;
      const isCorrect = selectedOption === currentQuestion.correctIndex;
      if (isCorrect) setScore(s => s + 1);
      setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: selectedOption }));
      setIsAnswered(true);
    }
  };

  const ReferenceBadge = ({ reference }: { reference?: any }) => {
    if (!reference) return null;
    return (
      <div className={cn(
        "mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-3",
        detectContentLanguage === "ar" ? "flex-row-reverse" : ""
      )}>
        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
          <BookOpen className="w-4 h-4" />
        </div>
        <div className="flex-1 text-xs">
          <p className="font-bold text-primary mb-1">
            {detectContentLanguage === "ar" ? "المصدر المرجعي:" : "Reference Source:"}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Search className="w-3 h-3" />
              <span className="font-medium text-foreground">{reference.concept}</span>
            </span>
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>{reference.location}</span>
            </span>
            <Badge variant="outline" className="text-[10px] h-4 py-0 leading-none">
              {reference.source_type === "uploaded_content"
                ? (detectContentLanguage === "ar" ? "من الفيديو" : "From Video")
                : (detectContentLanguage === "ar" ? "موضوع مرتبط" : "Related Topic")}
            </Badge>
          </div>
        </div>
      </div>
    );
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(i => i + 1);
      setSelectedOption(null);
      setUserTextAnswer("");
      setIsAnswered(false);
    } else {
      setQuizComplete(true);
    }
  };

  const handleRestart = () => {
    setQuizMode("menu");
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setUserTextAnswer("");
    setIsAnswered(false);
    setScore(0);
    setQuizComplete(false);
    setUserAnswers({});
    setUserTextAnswers({});
    setUserEssayEvaluations({});
  };

  const handleStartQuiz = () => {
    setQuizMode("quiz");
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setUserTextAnswer("");
    setIsAnswered(false);
    setScore(0);
    setQuizComplete(false);
    setUserAnswers({});
    setUserTextAnswers({});
    setUserEssayEvaluations({});
  };

  const handleViewQuestions = () => {
    setQuizMode("view");
  };

  const handleExportPDF = async () => {
    try {
      const hasArabic = /[\u0600-\u06FF]/.test(
        questions.map(q => q.text + (q.options?.join(" ") || "")).join(" ") + title
      );
      const dir = hasArabic ? "rtl" : "ltr";
      const textAlign = hasArabic ? "right" : "left";

      // Define colors based on the site's theme
      const primaryColor = "#8B5CF6"; // hsl(250 84% 65%)
      const darkTextColor = "#0A0A0B"; // hsl(240 10% 3.9%)
      const mutedForeground = "#6B7280"; // hsl(240 4% 46%)
      const cardBackground = "#FFFFFF"; // hsl(0 0% 100%)
      const secondaryBackground = "#F4F4F5"; // hsl(240 5% 96%)
      const borderColor = "#E4E4E7"; // hsl(240 6% 90%)
      const correctColor = "#10B981"; // Green for correct answers
      const incorrectColor = "#EF4444"; // Red for incorrect answers

      // Build questions HTML
      const questionsHTML = questions.map((q, qIndex) => {
        const userAnswer = userAnswers[qIndex];
        const isCorrect = userAnswer === q.correctIndex;

        const optionsHTML = (q.options || []).map((option, optIndex) => {
          const isCorrectOption = optIndex === q.correctIndex;
          const isUserOption = userAnswer === optIndex;

          let optionStyle = `padding: 10px; margin-bottom: 8px; border-radius: 8px; border: 2px solid ${borderColor}; background-color: ${cardBackground};`;
          let optionLabel = "";

          if (isCorrectOption) {
            optionStyle += ` border-color: ${correctColor}; background-color: #ECFDF5;`;
            optionLabel = `<span style="color: ${correctColor}; font-weight: bold; margin-${hasArabic ? "right" : "left"}: 8px;">✓ ${language === "ar" ? "صحيح" : "Correct"}</span>`;
          }

          if (isUserOption && !isCorrectOption) {
            optionStyle += ` border-color: ${incorrectColor}; background-color: #FEF2F2;`;
            optionLabel = `<span style="color: ${incorrectColor}; font-weight: bold; margin-${hasArabic ? "right" : "left"}: 8px;">✗ ${language === "ar" ? "إجابتك" : "Your Answer"}</span>`;
          }

          if (isUserOption && isCorrectOption) {
            optionLabel = `<span style="color: ${correctColor}; font-weight: bold; margin-${hasArabic ? "right" : "left"}: 8px;">✓ ${language === "ar" ? "إجابتك - صحيح" : "Your Answer - Correct"}</span>`;
          }

          const optionLetter = String.fromCharCode(65 + optIndex);

          return `
            <div style="${optionStyle}">
              <div style="display: flex; justify-content: space-between; align-items: center; direction: ${dir};">
                <span style="color: ${darkTextColor};">
                  <strong style="color: ${primaryColor};">${optionLetter}.</strong> ${option}
                </span>
                ${optionLabel}
              </div>
            </div>
          `;
        }).join("");

        let textAnswerHTML = "";
        if (q.type === "open_ended" && userTextAnswers[qIndex]) {
          const evalData = userEssayEvaluations[qIndex];
          textAnswerHTML = `
            <div style="margin-top: 10px; padding: 10px; border: 1px dashed ${primaryColor}; border-radius: 6px;">
              <p style="font-size: 13px; color: ${darkTextColor}; margin-bottom: 5px;"><strong>${language === "ar" ? "إجابتك:" : "Your Answer:"}</strong></p>
              <p style="font-size: 13px; font-style: italic; margin-bottom: 10px;">${userTextAnswers[qIndex]}</p>
              ${evalData ? `
                <div style="margin-top: 10px; padding: 10px; background-color: ${evalData.isCorrect ? '#ECFDF5' : '#FEF2F2'}; border-radius: 4px; border-${hasArabic ? 'right' : 'left'}: 3px solid ${evalData.isCorrect ? correctColor : incorrectColor};">
                  <p style="font-size: 12px; font-weight: bold; color: ${evalData.isCorrect ? correctColor : incorrectColor}; margin-bottom: 5px;">
                    ${evalData.isCorrect ? (language === "ar" ? "إجابة مقبولة" : "Correct Answer") : (language === "ar" ? "تحتاج لتحسين" : "Needs Improvement")} 
                    (${evalData.similarityScore}%)
                  </p>
                  <p style="font-size: 12px; color: ${darkTextColor}; margin-bottom: 5px;"><strong>${language === "ar" ? "التقييم:" : "Feedback:"}</strong> ${evalData.feedback}</p>
                  <p style="font-size: 12px; color: ${darkTextColor};"><strong>${language === "ar" ? "الإجابة النموذجية:" : "Model Answer:"}</strong> ${evalData.correctAnswer}</p>
                </div>
              ` : ''}
            </div>
          `;
        }

        const referenceHTML = q.reference ? `
          <div style="margin-top: 10px; font-size: 12px; color: ${mutedForeground};">
            <strong>${language === "ar" ? "المصدر:" : "Source:"}</strong> ${q.reference.concept} (${q.reference.location})
          </div>
        ` : "";

        return `
          <div style="margin-bottom: 25px; page-break-inside: avoid; padding: 15px; background-color: ${secondaryBackground}; border-radius: 8px; border-${hasArabic ? "right" : "left"}: 4px solid ${primaryColor};">
            <h3 style="font-size: 16px; font-weight: bold; color: ${primaryColor}; margin-bottom: 12px; text-align: ${textAlign};">
              ${language === "ar" ? "سؤال" : "Question"} ${qIndex + 1}
            </h3>
            <p style="font-size: 14px; color: ${darkTextColor}; margin-bottom: 12px; text-align: ${textAlign}; line-height: 1.8;">
              ${q.text}
            </p>
            <div style="margin-top: 12px;">
              ${optionsHTML}
              ${textAnswerHTML}
              ${referenceHTML}
            </div>
          </div>
        `;
      }).join("");

      // Score summary (only if quiz was taken)
      const scoreHTML = Object.keys(userAnswers).length > 0 ? `
        <div style="margin-bottom: 20px; padding: 15px; background-color: ${secondaryBackground}; border-radius: 8px; border-${hasArabic ? "right" : "left"}: 4px solid ${primaryColor};">
          <p style="font-size: 14px; color: ${darkTextColor}; text-align: ${textAlign};">
            <strong style="color: ${primaryColor};">${language === "ar" ? "النتيجة:" : "Score:"}</strong>
            <span style="margin-${hasArabic ? "right" : "left"}: 8px;">${score} ${language === "ar" ? "من" : "out of"} ${questions.length}</span>
          </p>
        </div>
      ` : "";

      const htmlContent = `
        <div style="font-family: 'Tajawal', Arial, sans-serif; direction: ${dir}; color: ${darkTextColor}; line-height: 1.8; padding: 20px; background-color: ${cardBackground}; border: 1px solid ${borderColor};">
          <div style="text-align: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 3px solid ${primaryColor};">
            <h1 style="font-size: 24px; font-weight: bold; color: ${primaryColor}; margin: 0;">
              ${title}
            </h1>
            <p style="font-size: 12px; color: ${mutedForeground}; margin-top: 10px;">
              ${language === "ar" ? "تم التصدير بواسطة LectureMate" : "Exported by LectureMate"} • ${new Date().toLocaleDateString(language === "ar" ? "ar-EG" : "en-US")}
            </p>
          </div>
          
          ${scoreHTML}
          
          <div style="margin-bottom: 20px;">
            <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px; margin-bottom: 15px; text-align: ${textAlign};">
              ${language === "ar" ? "📝 الأسئلة والإجابات" : "📝 Questions and Answers"}
            </h2>
            ${questionsHTML}
          </div>
          
          <div style="margin-top: 30px; padding-top: 15px; border-top: 2px solid ${borderColor}; text-align: center;">
            <p style="font-size: 9px; color: ${mutedForeground};">
              ${language === "ar" ? "© 2025 LectureMate. جميع الحقوق محفوظة. هذا المستند محمي بحقوق النشر ولا يجوز نسخه أو توزيعه دون إذن." : "© 2025 LectureMate. All rights reserved. This document is protected by copyright and may not be copied or distributed without permission."}
            </p>
          </div>
        </div>
      `;

      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "210mm"; // A4 width
      container.style.padding = "15mm";
      container.style.backgroundColor = "white";
      container.style.fontFamily = hasArabic ? "Tajawal, Arial, sans-serif" : "Arial, sans-serif";
      document.body.appendChild(container);

      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 794,
        windowHeight: container.scrollHeight,
      });

      document.body.removeChild(container);

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      const pdf = new jsPDF("p", "mm", "a4");
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `${title.replace(/[^a-z0-9\u0600-\u06FF]/gi, "_")}_quiz.pdf`;
      pdf.save(filename);

      toast({
        title: t.toast.exported,
        description: t.toast.exportedDesc,
      });
    } catch (error) {
      console.error("Error exporting quiz PDF:", error);
      toast({
        title: t.toast.exportFailed,
        description: t.toast.exportFailedDesc,
        variant: "destructive",
      });
    }
  };

  const handleGenerate = async (mode: "comprehensive" | "advanced" | "expert" = "comprehensive") => {
    if (!lectureId || !transcript) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: language === "ar" ? "معلومات المحاضرة غير متوفرة" : "Lecture information is missing",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsGenerating(true);
      // Pass the selected mode to generateQuiz
      const newQuestions = await generateQuiz(transcript, modelType, mode);

      // Update local state immediately to show the "Start Quiz" button
      if (newQuestions && newQuestions.length > 0) {
        setQuestions(newQuestions);
        setQuizReadyToStart(true);
      }

      await updateLecture({
        lectureId,
        updates: { questions: newQuestions as any }
      });

      toast({
        title: language === "ar" ? "تم بنجاح" : "Success",
        description: language === "ar" ? "تم إنشاء الأسئلة بنجاح" : "Questions generated successfully",
      });
    } catch (error: any) {
      console.error("Error generating quiz:", error);
      toast({
        title: language === "ar" ? "فشل الإنشاء" : "Generation Failed",
        description: error.message || "Something went wrong",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Menu screen - choose mode
  if (quizMode === "menu") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center py-12 text-center space-y-10 max-w-5xl mx-auto px-4"
        dir={uiDir}
        key={`quiz-menu-${language}-${detectContentLanguage}`}
      >
        <motion.div
          // ... (Same header logic)
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="space-y-4"
        >
          <div className="relative inline-block">
            <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
              {language === "ar" ? "اختر مستوى الصعوبة" : "Select Difficulty Level"}
            </h2>
            <div className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          </div>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            {language === "ar" ? "حدد المستوى الذي يناسبك لبدء الاختبار (30 سؤال)" : "Choose the level that suits you to start the quiz (30 Questions)"}
          </p>
        </motion.div>

        {/* Existing Quiz Actions - Only show after manual generation */}
        {quizReadyToStart && questions.length > 0 && (
          <div className="w-full max-w-3xl mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    {language === "ar" ? "الاختبار الحالي جاهز" : "Current Quiz Ready"}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {questions.length} {language === "ar" ? "سؤال" : "Questions"}
                  </p>
                </div>
                <Badge variant="outline" className="px-3 py-1 bg-background">
                  {questions[0]?.type === "multiple_choice" ? "Mixed Format" : "Standard"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button onClick={handleStartQuiz} size="lg" className="gap-2 shadow-lg shadow-primary/20">
                  {t.startQuiz} <ArrowRight className="w-4 h-4" />
                </Button>
                <Button onClick={handleViewQuestions} size="lg" variant="outline" className="gap-2 bg-background/50">
                  <Eye className="w-4 h-4" /> {t.viewQuestions}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="w-full text-center mb-8">
          <h3 className="text-lg font-medium text-muted-foreground/80 uppercase tracking-widest">
            {questions.length > 0 ? (language === "ar" ? "أو أنشئ اختباراً جديداً" : "OR CREATE NEW QUIZ") : ""}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Model 1: Comprehensive (Green) */}
          <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/10 hover:shadow-lg hover:border-green-400 transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
                <BookOpen className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl font-bold text-green-700 dark:text-green-300">
                {language === "ar" ? "المستوى 1: أساسي/شامل" : "Level 1: Standard"}
              </CardTitle>
              <div className="flex gap-1 justify-center mt-2">
                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-[10px]">{language === "ar" ? "سهل" : "Easy"}</Badge>
                <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]">{language === "ar" ? "متوسط" : "Medium"}</Badge>
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">{language === "ar" ? "صعب" : "Hard"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-green-800/80 dark:text-green-200/80">
              {language === "ar" ? "تركيز على الأساسيات والمفاهيم العامة (سهل ومتوسط)." : "Focus on basics and general concepts (Easy to Medium)."}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-white text-green-700 border border-green-200 hover:bg-green-50 hover:border-green-300 shadow-sm"
                onClick={() => handleGenerate("comprehensive")}
                disabled={isGenerating}
              >
                {isGenerating ? <RotateCcw className="w-4 h-4 animate-spin" /> : (language === "ar" ? "إنشاء الاختبار" : "Generate Quiz")}
              </Button>
            </CardFooter>
          </Card>

          {/* Model 2: Advanced (Orange) */}
          <Card className="border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/10 hover:shadow-lg hover:border-orange-400 transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center mb-2">
                <Sparkles className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <CardTitle className="text-xl font-bold text-orange-700 dark:text-orange-300">
                {language === "ar" ? "المستوى 2: متوسط/متقدم" : "Level 2: Intermediate"}
              </CardTitle>
              <div className="flex gap-1 justify-center mt-2">
                <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]">{language === "ar" ? "متوسط" : "Medium"}</Badge>
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">{language === "ar" ? "صعب" : "Hard"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-orange-800/80 dark:text-orange-200/80">
              {language === "ar" ? "تركيز على التفكير التحليلي وتطبيق المفاهيم." : "Focus on analytical thinking and application."}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-white text-orange-700 border border-orange-200 hover:bg-orange-50 hover:border-orange-300 shadow-sm"
                onClick={() => handleGenerate("advanced")}
                disabled={isGenerating}
              >
                {isGenerating ? <RotateCcw className="w-4 h-4 animate-spin" /> : (language === "ar" ? "إنشاء الاختبار" : "Generate Quiz")}
              </Button>
            </CardFooter>
          </Card>

          {/* Model 3: Expert (Red) */}
          <Card className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10 hover:shadow-lg hover:border-red-400 transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mb-2">
                <Target className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-xl font-bold text-red-700 dark:text-red-300">
                {language === "ar" ? "المستوى 3: خبير/صعب" : "Level 3: Expert"}
              </CardTitle>
              <div className="flex gap-1 justify-center mt-2">
                <Badge variant="destructive" className="bg-red-600 text-[10px]">{language === "ar" ? "صعب جداً" : "Very Hard"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-red-800/80 dark:text-red-200/80">
              {language === "ar" ? "للمحترفين فقط. أسئلة نقدية ومعقدة." : "For experts only. Critical and complex questions."}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-white text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-300 shadow-sm"
                onClick={() => handleGenerate("expert")}
                disabled={isGenerating}
              >
                {isGenerating ? <RotateCcw className="w-4 h-4 animate-spin" /> : (language === "ar" ? "إنشاء الاختبار" : "Generate Quiz")}
              </Button>
            </CardFooter>
          </Card>

        </div>
      </motion.div>
    );
  }

  // Quiz complete screen
  if (quizComplete && quizMode === "quiz") {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center space-y-6"
        dir={uiDir}
        key={`quiz-complete-${language}-${detectContentLanguage}`}
      >
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <CheckCircle className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-3xl font-bold">{t.complete}</h2>
        <p className="text-xl text-muted-foreground">
          {t.scored} <span className="font-bold text-foreground">{score}</span> {t.outOf} <span className="font-bold text-foreground">{questions.length}</span>
        </p>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => setQuizMode("review")} size="lg" variant="outline">
            <Eye className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.reviewAnswers}
          </Button>
          <Button onClick={handleExportPDF} size="lg" variant="outline">
            <Download className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.exportPDF}
          </Button>
          <Button onClick={handleRestart} size="lg">
            <RotateCcw className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.retake}
          </Button>
        </div>
      </div>
    );
  }

  // View mode - show all questions with correct answers (no user answers)
  if (quizMode === "view") {
    return (
      <div
        className="max-w-4xl mx-auto mt-8 space-y-6"
        dir={uiDir}
        key={`quiz-view-${language}-${detectContentLanguage}`}
      >
        <div className={`flex items-center justify-between mb-6 ${language === "ar" ? "flex-row-reverse" : ""}`}>
          <div>
            <h2 className="text-2xl font-bold">{t.viewQuestions}</h2>
            <p className="text-muted-foreground mt-1">
              {language === "ar" ? "جميع الأسئلة مع الإجابات الصحيحة" : "All questions with correct answers"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExportPDF} variant="outline">
              <Download className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
              {t.exportPDF}
            </Button>
            <Button onClick={() => setQuizMode("menu")} variant="outline">
              {t.backToMenu}
            </Button>
          </div>
        </div>

        {questions.map((q, qIndex) => (
          <Card key={qIndex} className="border-2">
            <CardHeader>
              <CardTitle
                className="text-lg flex items-center gap-2"
                dir={contentDir}
                style={{ textAlign: contentTextAlign }}
              >
                <span className="text-primary font-bold">{qIndex + 1}.</span>
                <span className="break-words">{q.text}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {q.options && q.options.length > 0 ? (
                <div className="space-y-2">
                  {q.options.map((option, optIndex) => {
                    const isCorrectOption = optIndex === q.correctIndex;

                    let optionStyle = "border p-3 rounded-lg";
                    if (isCorrectOption) {
                      optionStyle += " border-green-500 bg-green-50/50 dark:bg-green-900/20";
                    } else {
                      optionStyle += " border opacity-50";
                    }

                    return (
                      <div
                        key={optIndex}
                        className={cn(optionStyle, "flex items-center justify-between")}
                        dir={contentDir}
                      >
                        <span className="flex-1 break-words" style={{ textAlign: contentTextAlign }}>
                          <span className={`font-medium ${contentDir === "rtl" ? "ml-2" : "mr-2"}`}>
                            {String.fromCharCode(65 + optIndex)}.
                          </span>
                          {option}
                        </span>
                        {isCorrectOption && (
                          <div className={`flex items-center gap-1 text-green-600 text-sm font-medium ${contentDir === "rtl" ? "flex-row-reverse" : ""}`}>
                            <CheckCircle className="w-4 h-4" />
                            <span>{t.correctAnswer}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-muted/30 rounded-lg border border-dashed text-sm italic text-muted-foreground text-center">
                  {detectContentLanguage === "ar" ? "سؤال مقالي - لا توجد خيارات" : "Open-ended question - No options"}
                </div>
              )}

              <ReferenceBadge reference={q.reference} />
            </CardContent>
          </Card>
        ))}

        {/* Start Quiz button at the end */}
        <div className="flex justify-center pt-6 border-t">
          <Button onClick={handleStartQuiz} size="lg" className="min-w-[200px]">
            <HelpCircle className={`w-5 h-5 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.startQuiz}
          </Button>
        </div>
      </div>
    );
  }

  // Review mode - show all questions with user answers vs correct answers
  if (quizMode === "review") {
    return (
      <div
        className="max-w-4xl mx-auto mt-8 space-y-6"
        dir={uiDir}
        key={`quiz-review-${language}-${detectContentLanguage}`}
      >
        <div className={`flex items-center justify-between mb-6 ${language === "ar" ? "flex-row-reverse" : ""}`}>
          <div>
            <h2 className="text-2xl font-bold">{t.reviewAnswers}</h2>
            <p className="text-muted-foreground mt-1">
              {t.scored} <span className="font-bold">{score}</span> {t.outOf} <span className="font-bold">{questions.length}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExportPDF} variant="outline">
              <Download className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
              {t.exportPDF}
            </Button>
            <Button onClick={() => setQuizMode("menu")} variant="outline">
              {t.backToMenu}
            </Button>
          </div>
        </div>

        {questions.map((q, qIndex) => {
          const userAnswer = userAnswers[qIndex];
          const isCorrect = userAnswer === q.correctIndex;

          return (
            <Card key={qIndex} className="border-2">
              <CardHeader>
                <CardTitle
                  className="text-lg flex items-center gap-2"
                  dir={contentDir}
                  style={{ textAlign: contentTextAlign }}
                >
                  <span className="text-primary font-bold">{qIndex + 1}.</span>
                  <span className="break-words">{q.text}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {q.options && q.options.length > 0 ? (
                  <div className="space-y-2">
                    {q.options.map((option, optIndex) => {
                      const isCorrectOption = optIndex === q.correctIndex;
                      const isUserOption = userAnswer === optIndex;

                      let optionStyle = "border p-3 rounded-lg";
                      if (isCorrectOption) {
                        optionStyle += " border-green-500 bg-green-50/50 dark:bg-green-900/20";
                      } else if (isUserOption && !isCorrectOption) {
                        optionStyle += " border-red-500 bg-red-50/50 dark:bg-red-900/20";
                      } else {
                        optionStyle += " border opacity-50";
                      }

                      return (
                        <div
                          key={optIndex}
                          className={cn(optionStyle, "flex items-center justify-between")}
                          dir={contentDir}
                        >
                          <span className="flex-1 break-words" style={{ textAlign: contentTextAlign }}>
                            <span className={`font-medium ${contentDir === "rtl" ? "ml-2" : "mr-2"}`}>
                              {String.fromCharCode(65 + optIndex)}.
                            </span>
                            {option}
                          </span>
                          <div className={`flex items-center gap-2 ${contentDir === "rtl" ? "flex-row-reverse" : ""}`}>
                            {isCorrectOption && (
                              <div className={`flex items-center gap-1 text-green-600 text-sm font-medium ${contentDir === "rtl" ? "flex-row-reverse" : ""}`}>
                                <CheckCircle className="w-4 h-4" />
                                <span>{t.correctAnswer}</span>
                              </div>
                            )}
                            {isUserOption && (
                              <div className={cn(
                                "flex items-center gap-1 text-sm font-medium",
                                isCorrect ? "text-green-600" : "text-red-600",
                                contentDir === "rtl" ? "flex-row-reverse" : ""
                              )}>
                                {isCorrect ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                <span>{t.yourAnswer}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <p className="text-sm font-medium">{detectContentLanguage === "ar" ? "إجابتك المكتوبة:" : "Your written answer:"}</p>
                      <div className="p-4 bg-muted/30 rounded-lg border whitespace-pre-wrap">
                        {userTextAnswers[qIndex] || (detectContentLanguage === "ar" ? "لا توجد إجابة" : "No answer provided")}
                      </div>
                    </div>

                    {userEssayEvaluations[qIndex] && (() => {
                      const evaluation = userEssayEvaluations[qIndex];
                      const isSuccess = evaluation.isCorrect;
                      return (
                        <div className={cn(
                          "p-4 rounded-lg border flex flex-col gap-3",
                          isSuccess ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-900",
                        )} dir={contentDir} style={{ textAlign: contentTextAlign }}>
                          <div className={cn("flex items-center gap-3", contentDir === "rtl" ? "flex-row-reverse" : "")}>
                            {isSuccess ? <CheckCircle className="w-6 h-6 shrink-0 text-green-600" /> : <XCircle className="w-6 h-6 shrink-0 text-red-600" />}
                            <div>
                              <p className="font-bold text-lg">
                                {isSuccess
                                  ? (detectContentLanguage === "ar" ? "إجابة مقبولة! (" + evaluation.similarityScore + "% تطابق)" : "Correct Answer! (" + evaluation.similarityScore + "% Match)")
                                  : (detectContentLanguage === "ar" ? "إجابة تحتاج لتحسين (" + evaluation.similarityScore + "% تطابق)" : "Needs Improvement (" + evaluation.similarityScore + "% Match)")}
                              </p>
                            </div>
                          </div>

                          <div className="text-sm opacity-90 mt-2 bg-white/50 p-3 rounded-md">
                            <p className="font-semibold mb-1 w-full flex items-center gap-1">
                              <Sparkles className="w-4 h-4" />
                              {detectContentLanguage === "ar" ? "التقييم والتحليل:" : "AI Feedback:"}
                            </p>
                            <p>{evaluation.feedback}</p>
                          </div>

                          <div className="text-sm opacity-90 bg-white/50 p-3 rounded-md">
                            <p className="font-semibold mb-1 text-primary w-full flex items-center gap-1">
                              <BookOpen className="w-4 h-4" />
                              {detectContentLanguage === "ar" ? "الإجابة النموذجية:" : "Model Answer:"}
                            </p>
                            <p>{evaluation.correctAnswer}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <ReferenceBadge reference={q.reference} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Quiz mode - active quiz
  if (quizMode === "quiz") {
    if (!currentQuestion) return <div dir={uiDir}>{t.noQuestions}</div>;

    return (
      <div
        className="max-w-2xl mx-auto mt-8 pb-12"
        dir={uiDir}
        key={`quiz-active-${language}-${detectContentLanguage}`}
      >
        <div className={`flex justify-between items-center mb-6 ${language === "ar" ? "flex-row-reverse" : ""}`}>
          <div className="flex items-center gap-4">
            <Button onClick={() => setQuizMode("menu")} variant="ghost" size="sm">
              <ArrowRight className={`w-4 h-4 ${language === "ar" ? "ml-1 rotate-180" : "mr-1"}`} />
              {t.backToMenu}
            </Button>
            <div className="text-sm font-medium text-muted-foreground">
              <span>{t.question} {currentQuestionIndex + 1} {t.outOf} {questions.length}</span>
            </div>
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            <span>{t.score}: {score}</span>
          </div>
        </div>

        <Card className="border-2 shadow-sm overflow-hidden border-primary/20">
          <CardHeader className="bg-primary/5 pb-6">
            <div className={`flex items-center justify-between gap-2 mb-2 ${contentDir === "rtl" ? "flex-row-reverse" : ""}`}>
              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider px-1.5 h-5">
                {currentQuestion.type === "open_ended"
                  ? (detectContentLanguage === "ar" ? "سؤال مقالي" : "OPEN ENDED")
                  : (detectContentLanguage === "ar" ? "خيار من متعدد" : "MULTIPLE CHOICE")}
              </Badge>
              {timeLeft !== null && (
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold shadow-sm transition-colors",
                  timeLeft <= 10 ? "bg-red-100 text-red-700 animate-pulse" : "bg-primary/10 text-primary",
                  contentDir === "rtl" ? "flex-row-reverse" : ""
                )}>
                  <Timer className="w-4 h-4" />
                  <span className="w-5 text-center">{timeLeft}</span>
                </div>
              )}
            </div>
            <CardTitle
              className="text-xl leading-relaxed break-words"
              dir={contentDir}
              style={{ textAlign: contentTextAlign }}
            >
              {currentQuestion.text}
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            {currentQuestion.type === "open_ended" ? (
              <div className="space-y-4">
                <Textarea
                  placeholder={detectContentLanguage === "ar" ? "اكتب إجابتك هنا في حدود سطرين أو أكثر..." : "Type your answer here in detail..."}
                  className="min-h-[120px] resize-none text-base leading-relaxed p-4 focus-visible:ring-primary"
                  value={userTextAnswer}
                  onChange={(e) => setUserTextAnswer(e.target.value)}
                  disabled={isAnswered}
                  dir={contentDir}
                  style={{ textAlign: contentTextAlign }}
                />

                {isAnswered && userEssayEvaluations[currentQuestionIndex] && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-4"
                  >
                    {(() => {
                      const evaluation = userEssayEvaluations[currentQuestionIndex];
                      const isSuccess = evaluation.isCorrect;

                      return (
                        <div className={cn(
                          "p-4 rounded-lg border flex flex-col gap-3",
                          isSuccess ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-900",
                        )} dir={contentDir} style={{ textAlign: contentTextAlign }}>
                          <div className={cn("flex items-center gap-3", contentDir === "rtl" ? "flex-row-reverse" : "")}>
                            {isSuccess ? <CheckCircle className="w-6 h-6 shrink-0 text-green-600" /> : <XCircle className="w-6 h-6 shrink-0 text-red-600" />}
                            <div>
                              <p className="font-bold text-lg">
                                {isSuccess
                                  ? (detectContentLanguage === "ar" ? "إجابة مقبولة! (" + evaluation.similarityScore + "% تطابق)" : "Correct Answer! (" + evaluation.similarityScore + "% Match)")
                                  : (detectContentLanguage === "ar" ? "إجابة تحتاج لتحسين (" + evaluation.similarityScore + "% تطابق)" : "Needs Improvement (" + evaluation.similarityScore + "% Match)")}
                              </p>
                            </div>
                          </div>

                          <div className="text-sm opacity-90 mt-2 bg-white/50 p-3 rounded-md">
                            <p className="font-semibold mb-1 w-full flex items-center gap-1">
                              <Sparkles className="w-4 h-4" />
                              {detectContentLanguage === "ar" ? "التقييم والتحليل:" : "AI Feedback:"}
                            </p>
                            <p>{evaluation.feedback}</p>
                          </div>

                          <div className="text-sm opacity-90 bg-white/50 p-3 rounded-md">
                            <p className="font-semibold mb-1 text-primary w-full flex items-center gap-1">
                              <BookOpen className="w-4 h-4" />
                              {detectContentLanguage === "ar" ? "الإجابة النموذجية:" : "Model Answer:"}
                            </p>
                            <p>{evaluation.correctAnswer}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {currentQuestion.options?.map((option, index) => {
                  let optionStyle = "border hover:bg-accent hover:text-accent-foreground cursor-pointer transition-all duration-200";

                  if (isAnswered) {
                    if (index === currentQuestion.correctIndex) {
                      optionStyle = "border-green-500 bg-green-50 text-green-700 font-medium";
                    } else if (index === selectedOption) {
                      optionStyle = "border-red-500 bg-red-50 text-red-700";
                    } else {
                      optionStyle = "border opacity-50";
                    }
                  } else if (selectedOption === index) {
                    optionStyle = "border-primary bg-primary/5 ring-1 ring-primary";
                  }

                  return (
                    <div
                      key={index}
                      onClick={() => handleOptionSelect(index)}
                      className={cn(
                        "p-4 rounded-xl flex items-center justify-between group",
                        optionStyle
                      )}
                      dir={contentDir}
                    >
                      <span className="flex-1 break-words" style={{ textAlign: contentTextAlign }}>
                        <span className={`font-bold ${contentDir === "rtl" ? "ml-3 text-primary" : "mr-3 text-primary"}`}>
                          {String.fromCharCode(65 + index)}.
                        </span>
                        {option}
                      </span>
                      <div className={`flex items-center ${contentDir === "rtl" ? "flex-row-reverse" : ""}`}>
                        {isAnswered && index === currentQuestion.correctIndex && (
                          <div className="bg-green-100 p-1 rounded-full"><CheckCircle className="w-5 h-5 text-green-600" /></div>
                        )}
                        {isAnswered && index === selectedOption && index !== currentQuestion.correctIndex && (
                          <div className="bg-red-100 p-1 rounded-full"><XCircle className="w-5 h-5 text-red-600" /></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isAnswered && <ReferenceBadge reference={currentQuestion.reference} />}
          </CardContent>

          <CardFooter className={`pt-2 pb-6 px-6 ${uiDir === "rtl" ? "justify-start" : "justify-end"}`}>
            {!isAnswered ? (
              <Button
                onClick={handleSubmit}
                disabled={(currentQuestion.type === "open_ended" ? !userTextAnswer.trim() : selectedOption === null) || isEvaluating}
                className="min-w-[140px] shadow-md hover:shadow-lg transition-all"
                size="lg"
              >
                {isEvaluating ? <RotateCcw className="w-4 h-4 animate-spin mr-2" /> : null}
                {isEvaluating ? (language === "ar" ? "جاري التقييم..." : "Evaluating...") : t.checkAnswer}
              </Button>
            ) : (
              <Button onClick={handleNext} className="min-w-[140px] shadow-md hover:shadow-lg transition-all" size="lg">
                {currentQuestionIndex === questions.length - 1 ? t.finishQuiz : t.nextQuestion}
                <ArrowRight className={`w-4 h-4 ${uiDir === "rtl" ? "mr-2 rotate-180" : "ml-2"}`} />
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  }

  return null;
}
