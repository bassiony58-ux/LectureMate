import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { LectureCard } from "@/components/dashboard/LectureCard";
import { Input } from "@/components/ui/input";
import { Search, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLectures } from "@/hooks/useLectures";
import { lectureService } from "@/lib/lectureService";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { classifyLecture, getCategoryInfo, type LectureCategory } from "@/lib/categoryClassifier";
import { cn } from "@/lib/utils";

export default function History() {
  const { user } = useAuth();
  const { lectures, isLoading } = useLectures();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<LectureCategory | "all">("all");
  const { language } = useLanguage();

  const t = {
    title: language === "ar" ? "محاضراتي" : "My Lectures",
    subtitle:
      language === "ar"
        ? "إدارة ومراجعة المحاضرات التي قمت بتحليلها."
        : "Manage and review your analyzed content.",
    searchPlaceholder:
      language === "ar" ? "ابحث في المحاضرات..." : "Search lectures...",
    loading:
      language === "ar" ? "جاري تحميل المحاضرات..." : "Loading lectures...",
    emptySearch:
      language === "ar"
        ? "لا توجد محاضرات مطابقة لبحثك."
        : "No lectures found matching your search.",
    emptyDefault:
      language === "ar"
        ? "لا توجد محاضرات بعد. ابدأ بتحليل فيديو!"
        : "No lectures yet. Start analyzing a video!",
    categories: language === "ar" ? "الفئات" : "Categories",
    allCategories: language === "ar" ? "جميع الفئات" : "All Categories",
    filterByCategory: language === "ar" ? "تصفية حسب الفئة" : "Filter by Category",
  };

  // Classify lectures and get unique categories (use existing category or default to "other")
  const lecturesWithCategories = useMemo(() => {
    return lectures.map(lecture => ({
      ...lecture,
      category: lecture.category || "other", // Will be classified by AI when transcript is available
    }));
  }, [lectures]);

  const uniqueCategories = useMemo(() => {
    const categories = new Set<LectureCategory>();
    lecturesWithCategories.forEach(lecture => {
      if (lecture.category) {
        categories.add(lecture.category);
      }
    });
    return Array.from(categories).sort();
  }, [lecturesWithCategories]);
  
  const filteredLectures = useMemo(() => {
    let filtered = lecturesWithCategories;

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(lecture => lecture.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (lecture) =>
          lecture.title.toLowerCase().includes(term) ||
          lecture.transcript?.toLowerCase().includes(term) ||
          (lecture.category && getCategoryInfo(lecture.category, language).en.toLowerCase().includes(term)) ||
          (lecture.category && getCategoryInfo(lecture.category, language).ar.includes(term))
      );
    }

    return filtered;
  }, [searchTerm, selectedCategory, lecturesWithCategories, language]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">{t.loading}</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t.title}
            </h1>
            <p className="text-muted-foreground mt-1">{t.subtitle}</p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder={t.searchPlaceholder}
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Category Filter */}
        {uniqueCategories.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">{t.filterByCategory}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("all")}
                className="text-xs"
              >
                {t.allCategories}
              </Button>
              {uniqueCategories.map((category) => {
                const categoryInfo = getCategoryInfo(category, language);
                return (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                    className="text-xs"
                  >
                    <span className="mr-1">{categoryInfo.icon}</span>
                    {categoryInfo[language]}
                  </Button>
                );
              })}
            </div>
            {selectedCategory !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory("all")}
                className="text-xs h-6 px-2"
              >
                <X className="w-3 h-3 mr-1" />
                {language === "ar" ? "إزالة التصفية" : "Clear filter"}
              </Button>
            )}
          </div>
        )}

        {filteredLectures.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchTerm ? t.emptySearch : t.emptyDefault}
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLectures.map((lecture) => (
            <LectureCard key={lecture.id} lecture={lecture} />
          ))}
        </div>
        )}
      </div>
    </AppLayout>
  );
}
