import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";

interface Flashcard {
  id: number;
  term: string;
  definition: string;
}

interface FlashcardsViewProps {
  flashcards?: Flashcard[];
}

export function FlashcardsView({ flashcards = [] }: FlashcardsViewProps) {
  const { language } = useLanguage();

  // Detect language from flashcards content
  const detectContentLanguage = useMemo(() => {
    if (!flashcards || flashcards.length === 0) return language;
    
    // Check if any flashcard contains Arabic text
    const allText = flashcards
      .map(card => `${card.term} ${card.definition}`)
      .join(" ");
    const hasArabic = /[\u0600-\u06FF]/.test(allText);
    
    // Use content language if detected, otherwise use UI language
    return hasArabic ? "ar" : language;
  }, [flashcards, language]);

  // Set content direction and text alignment based on detected language
  const contentDir = detectContentLanguage === "ar" ? "rtl" : "ltr";
  const displayTextAlign = detectContentLanguage === "ar" ? "right" : "left";
  
  // Use UI language for UI elements
  const uiDir = language === "ar" ? "rtl" : "ltr";

  const t = {
    studyFlashcards: language === "ar" ? "بطاقات الدراسة" : "Study Flashcards",
    noFlashcards: language === "ar" ? "لا توجد بطاقات متاحة" : "No flashcards available",
    noFlashcardsDesc: language === "ar" 
      ? "قم بإنشاء بطاقات من نص المحاضرة للبدء في الدراسة." 
      : "Generate flashcards from the lecture transcript to start studying.",
    term: language === "ar" ? "المصطلح" : "Term",
    definition: language === "ar" ? "التعريف" : "Definition",
    hoverToFlip: language === "ar" ? "مرر الماوس للقلب" : "Hover to flip",
    card: language === "ar" ? "بطاقة" : "Card",
    cards: language === "ar" ? "بطاقات" : "Cards",
  };

  if (!flashcards || flashcards.length === 0) {
    return (
      <div className="space-y-6">
        <div className={`flex items-center justify-between ${language === "ar" ? "flex-row-reverse" : ""}`}>
          <h3 className={`text-lg font-semibold flex items-center gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}>
            <Brain className="w-5 h-5 text-primary" />
            {t.studyFlashcards}
          </h3>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t.noFlashcards}</EmptyTitle>
            <EmptyDescription>{t.noFlashcardsDesc}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6" key={`flashcards-${language}-${detectContentLanguage}`}>
      <div className={`flex items-center justify-between ${language === "ar" ? "flex-row-reverse" : ""}`}>
        <h3 className={`text-lg font-semibold flex items-center gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}>
          <Brain className="w-5 h-5 text-primary" />
          {t.studyFlashcards}
        </h3>
        <Badge variant="outline" className="bg-primary/5 shrink-0">
          {flashcards.length} {flashcards.length === 1 ? t.card : t.cards}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {flashcards.map((card, index) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="group h-48 w-full [perspective:1000px]"
          >
            <div className="relative h-full w-full rounded-xl shadow-sm transition-all duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
              {/* Front */}
              <div 
                className="absolute inset-0 h-full w-full rounded-xl bg-card border-2 flex flex-col items-center justify-center p-6 text-center [backface-visibility:hidden]"
                dir={contentDir}
                style={{ textAlign: displayTextAlign }}
              >
                <span className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {t.term}
                </span>
                <h4 
                  className="text-xl font-bold break-words px-2"
                  dir={contentDir}
                  style={{ textAlign: displayTextAlign }}
                >
                  {card.term}
                </h4>
                <p className="absolute bottom-4 text-xs text-muted-foreground/50">
                  {t.hoverToFlip}
                </p>
              </div>
              
              {/* Back */}
              <div 
                className="absolute inset-0 h-full w-full rounded-xl bg-primary/5 border-2 border-primary/20 flex flex-col items-center justify-center p-6 text-center [transform:rotateY(180deg)] [backface-visibility:hidden]"
                dir={contentDir}
                style={{ textAlign: displayTextAlign }}
              >
                <span className="text-xs text-primary uppercase tracking-wider mb-2">
                  {t.definition}
                </span>
                <p 
                  className="text-sm leading-relaxed font-medium break-words px-2"
                  dir={contentDir}
                  style={{ textAlign: displayTextAlign }}
                >
                  {card.definition}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
