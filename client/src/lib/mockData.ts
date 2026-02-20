import { Clock, FileText, Layout, MessageSquare, PlayCircle, List, CheckCircle, HelpCircle, Presentation } from "lucide-react";

export type LectureStatus = "processing" | "completed" | "failed";

export interface Question {
  id: number;
  text: string;
  options: string[] | null;
  correct_answer: string | null;
  correctIndex?: number; // Keep for backward compatibility
  type: "multiple_choice" | "true_false" | "open_ended";
  is_numerical?: boolean;
  expected_keywords?: string[] | null;
  reference?: {
    source_type: "uploaded_content" | "related_topic";
    location: string;
    concept: string;
  } | null;
}

export interface Slide {
  id: number;
  title: string;
  content: string[];
  note?: string;
}

export interface Flashcard {
  id: number;
  term: string;
  definition: string;
}

export type LectureCategory =
  | "science"
  | "technology"
  | "mathematics"
  | "medicine"
  | "history"
  | "art"
  | "language"
  | "business"
  | "education"
  | "other";

export interface Lecture {
  id: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  date: string;
  status: LectureStatus;
  progress?: number; // 0-100
  summary?: string | string[]; // Support both long-form string (new) and array (legacy)
  transcript?: string;
  quiz_sets?: {
    easy: Question[];
    medium: Question[];
    hard: Question[];
  };
  questions?: Question[]; // Legacy support
  slides?: Slide[];
  flashcards?: Flashcard[];
  modelType?: "gpu" | "api"; // Model used to process this lecture
  category?: LectureCategory; // Smart category classification
}

export const MOCK_LECTURES: Lecture[] = [
  {
    id: "1",
    title: "Introduction to Quantum Mechanics: The Wave Function",
    thumbnailUrl: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    duration: "45:20",
    date: "Today, 10:23 AM",
    status: "completed",
    summary: [
      "The wave function (Ψ) is a fundamental concept in quantum mechanics describing the quantum state of a particle.",
      "Unlike classical mechanics, quantum mechanics is probabilistic, not deterministic.",
      "The Schrödinger equation determines how the wave function evolves over time.",
      "Observation causes the 'collapse' of the wave function to a specific eigenstate.",
      "Heisenberg's Uncertainty Principle places limits on the precision of simultaneous measurements of position and momentum."
    ],
    transcript: `Good morning everyone. Today we are going to dive deep into the heart of Quantum Mechanics: The Wave Function. 

    Now, in classical mechanics, if we want to describe the state of a particle, we specify its position and its momentum. If we know these two things, and we know the forces acting on the particle, we can predict its future motion with absolute certainty using Newton's laws. 

    But the quantum world is different. Very different. 

    In quantum mechanics, we don't have precise values for position and momentum simultaneously. Instead, the state of a system is described by a mathematical function called the wave function, denoted by the Greek letter Psi (Ψ).

    This wave function contains all the information that can be known about the system. But here's the catch: it doesn't tell us *exactly* where the particle is. Instead, the square of the absolute value of the wave function gives us the *probability density* of finding the particle at a particular location.

    Think about that for a second. Nature, at its most fundamental level, is not deterministic. It's probabilistic. Einstein hated this idea, famously saying "God does not play dice." But experiment after experiment has shown that this is indeed how the universe works.

    Now, let's look at the Schrödinger equation...`,
    quiz_sets: {
      easy: [
        {
          id: 101,
          text: "What is the wave function denoted by?",
          options: ["Sigma (Σ)", "Psi (Ψ)", "Delta (Δ)", "Omega (Ω)"],
          correct_answer: "Psi (Ψ)",
          correctIndex: 1,
          type: "multiple_choice"
        }
      ],
      medium: [
        {
          id: 1,
          text: "What does the square of the wave function represent?",
          options: [
            "The exact position of the particle",
            "The momentum of the particle",
            "The probability density of finding the particle",
            "The energy of the particle"
          ],
          correct_answer: "The probability density of finding the particle",
          correctIndex: 2,
          type: "multiple_choice"
        },
        {
          id: 2,
          text: "Classical mechanics is probabilistic while quantum mechanics is deterministic.",
          options: ["True", "False"],
          correct_answer: "False",
          correctIndex: 1,
          type: "true_false"
        }
      ],
      hard: [
        {
          id: 201,
          text: "Explain why Einstein famously said 'God does not play dice' in the context of the Schrödinger equation and the wave function.",
          options: null,
          correct_answer: null,
          correctIndex: 0,
          type: "open_ended",
          expected_keywords: ["probabilistic", "deterministic", "Einstein", "deterministic nature", "God does not play dice"]
        }
      ]
    },
    slides: [
      {
        id: 1,
        title: "The Wave Function (Ψ)",
        content: [
          "Fundamental description of quantum state",
          "Contains all knowable information about the system",
          "Not directly observable"
        ]
      },
      {
        id: 2,
        title: "Probability Density",
        content: [
          "|Ψ(x,t)|² represents probability density",
          "Determines likelihood of finding particle at position x",
          "Normalization condition: ∫|Ψ|²dx = 1"
        ]
      },
      {
        id: 3,
        title: "Schrödinger Equation",
        content: [
          "Describes time evolution of Ψ",
          "ih̄(∂Ψ/∂t) = ĤΨ",
          "Analogous to Newton's F=ma in classical mechanics"
        ]
      }
    ]
  },
  {
    id: "2",
    title: "Modern Art History: Abstract Expressionism",
    thumbnailUrl: "https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    duration: "1:12:05",
    date: "Yesterday",
    status: "completed",
    summary: [
      "Abstract Expressionism emerged in New York in the 1940s.",
      "It was the first specifically American movement to achieve international influence.",
      "Key figures include Jackson Pollock, Mark Rothko, and Willem de Kooning.",
      "The movement emphasizes spontaneous, automatic, or subconscious creation."
    ],
    transcript: "Welcome back to Art History 101. Today we are moving into the post-war era...",
    quiz_sets: {
      easy: [],
      medium: [
        {
          id: 301,
          text: "When did Abstract Expressionism emerge?",
          options: ["1920s", "1930s", "1940s", "1950s"],
          correct_answer: "1940s",
          correctIndex: 2,
          type: "multiple_choice"
        }
      ],
      hard: []
    },
    slides: []
  },
  {
    id: "3",
    title: "Neural Networks and Deep Learning",
    thumbnailUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    duration: "55:00",
    date: "Nov 24, 2025",
    status: "processing",
    progress: 65,
    summary: [],
    transcript: "",
    quiz_sets: { easy: [], medium: [], hard: [] },
    slides: []
  }
];
