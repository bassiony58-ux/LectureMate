// AI service for generating summaries, quizzes, and slides
// This is a simplified version - in production, integrate with OpenAI, Anthropic, or similar

export interface AISummary {
  points: string[];
}

export interface AIQuestion {
  id: number;
  text: string;
  options: string[] | null;
  correct_answer: string | null;
  correctIndex?: number;
  type: "multiple_choice" | "true_false" | "open_ended";
  is_numerical?: boolean;
  expected_keywords?: string[] | null;
  reference?: {
    source_type: "uploaded_content" | "related_topic";
    location: string;
    concept: string;
  } | null;
}

export interface AISlide {
  id: number;
  title: string;
  content: string[];
  note?: string;
}

// Generate summary from transcript using AI (returns long-form abstractive summary)
export async function generateSummary(transcript: string, mode?: "gpu" | "api"): Promise<string> {
  try {
    console.log(`[aiService] Generating AI abstractive summary (mode: ${mode || "api"})...`);

    // Call backend API for AI summary generation
    const response = await fetch("/api/ai/summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript, mode }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate summary");
    }

    // Support both string (new format) and array (old format) for backward compatibility
    if (typeof data.summary === "string") {
      console.log(`[aiService] AI abstractive summary generated (${data.summary.length} characters)`);
      return data.summary;
    } else if (Array.isArray(data.summary)) {
      // Legacy format: convert array to paragraph text
      const summaryText = data.summary.join(" ");
      console.log(`[aiService] AI summary converted from array format (${summaryText.length} characters)`);
      return summaryText;
    } else {
      throw new Error("Invalid summary format received");
    }
  } catch (error: any) {
    console.error("[aiService] Error generating summary:", error);

    // Fallback to simple summary if API fails
    if (!transcript || transcript.length < 100) {
      return "Transcript is too short to generate a summary.";
    }

    const sentences = transcript
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30);

    // Group into paragraphs
    const sentencesPerParagraph = 3;
    const paragraphs: string[] = [];
    for (let i = 0; i < Math.min(9, sentences.length); i += sentencesPerParagraph) {
      const paragraphSentences = sentences.slice(i, i + sentencesPerParagraph);
      paragraphs.push(paragraphSentences.join(". ") + ".");
    }

    return paragraphs.join("\n\n");
  }
}

// Generate quiz questions from transcript using AI
export async function generateQuiz(transcript: string, mode: "gpu" | "api" = "api", quizMode: "comprehensive" | "advanced" | "expert" = "comprehensive", title?: string): Promise<AIQuestion[]> {
  try {
    console.log(`[aiService] Generating AI quiz questions (mode: ${mode}, quizMode: ${quizMode})...`);

    if (!transcript || transcript.length < 200) {
      console.warn("[aiService] Transcript too short for quiz generation");
      return [];
    }

    // Call backend API for AI quiz generation
    const response = await fetch("/api/ai/quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript, mode: quizMode, title }), // Send quizMode as 'mode' to backend
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate quiz questions");
    }

    const mapQuestions = (questionsData: any[]): AIQuestion[] => {
      return (questionsData || []).map((q: any) => ({
        id: q.id || Math.floor(Math.random() * 1000000),
        text: q.text || "",
        options: q.options || null,
        correctIndex: q.correctIndex ?? (q.options ? q.options.indexOf(q.correct_answer) : 0),
        type: (q.type === "true-false" || q.type === "true_false")
          ? "true_false"
          : (q.type === "open_ended" || q.type === "open-ended" ? "open_ended" : "multiple_choice"),
        correct_answer: q.correct_answer ?? null,
        is_numerical: q.is_numerical ?? false,
        expected_keywords: q.expected_keywords ?? null,
        reference: q.reference ?? null
      }));
    };

    if (data.questions && Array.isArray(data.questions)) {
      return mapQuestions(data.questions);
    }

    // Fallback if data structure is unexpected (flatten legacy quiz_sets)
    if (data.quiz_sets) {
      const all = [
        ...(data.quiz_sets.easy?.questions || []),
        ...(data.quiz_sets.medium?.questions || []),
        ...(data.quiz_sets.hard?.questions || [])
      ];
      return mapQuestions(all);
    }

    return [];
  } catch (error: any) {
    console.error("[aiService] Error generating quiz:", error);
    return [];
  }
}

