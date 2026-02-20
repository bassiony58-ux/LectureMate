import { Slide } from "@/lib/mockData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, Presentation, Edit2, Save, X, Check, Sparkles, Palette, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState, useEffect, useMemo } from "react";
import { downloadSlidesPptx, SlideTheme, generateSlides } from "@/lib/aiService";
import { useLectures } from "@/hooks/useLectures";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SlidesViewProps {
  slides: Slide[];
  title?: string;
  transcript?: string;
  summary?: string | string[];
  lectureId?: string;
}

export function SlidesView({ slides, title, transcript, summary, lectureId }: SlidesViewProps) {
  const { toast } = useToast();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { updateLecture } = useLectures();

  // Detect language from slides content
  const detectContentLanguage = useMemo(() => {
    if (!slides || slides.length === 0) return language;
    
    // Check if any slide contains Arabic text
    const allText = slides
      .map(slide => `${slide.title} ${slide.content.join(" ")}`)
      .join(" ");
    const hasArabic = /[\u0600-\u06FF]/.test(allText);
    
    // Use content language if detected, otherwise use UI language
    return hasArabic ? "ar" : language;
  }, [slides, language]);

  // Set display direction and text alignment based on detected language
  const contentDir = detectContentLanguage === "ar" ? "rtl" : "ltr";
  const contentTextAlign = detectContentLanguage === "ar" ? "right" : "left";
  
  // Use UI language for UI elements
  const uiDir = language === "ar" ? "rtl" : "ltr";
  const [theme, setTheme] = useState<SlideTheme>("clean");
  const [customColor, setCustomColor] = useState<string>("#8B5CF6"); // Default primary color
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [editingSlideId, setEditingSlideId] = useState<number | null>(null);
  const [editedSlides, setEditedSlides] = useState<Slide[]>(slides);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Update edited slides when slides prop changes
  useEffect(() => {
    setEditedSlides(slides);
  }, [slides]);

  const defaultTitle = language === "ar" ? "شرائح المحاضرة" : "Lecture Slides";
  const displayTitle = title || defaultTitle;

  const t = {
    generatedSlides: language === "ar" ? "الشرائح المُنشأة" : "Generated Slides",
    downloadPPTX: language === "ar" ? "تحميل PowerPoint (.pptx)" : "Download PowerPoint (.pptx)",
    noSlides: language === "ar" ? "لا توجد شرائح متاحة" : "No slides available",
    noSlidesDesc: language === "ar" ? "لا توجد شرائح للتحميل." : "There are no slides to download.",
    downloaded: language === "ar" ? "تم تحميل الشرائح" : "Slides downloaded",
    downloadedDesc: language === "ar"
      ? "تم تحميل الشرائح كملف PowerPoint جاهز للعرض."
      : "Slides have been downloaded as a PowerPoint file.",
    slide: language === "ar" ? "شريحة" : "Slide",
    selectTheme: language === "ar" ? "ثيم العرض" : "Theme",
    themeClean: language === "ar" ? "بسيط" : "Clean",
    themeDark: language === "ar" ? "داكن" : "Dark",
    themeAcademic: language === "ar" ? "أكاديمي" : "Academic",
    themeModern: language === "ar" ? "عصري" : "Modern",
    themeTech: language === "ar" ? "تقني" : "Tech",
    missingData: language === "ar"
      ? "لا يمكن إنشاء ملف PowerPoint بدون النص والملخص."
      : "Cannot generate PowerPoint without transcript and summary.",
    edit: language === "ar" ? "تعديل" : "Edit",
    save: language === "ar" ? "حفظ" : "Save",
    cancel: language === "ar" ? "إلغاء" : "Cancel",
    saved: language === "ar" ? "تم الحفظ" : "Saved",
    savedDesc: language === "ar" ? "تم حفظ التغييرات بنجاح." : "Changes saved successfully.",
    editing: language === "ar" ? "جاري التعديل..." : "Editing...",
    selectThemeLabel: language === "ar" ? "اختر نمط العرض" : "Select Theme",
    generateSlides: language === "ar" ? "إنشاء الشرائح" : "Generate Slides",
    generating: language === "ar" ? "جاري الإنشاء..." : "Generating...",
    generateError: language === "ar" ? "فشل إنشاء الشرائح" : "Failed to generate slides",
    generateErrorDesc: language === "ar" ? "حدث خطأ أثناء إنشاء الشرائح. حاول مرة أخرى." : "An error occurred while generating slides. Please try again.",
    generateSuccess: language === "ar" ? "تم إنشاء الشرائح" : "Slides generated",
    generateSuccessDesc: language === "ar" ? "تم إنشاء الشرائح بنجاح." : "Slides have been generated successfully.",
  };

  const handleEditSlide = (slideId: number) => {
    setEditingSlideId(slideId);
  };

  const handleSaveSlide = async (slideId: number) => {
    if (!user?.uid || !lectureId) {
      toast({
        title: "Error",
        description: language === "ar" ? "يجب تسجيل الدخول أولاً." : "You must be logged in.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateLecture({
        lectureId,
        updates: { slides: editedSlides },
      });
      setEditingSlideId(null);
      toast({
        title: t.saved,
        description: t.savedDesc,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (language === "ar" ? "فشل حفظ التغييرات." : "Failed to save changes."),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingSlideId(null);
    setEditedSlides(slides); // Reset to original
  };

  const handleUpdateSlideTitle = (slideId: number, newTitle: string) => {
    setEditedSlides((prev) =>
      prev.map((s) => (s.id === slideId ? { ...s, title: newTitle } : s))
    );
  };

  const handleUpdateSlideContent = (slideId: number, newContent: string[]) => {
    setEditedSlides((prev) =>
      prev.map((s) => (s.id === slideId ? { ...s, content: newContent } : s))
    );
  };

  const handleGenerateSlides = async () => {
    if (!transcript) {
      toast({
        title: t.generateError,
        description: language === "ar" ? "النص مطلوب لإنشاء الشرائح." : "Transcript is required to generate slides.",
        variant: "destructive",
      });
      return;
    }

    if (!user?.uid || !lectureId) {
      toast({
        title: "Error",
        description: language === "ar" ? "يجب تسجيل الدخول أولاً." : "You must be logged in.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);
      const generatedSlides = await generateSlides(transcript, summary || "");
      
      if (generatedSlides.length === 0) {
        toast({
          title: t.generateError,
          description: t.generateErrorDesc,
          variant: "destructive",
        });
        return;
      }

      // Update edited slides and save to Firestore
      setEditedSlides(generatedSlides);
      await updateLecture({
        lectureId,
        updates: { slides: generatedSlides },
      });

      toast({
        title: t.generateSuccess,
        description: t.generateSuccessDesc,
      });
    } catch (error: any) {
      console.error("[SlidesView] Error generating slides:", error);
      toast({
        title: t.generateError,
        description: error?.message || t.generateErrorDesc,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPPTX = async () => {
    if (editedSlides.length === 0) {
      toast({
        title: t.noSlides,
        description: t.missingData,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDownloading(true);
      // Use edited slides directly instead of regenerating from API
      await downloadSlidesPptx(
        editedSlides.map(slide => ({
          title: slide.title,
          content: slide.content,
        })),
        theme,
        displayTitle,
        customColor, // Pass custom color
      );
      toast({
        title: t.downloaded,
        description: t.downloadedDesc,
      });
    } catch (error: any) {
      console.error("[SlidesView] Error downloading PPTX:", error);
      toast({
        title: "Error",
        description:
          error?.message ||
          (language === "ar"
            ? "فشل تحميل ملف PowerPoint. حاول مرة أخرى."
            : "Failed to download PowerPoint file. Please try again."),
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Theme configuration with font and default color
  const themeConfig: Record<SlideTheme, { 
    label: string; 
    defaultColor: string; 
    font: string; 
    colors: { bg: string; title: string; text: string; accent: string } 
  }> = {
    clean: {
      label: t.themeClean,
      defaultColor: "#8B5CF6", // Purple
      font: "Arial",
      colors: { bg: "bg-white", title: "text-[#8B5CF6]", text: "text-[#0A0A0B]", accent: "border-[#8B5CF6]" },
    },
    dark: {
      label: t.themeDark,
      defaultColor: "#10B981", // Green
      font: "Roboto",
      colors: { bg: "bg-[#1F2937]", title: "text-[#10B981]", text: "text-[#F9FAFB]", accent: "border-[#10B981]" },
    },
    academic: {
      label: t.themeAcademic,
      defaultColor: "#2563EB", // Blue
      font: "Times New Roman",
      colors: { bg: "bg-[#F5F5F7]", title: "text-[#2563EB]", text: "text-[#0A0A0B]", accent: "border-[#2563EB]" },
    },
    modern: {
      label: t.themeModern,
      defaultColor: "#EC4899", // Pink
      font: "Montserrat",
      colors: { bg: "bg-[#8B5CF6]", title: "text-white", text: "text-white", accent: "border-white" },
    },
    tech: {
      label: t.themeTech,
      defaultColor: "#06B6D4", // Cyan
      font: "Consolas",
      colors: { bg: "bg-[#1E1B4B]", title: "text-[#06B6D4]", text: "text-[#E2E8F0]", accent: "border-[#06B6D4]" },
    },
  };

  const themeThumbnails = Object.entries(themeConfig).map(([value, config]) => ({
    value: value as SlideTheme,
    ...config,
  }));

  // Update custom color when theme changes
  useEffect(() => {
    const themeDefaults: Record<SlideTheme, string> = {
      clean: "#8B5CF6",
      dark: "#10B981",
      academic: "#2563EB",
      modern: "#EC4899",
      tech: "#06B6D4",
    };
    setCustomColor(themeDefaults[theme] || "#8B5CF6");
  }, [theme]);

  return (
    <div className="space-y-6" dir={uiDir} key={`slides-${language}-${detectContentLanguage}`}>
      {/* Header */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 ${language === "ar" ? "flex-row-reverse" : ""}`}>
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Presentation className="w-5 h-5 text-primary" />
            {t.generatedSlides}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "ar"
              ? "عدّل السلايدات، اختر الثيم، ثم حمّل ملف PowerPoint"
              : "Edit slides, choose theme, then download PowerPoint"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {editedSlides.length === 0 && transcript && (
            <Button
              onClick={handleGenerateSlides}
              disabled={isGenerating || !transcript}
              variant="default"
            >
              <Sparkles className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
              {isGenerating ? t.generating : t.generateSlides}
            </Button>
          )}
          <Button
            onClick={handleDownloadPPTX}
            disabled={isDownloading || editedSlides.length === 0}
            variant={editedSlides.length === 0 ? "outline" : "default"}
          >
            <Download className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {isDownloading ? (language === "ar" ? "جارٍ التحميل..." : "Downloading...") : t.downloadPPTX}
          </Button>
        </div>
      </div>

      {/* Theme Selection - Collapsible */}
      {editedSlides.length > 0 && (
        <Collapsible open={isThemeOpen} onOpenChange={setIsThemeOpen}>
          <div className="border rounded-lg bg-card">
            <CollapsibleTrigger className="w-full">
              <div className={`flex items-center p-4 hover:bg-accent/50 transition-colors ${language === "ar" ? "flex-row-reverse" : ""}`}>
                {language === "ar" && (
                  <div className="ml-4">
                    {isThemeOpen ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className={`flex items-center flex-1 ${language === "ar" ? "flex-row-reverse gap-3" : "gap-3"}`}>
                  {language === "ar" ? (
                    <>
                      <div className="text-right flex-1">
                        <p className="text-sm font-semibold text-foreground">{t.selectThemeLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          اختر ثيم العرض التقديمي واللون المخصص
                        </p>
                      </div>
                      <Settings className="w-5 h-5 text-primary flex-shrink-0" />
                    </>
                  ) : (
                    <>
                      <Settings className="w-5 h-5 text-primary flex-shrink-0" />
                      <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-foreground">{t.selectThemeLabel}</p>
                    <p className="text-xs text-muted-foreground">
                          Choose theme and custom color
                    </p>
                  </div>
                    </>
                  )}
                </div>
                {language !== "ar" && (
                  <div className="ml-4">
                {isThemeOpen ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 space-y-4 border-t">
                {/* Custom Color Picker */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    <label className="text-sm font-medium text-foreground">
                      {language === "ar" ? "اللون المخصص" : "Custom Color"}
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      className="w-16 h-10 rounded-lg border-2 border-border cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={customColor}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^#[0-9A-Fa-f]{6}$/.test(value) || value === "") {
                          setCustomColor(value || "#8B5CF6");
                        }
                      }}
                      placeholder="#8B5CF6"
                      className="flex-1 max-w-[120px]"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const themeDefaults: Record<SlideTheme, string> = {
                          clean: "#8B5CF6",
                          dark: "#10B981",
                          academic: "#2563EB",
                          modern: "#EC4899",
                          tech: "#06B6D4",
                        };
                        setCustomColor(themeDefaults[theme] || "#8B5CF6");
                      }}
                    >
                      {language === "ar" ? "إعادة تعيين" : "Reset"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {language === "ar" 
                      ? `اختر لوناً مخصصاً لتطبيقه على العناوين والعناصر الرئيسية (اللون المقترح: ${customColor})` 
                      : `Choose a custom color to apply to titles and key elements (Suggested: ${customColor})`}
                  </p>
                </div>

                {/* Theme Selection Grid */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {language === "ar" ? "اختر الثيم" : "Select Theme"}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {themeThumbnails.map((thumb) => (
                      <button
                        key={thumb.value}
                        onClick={() => setTheme(thumb.value)}
                        className={`relative group p-3 rounded-xl border-2 transition-all duration-200 ${
                          theme === thumb.value
                            ? "border-primary shadow-lg scale-[1.02] bg-primary/5"
                            : "border-border hover:border-primary/50 hover:shadow-md hover:scale-[1.01]"
                        }`}
                      >
                        <div 
                          className={`${thumb.colors.bg} rounded-lg p-3 aspect-video flex flex-col justify-between shadow-sm border-2`}
                          style={{ 
                            borderColor: theme === thumb.value ? (customColor || thumb.defaultColor) : undefined,
                            fontFamily: thumb.font,
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <h4 
                              className={`text-xs font-bold truncate flex-1 ${language === "ar" ? "text-right" : "text-left"}`}
                              style={{ 
                                color: theme === thumb.value && customColor ? customColor : undefined,
                                fontFamily: thumb.font,
                              }}
                            >
                              {language === "ar" ? "عنوان السلايد" : "Slide Title"}
                            </h4>
                            {theme === thumb.value && (
                              <Check 
                                className={`w-3 h-3 flex-shrink-0 ${language === "ar" ? "mr-1" : "ml-1"}`}
                                style={{ color: customColor || thumb.colors.title.includes("#") ? undefined : undefined }}
                              />
                            )}
                          </div>
                          <ul className={`space-y-0.5 ${language === "ar" ? "text-right" : "text-left"}`} style={{ fontFamily: thumb.font }}>
                            <li className={`text-[10px] ${thumb.colors.text} opacity-90`}>
                              <span style={{ color: theme === thumb.value && customColor ? customColor : undefined }}>•</span> {language === "ar" ? "نقطة 1" : "Point 1"}
                            </li>
                            <li className={`text-[10px] ${thumb.colors.text} opacity-75`}>
                              <span style={{ color: theme === thumb.value && customColor ? customColor : undefined }}>•</span> {language === "ar" ? "نقطة 2" : "Point 2"}
                            </li>
                          </ul>
                        </div>
                        <p className="text-xs text-center mt-2 font-medium text-foreground">{thumb.label}</p>
                        {theme === thumb.value && (
                          <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-md">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Slides Grid */}
      {editedSlides.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            {t.noSlides}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {editedSlides.map((slide) => {
            const isEditing = editingSlideId === slide.id;
            return (
              <Card
                key={slide.id}
                className={`overflow-hidden hover:shadow-md transition-shadow border-2 ${
                  isEditing
                    ? "border-primary/40 shadow-lg"
                    : "border-transparent hover:border-primary/20"
                } group`}
              >
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 flex flex-col p-6 relative">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-primary" />
                  
                  {isEditing ? (
                    <>
                      <Input
                        value={slide.title}
                        onChange={(e) => handleUpdateSlideTitle(slide.id, e.target.value)}
                        className="text-xl font-bold mb-4 bg-background"
                        dir={contentDir}
                        style={{ textAlign: contentTextAlign }}
                      />
                      <Textarea
                        value={slide.content.join("\n")}
                        onChange={(e) =>
                          handleUpdateSlideContent(
                            slide.id,
                            e.target.value.split("\n").filter((line) => line.trim().length > 0)
                          )
                        }
                        className="flex-1 bg-background resize-none"
                        placeholder={language === "ar" ? "أدخل النقاط (سطر لكل نقطة)..." : "Enter bullet points (one per line)..."}
                        dir={contentDir}
                        style={{ textAlign: contentTextAlign }}
                      />
                    </>
                  ) : (
                    <>
                      <h4 
                        className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 break-words"
                        dir={contentDir}
                        style={{ textAlign: contentTextAlign }}
                      >
                        {slide.title}
                      </h4>
                      <ul 
                        className="space-y-2 text-slate-600 dark:text-slate-300 text-sm"
                        dir={contentDir}
                        style={{ 
                          listStyle: "disc",
                          paddingRight: contentDir === "rtl" ? "1.5rem" : "0",
                          paddingLeft: contentDir === "rtl" ? "0" : "1.5rem",
                        }}
                      >
                        {slide.content.map((item, i) => (
                          <li key={i} className="break-words" style={{ textAlign: contentTextAlign }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <div className="mt-auto pt-4 flex justify-between text-xs text-slate-400">
                    <span>LectureMate AI</span>
                    <span>{slide.id}</span>
                  </div>
                </div>
                <CardContent className="p-3 bg-card border-t">
                  <div className={`flex items-center justify-between ${language === "ar" ? "flex-row-reverse" : ""}`}>
                    <p className="text-xs text-muted-foreground font-medium">
                      {t.slide} {slide.id}
                    </p>
                    {isEditing ? (
                      <div className={`flex gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveSlide(slide.id)}
                          disabled={isSaving}
                        >
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditSlide(slide.id)}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
