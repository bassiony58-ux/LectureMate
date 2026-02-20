import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowRight } from "lucide-react";

export function FeatureShowcase() {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();
  
  const features = [
    {
      title: language === "ar" ? "محاضرة إلى بطاقات تعليمية" : "Lecture to Flashcards",
      description: language === "ar" 
        ? "أنشئ بطاقات تعليمية فوراً للتعلم المتباعد."
        : "Instantly generate study cards for spaced repetition.",
      gradient: "from-blue-500/20 via-cyan-500/20 to-blue-600/20",
      border: "border-blue-500/20",
      hoverBorder: "hover:border-blue-500/50",
      icon: "🗂️",
      link: "/lecture/1"
    },
    {
      title: language === "ar" ? "محادثة مع الفيديو" : "Chat with Video",
      description: language === "ar"
        ? "اطرح الأسئلة واحصل على إجابات مباشرة من محتوى المحاضرة."
        : "Ask questions and get answers directly from the lecture content.",
      gradient: "from-violet-500/20 via-purple-500/20 to-violet-600/20",
      border: "border-violet-500/20",
      hoverBorder: "hover:border-violet-500/50",
      icon: "💬",
      link: "/lecture/1"
    },
    {
      title: language === "ar" ? "مولد الاختبارات الذكي" : "Smart Quiz Gen",
      description: language === "ar"
        ? "اختبر معرفتك بأسئلة متعددة الخيارات منشأة بالذكاء الاصطناعي."
        : "Test your knowledge with AI-generated multiple choice questions.",
      gradient: "from-amber-500/20 via-orange-500/20 to-amber-600/20",
      border: "border-amber-500/20",
      hoverBorder: "hover:border-amber-500/50",
      icon: "📝",
      link: "/lecture/1"
    }
  ];

  return (
    <motion.section 
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="py-16"
    >
      <motion.h2 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-3xl md:text-4xl font-bold mb-12 text-center bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
      >
        {language === "ar" ? "أدوات تعليمية قوية" : "Powerful Learning Tools"}
      </motion.h2>
      <div className="grid md:grid-cols-3 gap-6 md:gap-8">
        {features.map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.15 }}
            whileHover={{ y: -8, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setLocation(feature.link)}
            className="cursor-pointer group"
          >
            <Card className={cn(
              "h-full overflow-hidden border-2 transition-all duration-300 shadow-lg hover:shadow-xl",
              feature.border,
              feature.hoverBorder
            )}>
              <motion.div 
                className={cn("h-32 bg-gradient-to-br flex items-center justify-center text-5xl relative overflow-hidden", feature.gradient)}
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  animate={{ 
                    rotate: [0, 5, -5, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 3,
                    repeat: Infinity,
                    repeatDelay: 2
                  }}
                  className="text-6xl"
                >
                  {feature.icon}
                </motion.div>
                <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.div>
              <CardContent className="p-6">
                <h3 className="font-bold text-xl mb-3 text-foreground group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  {feature.description}
                </p>
                <motion.div
                  initial={{ opacity: 0, x: language === "ar" ? 10 : -10 }}
                  whileHover={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-primary font-semibold text-sm"
                >
                  <span>{language === "ar" ? "اكتشف المزيد" : "Learn more"}</span>
                  <ArrowRight className={`w-4 h-4 ${language === "ar" ? "rotate-180" : ""}`} />
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
