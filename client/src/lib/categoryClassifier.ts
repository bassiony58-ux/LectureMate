import { Lecture, LectureCategory } from "./mockData";
import { classifyCategory } from "./aiService";

// Category keywords mapping
const categoryKeywords: Record<LectureCategory, string[]> = {
  science: [
    "physics", "chemistry", "biology", "quantum", "molecular", "atoms", "particles",
    "experiment", "research", "laboratory", "scientific", "hypothesis", "theory",
    "فيزياء", "كيمياء", "أحياء", "تجربة", "مختبر", "علمي", "نظرية"
  ],
  technology: [
    "programming", "software", "computer", "algorithm", "code", "development",
    "artificial intelligence", "machine learning", "neural network", "deep learning",
    "coding", "tech", "digital", "software engineering", "web development",
    "ai agent", "ai agents", "autonomous", "agentic", "llm", "large language model",
    "openai", "chatgpt", "gpt", "transformer", "nlp", "natural language processing",
    "robotics", "automation", "intelligent system", "cognitive computing",
    "برمجة", "حاسوب", "ذكاء اصطناعي", "تعلم آلة", "تطوير", "تقنية", "روبوت", "أتمتة"
  ],
  mathematics: [
    "math", "mathematics", "calculus", "algebra", "geometry", "statistics",
    "equation", "formula", "theorem", "proof", "derivative", "integral",
    "رياضيات", "حساب", "جبر", "هندسة", "إحصاء", "معادلة"
  ],
  medicine: [
    "medical", "medicine", "health", "anatomy", "physiology", "surgery",
    "diagnosis", "treatment", "patient", "disease", "clinical", "hospital",
    "طبي", "طب", "صحة", "تشريح", "جراحة", "علاج", "مريض"
  ],
  history: [
    "history", "historical", "ancient", "civilization", "war", "empire",
    "revolution", "medieval", "renaissance", "world war", "timeline",
    "تاريخ", "تاريخي", "قديم", "حضارة", "حرب", "إمبراطورية"
  ],
  art: [
    "art", "painting", "sculpture", "design", "creative", "artist", "gallery",
    "aesthetic", "visual", "artistic", "masterpiece", "exhibition",
    "فن", "رسم", "تصميم", "إبداعي", "فنان", "معرض", "جمالي"
  ],
  language: [
    "language", "linguistics", "grammar", "vocabulary", "translation",
    "literature", "writing", "poetry", "novel", "literary",
    "لغة", "نحو", "أدب", "كتابة", "شعر", "رواية"
  ],
  business: [
    "business", "marketing", "finance", "economics", "management", "strategy",
    "entrepreneurship", "startup", "investment", "corporate", "commerce",
    "أعمال", "تسويق", "مالية", "اقتصاد", "إدارة", "استثمار"
  ],
  education: [
    "education", "teaching", "learning", "pedagogy", "curriculum", "student",
    "academic", "university", "school", "course", "lecture", "study",
    "تعليم", "تدريس", "تعلم", "منهج", "طالب", "جامعة", "مدرسة"
  ],
  other: []
};

/**
 * Classify a lecture into a category using AI (with keyword fallback)
 * This function uses AI for smart classification, falling back to keyword matching if AI fails
 */
export async function classifyLecture(
  lecture: Partial<Lecture>,
  mode?: "gpu" | "api"
): Promise<LectureCategory> {
  // Try AI classification first
  try {
    const summaryText = typeof lecture.summary === "string" 
      ? lecture.summary 
      : Array.isArray(lecture.summary) 
        ? lecture.summary.join(" ") 
        : "";

    const aiCategory = await classifyCategory(
      lecture.title,
      lecture.transcript,
      summaryText,
      mode
    );

    // Validate AI category
    const validCategories: LectureCategory[] = [
      "science",
      "technology",
      "mathematics",
      "medicine",
      "history",
      "art",
      "language",
      "business",
      "education",
      "other",
    ];

    if (validCategories.includes(aiCategory as LectureCategory)) {
      return aiCategory as LectureCategory;
    }
  } catch (error) {
    console.warn("[categoryClassifier] AI classification failed, using keyword fallback:", error);
  }

  // Fallback to keyword-based classification
  return classifyLectureByKeywords(lecture);
}

/**
 * Fallback: Classify a lecture into a category based on keywords
 */
function classifyLectureByKeywords(lecture: Partial<Lecture>): LectureCategory {
  const text = [
    lecture.title || "",
    typeof lecture.summary === "string" ? lecture.summary : lecture.summary?.join(" ") || "",
    lecture.transcript || "",
  ]
    .join(" ")
    .toLowerCase();

  if (!text.trim()) {
    return "other";
  }

  // Count matches for each category
  const categoryScores: Record<LectureCategory, number> = {
    science: 0,
    technology: 0,
    mathematics: 0,
    medicine: 0,
    history: 0,
    art: 0,
    language: 0,
    business: 0,
    education: 0,
    other: 0,
  };

  // Score each category
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (category === "other") continue;
    
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      const matches = text.match(regex);
      if (matches) {
        categoryScores[category as LectureCategory] += matches.length;
      }
    }
  }

  // Find category with highest score
  let maxScore = 0;
  let bestCategory: LectureCategory = "other";

  for (const [category, score] of Object.entries(categoryScores)) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category as LectureCategory;
    }
  }

  // If no strong match, check title for common patterns (but be more conservative)
  if (maxScore === 0) {
    const title = lecture.title?.toLowerCase() || "";
    const transcriptLower = (lecture.transcript || "").toLowerCase();
    
    // Only classify as technology if there's a STRONG indication it's about programming/tech
    // Not just mentioning "ai" or "agent" in passing
    const techKeywords = ["programming", "coding", "software", "computer", "algorithm", "code", "developer", "tech"];
    const hasStrongTechIndication = techKeywords.some(keyword => 
      title.includes(keyword) || transcriptLower.includes(keyword)
    );
    
    if (hasStrongTechIndication) {
      return "technology";
    }
    
    // Check for other specific patterns
    if (title.includes("introduction to") || title.includes("basics of")) {
      // Try to determine the subject from the title
      if (title.includes("math") || title.includes("calculus") || title.includes("algebra")) {
        return "mathematics";
      }
      if (title.includes("physics") || title.includes("chemistry") || title.includes("biology")) {
        return "science";
      }
      if (title.includes("history") || title.includes("historical")) {
        return "history";
      }
      return "education";
    }
    
    // Check for subject-specific patterns
    if (title.includes("how to") || title.includes("tutorial")) {
      return "education";
    }
  }

  return bestCategory;
}

/**
 * Get category display name and icon
 */
export function getCategoryInfo(category: LectureCategory, language: "ar" | "en" = "en") {
  const categories: Record<LectureCategory, { en: string; ar: string; icon: string }> = {
    science: { en: "Science", ar: "علوم", icon: "🔬" },
    technology: { en: "Technology", ar: "تقنية", icon: "💻" },
    mathematics: { en: "Mathematics", ar: "رياضيات", icon: "📐" },
    medicine: { en: "Medicine", ar: "طب", icon: "⚕️" },
    history: { en: "History", ar: "تاريخ", icon: "📜" },
    art: { en: "Art", ar: "فن", icon: "🎨" },
    language: { en: "Language", ar: "لغة", icon: "📚" },
    business: { en: "Business", ar: "أعمال", icon: "💼" },
    education: { en: "Education", ar: "تعليم", icon: "🎓" },
    other: { en: "Other", ar: "أخرى", icon: "📄" },
  };

  return categories[category];
}