// Generate slides from transcript and summary
export async function generateSlides(
  transcript: string,
  summary: string | string[]
): Promise<AISlide[]> {
  try {
    // Use AI API to generate structured slides
    const response = await fetch("/api/ai/slides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript,
        summary,
        theme: "clean", // Default theme, user can change later
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to generate slides");
    }

    const data = await response.json();

    // Convert API response to AISlide format
    if (data.slides && Array.isArray(data.slides)) {
      return data.slides.map((slide: any, index: number) => ({
        id: index + 1,
        title: slide.title || `Slide ${index + 1}`,
        content: slide.bullets || slide.content || [],
      }));
    }

    // Fallback: return empty array if no slides
    return [];
  } catch (error) {
    console.error("[aiService] Error generating slides:", error);

    // Fallback: create simple slides from summary if API fails
    const slides: AISlide[] = [];

    // Handle both string (new format) and array (legacy format)
    if (typeof summary === "string") {
      if (!summary || summary.trim().length === 0) {
        return slides;
      }

      // Split long-form summary into paragraphs and create slides from them
      const paragraphs = summary.split(/\n\s*\n/).filter(p => p.trim().length > 0);

      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();
        // Split paragraph into sentences for slide content
        const sentences = paragraph.split(/[.!؟]+/).filter(s => s.trim().length > 20);

        if (sentences.length > 0) {
          slides.push({
            id: slides.length + 1,
            title: `Section ${slides.length + 1}`,
            content: sentences.slice(0, 4), // Max 4 sentences per slide
          });
        }
      }
    } else {
      // Legacy array format
      if (summary.length === 0) {
        return slides;
      }

      // Create slides from summary points (group every 2-3 points)
      const pointsPerSlide = 2;
      for (let i = 0; i < summary.length; i += pointsPerSlide) {
        const slidePoints = summary.slice(i, i + pointsPerSlide);
        slides.push({
          id: slides.length + 1,
          title: `Key Point ${slides.length + 1}`,
          content: slidePoints,
        });
      }
    }

    return slides;
  }
}

// Generate flashcards from transcript
export async function generateFlashcards(transcript: string, mode: "gpu" | "api" = "api"): Promise<any[]> {
  try {
    if (!transcript || transcript.length < 200) {
      return [];
    }

    const response = await fetch("/api/ai/flashcards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript,
        mode,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to generate flashcards");
    }

    const data = await response.json();

    if (!data.flashcards || !Array.isArray(data.flashcards)) {
      throw new Error("Invalid flashcards format received");
    }

    // Map backend format to frontend format
    const flashcards = data.flashcards.map((f: any) => ({
      id: f.id || 0,
      term: f.term || "",
      definition: f.definition || "",
    }));

    console.log(`[aiService] AI flashcards generated with ${flashcards.length} cards`);
    return flashcards;
  } catch (error: any) {
    console.error("[aiService] Error generating flashcards:", error);

    // Fallback to simple flashcards if API fails
    if (!transcript || transcript.length < 200) {
      return [];
    }

    const hasArabic = /[\u0600-\u06FF]/.test(transcript);
    return [
      {
        id: 1,
        term: hasArabic ? "المفهوم الرئيسي" : "Main Concept",
        definition: hasArabic ? "المفهوم الرئيسي الذي تمت مناقشته في هذه المحاضرة" : "The main concept discussed in this lecture",
      },
    ];
  }
}

// Classify lecture category using AI
export async function classifyCategory(
  title?: string,
  transcript?: string,
  summary?: string | string[],
  mode?: "gpu" | "api"
): Promise<string> {
  try {
    console.log(`[aiService] Classifying lecture category using AI (mode: ${mode || "api"})...`);

    const summaryText = typeof summary === "string"
      ? summary
      : Array.isArray(summary)
        ? summary.join(" ")
        : "";

    const response = await fetch("/api/ai/category", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        transcript,
        summary: summaryText,
        mode,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to classify category");
    }

    const category = data.category || "other";
    console.log(`[aiService] AI classified category: ${category}`);
    return category;
  } catch (error: any) {
    console.error("[aiService] Error classifying category:", error);
    // Fallback to keyword-based classification
    return "other";
  }
}

// Slide theme type
export type SlideTheme = "clean" | "dark" | "academic" | "modern" | "tech";

// Download slides as PowerPoint (.pptx)
export async function downloadSlidesPptx(
  slides: { title: string; content: string[] }[],
  theme: SlideTheme = "clean",
  lectureTitle: string = "Lecture Slides",
  customColor?: string,
): Promise<void> {
  try {
    // Validate slides data
    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      throw new Error("No slides provided");
    }

    // Ensure all slides have required fields
    const validSlides = slides.map(slide => ({
      title: slide.title || "Untitled Slide",
      content: Array.isArray(slide.content) ? slide.content : [],
    }));

    console.log("[aiService] Downloading PPTX with slides:", {
      count: validSlides.length,
      slides: validSlides.map(s => ({ title: s.title, contentCount: s.content.length })),
      theme,
      lectureTitle,
      customColor,
    });

    const response = await fetch("/api/ai/slides/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slides: validSlides,
        theme,
        lectureTitle,
        customColor,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to download PowerPoint");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${lectureTitle.replace(/[^a-z0-9\u0600-\u06FF]/gi, "_")}_slides.pptx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error: any) {
    console.error("[aiService] Error downloading PPTX:", error);
    throw error;
  }
}

