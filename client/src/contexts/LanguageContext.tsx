import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Language = "en" | "ar";

interface LanguageContextValue {
  language: Language;
  isRTL: boolean;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

const STORAGE_KEY = "lecturmate_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default entire app to Arabic; user can still switch to English from the UI
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "ar";
    const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === "en" || stored === "ar") return stored;
    return "ar";
  });

  const isRTL = language === "ar";

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "ar" : "en");
  };

  // Apply dir/lang + class on <html> for global RTL/LTR
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.dir = isRTL ? "rtl" : "ltr";
    html.lang = language === "ar" ? "ar" : "en";

    html.classList.remove("rtl", "ltr");
    html.classList.add(isRTL ? "rtl" : "ltr");
  }, [isRTL, language]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        isRTL,
        toggleLanguage,
        setLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}


