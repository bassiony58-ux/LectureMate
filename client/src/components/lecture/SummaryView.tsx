import { useState, useMemo, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Share2, Sparkles, FileDown } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { TextWithMath } from "./FormulasView";

interface SummaryViewProps {
  summary: string | string[]; // Support both long-form string (new) and array (legacy)
  title?: string;
}

interface ParsedSections {
  intro: string;
  summary: string;
  keyPoints: string[];
}

export function SummaryView({ summary, title }: SummaryViewProps) {
  // Determine if summary is string (new format) or array (legacy format)
  const isLongForm = typeof summary === "string";
  const summaryText = isLongForm ? summary : "";
  const summaryArray = isLongForm ? [] : (summary || []);

  const hasSummary = isLongForm
    ? (summaryText && summaryText.trim().length > 0)
    : (summaryArray && summaryArray.length > 0);

  const { toast } = useToast();
  const { language } = useLanguage();

  const defaultTitle = language === "ar" ? "ملخص المحاضرة" : "Lecture Summary";
  const displayTitle = title || defaultTitle;

  const t = {
    aiSummary: language === "ar" ? "ملخص الذكاء الاصطناعي" : "AI Summary",
    share: language === "ar" ? "مشاركة" : "Share",
    saveSummary: language === "ar" ? "حفظ الملخص" : "Save Summary",
    exportPDF: language === "ar" ? "تصدير PDF" : "Export PDF",
    noSummary: language === "ar" ? "لا يوجد ملخص للذكاء الاصطناعي متاح بعد لهذه المحاضرة." : "No AI summary is available yet for this lecture.",
    introduction: language === "ar" ? "المقدمة" : "Introduction",
    summaryLabel: language === "ar" ? "الملخص" : "Summary",
    keyPoints: language === "ar" ? "أهم النقاط" : "Key Points",
    toast: {
      shared: language === "ar" ? "تمت المشاركة بنجاح" : "Shared successfully",
      sharedDesc: language === "ar" ? "تم مشاركة الملخص." : "The summary has been shared.",
      copied: language === "ar" ? "تم النسخ" : "Copied to clipboard",
      copiedDesc: language === "ar" ? "تم نسخ الملخص إلى الحافظة." : "Summary has been copied to your clipboard.",
      saved: language === "ar" ? "تم حفظ الملخص" : "Summary saved",
      savedDesc: language === "ar" ? "تم تنزيل الملخص كملف نصي." : "The summary has been downloaded as a text file.",
      exported: language === "ar" ? "تم تصدير PDF" : "PDF exported",
      exportedDesc: language === "ar" ? "تم تصدير الملخص كملف PDF." : "The summary has been exported as PDF.",
      exportFailed: language === "ar" ? "فشل التصدير" : "Export failed",
      exportFailedDesc: language === "ar" ? "فشل تصدير PDF. يرجى المحاولة مرة أخرى." : "Failed to export PDF. Please try again.",
    },
  };

  // Parse structured summary (Introduction / Summary / Key Points)
  const parseStructuredSummary = (fullSummary: string, lang: string): ParsedSections | null => {
    const sections: ParsedSections = {
      intro: "",
      summary: "",
      keyPoints: [],
    };

    const introHeading = lang === "ar" ? "المقدمة" : "Introduction";
    const summaryHeading = lang === "ar" ? "الملخص" : "Summary";
    const keyPointsHeading = lang === "ar" ? "أهم النقاط" : "Key Points";

    // Split by headings - handle both exact matches and with whitespace
    const lines = fullSummary.split(/\r?\n/);
    let currentSection: "intro" | "summary" | "keyPoints" | null = null;
    const sectionContent: { [key: string]: string[] } = {
      intro: [],
      summary: [],
      keyPoints: [],
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for section headings (exact match or starts with heading, even with markdown symbols)
      const cleanLine = trimmed.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").trim();

      if (cleanLine === introHeading || cleanLine.startsWith(introHeading + ":")) {
        currentSection = "intro";
        continue;
      } else if (cleanLine === summaryHeading || cleanLine.startsWith(summaryHeading + ":")) {
        currentSection = "summary";
        continue;
      } else if (cleanLine === keyPointsHeading || cleanLine.startsWith(keyPointsHeading + ":")) {
        currentSection = "keyPoints";
        continue;
      }

      // Add content to current section (skip empty lines between sections)
      if (currentSection) {
        if (trimmed.length > 0) {
          sectionContent[currentSection].push(line); // Keep original line for formatting
        } else if (sectionContent[currentSection].length > 0) {
          // Preserve empty lines within sections (for paragraph breaks)
          sectionContent[currentSection].push("");
        }
      }
    }

    // Process sections
    // Intro: join with spaces (should be short paragraph)
    sections.intro = sectionContent.intro
      .filter(line => line.trim().length > 0)
      .join(" ")
      .trim();

    // Summary: join with double newlines (preserve paragraphs)
    sections.summary = sectionContent.summary
      .join("\n")
      .replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
      .trim();

    // Process key points - handle both bullet points and bold labels
    sectionContent.keyPoints.forEach((line) => {
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed.length === 0) return;

      // Handle bold labels like "**تشبيه أساسي:** ..." or "- **Label:** ..."
      const boldMatch = trimmed.match(/^[-•]?\s*\*\*(.+?)\*\*:?\s*(.*)$/);
      if (boldMatch) {
        const label = boldMatch[1].trim();
        const rest = boldMatch[2].trim();
        sections.keyPoints.push(`**${label}**${rest ? `: ${rest}` : ""}`);
        return;
      }

      // Handle regular bullet points starting with "- "
      if (trimmed.startsWith("- ")) {
        const content = trimmed.substring(2).trim();
        if (content.length > 0) {
          sections.keyPoints.push(content);
        }
        return;
      }

      // Handle other bullet formats (•, etc.)
      if (trimmed.match(/^[•▪·]\s+/)) {
        const content = trimmed.replace(/^[•▪·]\s+/, "").trim();
        if (content.length > 0) {
          sections.keyPoints.push(content);
        }
        return;
      }

      // If it's a substantial line without bullet, include it
      if (trimmed.length > 5) {
        sections.keyPoints.push(trimmed);
      }
    });

    // Return parsed sections if we found meaningful content
    if (sections.intro || sections.summary || sections.keyPoints.length > 0) {
      return sections;
    }

    return null;
  };

  // Detect language from content itself
  const detectContentLanguage = useMemo(() => {
    const contentToCheck = isLongForm ? summaryText : (summaryArray.join(" ") || "");
    const hasArabic = /[\u0600-\u06FF]/.test(contentToCheck);
    // Use content language if detected, otherwise use UI language
    return hasArabic ? "ar" : language;
  }, [isLongForm, summaryText, summaryArray, language]);

  const parsedSections = useMemo(() => {
    if (!isLongForm || !summaryText) return null;
    // Use detected content language for parsing headings
    return parseStructuredSummary(summaryText, detectContentLanguage);
  }, [isLongForm, summaryText, detectContentLanguage]);

  // Split long-form text into paragraphs for display (fallback)
  const summaryParagraphs = useMemo(() => {
    if (!isLongForm || !summaryText) return [];
    return summaryText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  }, [isLongForm, summaryText]);

  // Function to render text with bold formatting (**text**) and Math
  const renderFormattedText = (text: string): ReactNode => {
    const parts: (string | ReactNode)[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(<TextWithMath key={`t1-${key}`} text={text.substring(lastIndex, match.index)} />);
      }
      // Add bold text
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold text-foreground">
          <TextWithMath text={match[1]} />
        </strong>
      );
      lastIndex = regex.lastIndex;
    }
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(<TextWithMath key={`t2-${key}`} text={text.substring(lastIndex)} />);
    }

    return parts.length > 0 ? parts : <TextWithMath text={text} />;
  };

  const handleShare = async () => {
    const shareText = hasSummary
      ? isLongForm
        ? `AI Summary: ${displayTitle}\n\n${summaryText}`
        : `AI Summary: ${displayTitle}\n\n${summaryArray.map((point, i) => `${i + 1}. ${point}`).join("\n\n")}`
      : "";

    if (navigator.share && shareText) {
      try {
        await navigator.share({
          title: `${displayTitle} - AI Summary`,
          text: shareText,
        });
        toast({
          title: t.toast.shared,
          description: t.toast.sharedDesc,
        });
      } catch (error: any) {
        if (error.name !== "AbortError") {
          await navigator.clipboard.writeText(shareText);
          toast({
            title: t.toast.copied,
            description: t.toast.copiedDesc,
          });
        }
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      toast({
        title: t.toast.copied,
        description: t.toast.copiedDesc,
      });
    }
  };

  const handleSaveSummary = () => {
    if (!hasSummary) return;

    const saveText = isLongForm
      ? `AI Summary: ${displayTitle}\n\n${summaryText}`
      : `AI Summary: ${displayTitle}\n\n${summaryArray.map((point, i) => `${i + 1}. ${point}`).join("\n\n")}\n\n---\nFull Reading Summary:\n\n${summaryArray.join(" ")}`;

    const blob = new Blob([saveText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${displayTitle.replace(/[^a-z0-9\u0600-\u06FF]/gi, "_")}_summary.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: t.toast.saved,
      description: t.toast.savedDesc,
    });
  };

  const handleExportPDF = async () => {
    if (!hasSummary) return;

    try {
      // Create HTML content - detect language from content
      const contentToCheck = isLongForm ? summaryText : (summaryArray.join(" ") || "");
      const hasArabic = /[\u0600-\u06FF]/.test(contentToCheck || displayTitle);
      const dir = hasArabic ? "rtl" : "ltr";
      const textAlign = hasArabic ? "right" : "left";
      const contentLang = hasArabic ? "ar" : "en";

      let contentHTML = "";

      if (parsedSections) {
        // Structured format - using site colors
        // Primary: hsl(250 84% 65%) = #8B5CF6
        // Background: hsl(240 20% 98%) = #F5F5F7
        // Card: #FFFFFF
        // Foreground: hsl(240 10% 3.9%) = #0A0A0B
        // Border: hsl(240 6% 90%) = #E4E4E7
        // Muted: hsl(240 5% 96%) = #F4F4F5

        const primaryColor = "#8B5CF6"; // Violet primary
        const primaryLight = "#EDE9FE"; // Light violet background
        const primaryDark = "#7C3AED"; // Darker violet for borders
        const textColor = "#0A0A0B"; // Dark foreground
        const mutedBg = "#F4F4F5"; // Muted background
        const borderColor = "#E4E4E7"; // Border color

        contentHTML = `
          ${parsedSections.intro ? `
            <div style="margin-bottom: 20px;">
              <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px; margin-bottom: 10px; text-align: ${textAlign};">
                ${language === "ar" ? "📝 المقدمة" : "📝 Introduction"}
              </h2>
              <div style="font-size: 13px; text-align: justify; line-height: 1.9; padding: 10px; background-color: ${mutedBg}; border-right: ${hasArabic ? `4px solid ${primaryColor}` : "none"}; border-left: ${!hasArabic ? `4px solid ${primaryColor}` : "none"}; color: ${textColor};">
                ${parsedSections.intro.replace(/\*\*(.+?)\*\*/g, `<strong style="color: ${primaryDark};">$1</strong>`)}
              </div>
            </div>
          ` : ""}
          ${parsedSections.summary ? `
            <div style="margin-bottom: 20px;">
              <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px; margin-bottom: 10px; text-align: ${textAlign};">
                ${language === "ar" ? "📊 الملخص" : "📊 Summary"}
              </h2>
              <div style="font-size: 13px; text-align: justify; line-height: 1.9; padding: 10px; background-color: ${primaryLight}; border-right: ${hasArabic ? `4px solid ${primaryDark}` : "none"}; border-left: ${!hasArabic ? `4px solid ${primaryDark}` : "none"}; color: ${textColor};">
                ${parsedSections.summary.replace(/\*\*(.+?)\*\*/g, `<strong style="color: ${primaryDark};">$1</strong>`)}
              </div>
            </div>
          ` : ""}
          ${parsedSections.keyPoints.length > 0 ? `
            <div style="margin-bottom: 20px;">
              <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px; margin-bottom: 10px; text-align: ${textAlign};">
                ${language === "ar" ? "⭐ أهم النقاط" : "⭐ Key Points"}
              </h2>
              <div style="font-size: 13px; text-align: justify; line-height: 1.9; padding: 10px; background-color: ${mutedBg}; border-right: ${hasArabic ? `4px solid ${primaryColor}` : "none"}; border-left: ${!hasArabic ? `4px solid ${primaryColor}` : "none"}; color: ${textColor};">
                ${parsedSections.keyPoints.map(point =>
          `<div style="margin-bottom: 8px;">• ${point.replace(/\*\*(.+?)\*\*/g, `<strong style="color: ${primaryDark};">$1</strong>`)}</div>`
        ).join("")}
              </div>
            </div>
          ` : ""}
        `;
      } else if (isLongForm) {
        const primaryDark = "#7C3AED";
        const textColor = "#0A0A0B";
        contentHTML = `
          <div style="font-size: 13px; text-align: justify; line-height: 1.9; padding: 10px; color: ${textColor};">
            ${summaryText.replace(/\*\*(.+?)\*\*/g, `<strong style="color: ${primaryDark};">$1</strong>`).replace(/\n/g, "<br>")}
          </div>
        `;
      } else {
        const primaryDark = "#7C3AED";
        const textColor = "#0A0A0B";
        contentHTML = `
          <div style="font-size: 13px; text-align: justify; line-height: 1.9; padding: 10px; color: ${textColor};">
            ${summaryArray.map((point, idx) =>
          `<div style="margin-bottom: 8px;">${idx + 1}. ${point}</div>`
        ).join("")}
          </div>
        `;
      }

      // Site colors
      const primaryColor = "#8B5CF6"; // Violet primary
      const primaryDark = "#7C3AED"; // Darker violet
      const textColor = "#0A0A0B"; // Dark foreground
      const mutedText = "#6B7280"; // Muted text
      const borderColor = "#E4E4E7"; // Border color
      const bgColor = "#FFFFFF"; // White background

      const htmlContent = `
        <div style="font-family: 'Tajawal', Arial, sans-serif; direction: ${dir}; color: ${textColor}; line-height: 1.8; padding: 20px; background-color: ${bgColor};">
          <div style="text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid ${primaryColor};">
            <h1 style="font-size: 24px; font-weight: bold; color: ${primaryColor}; margin: 0;">
              ${displayTitle}
            </h1>
            <p style="font-size: 9px; color: ${mutedText}; margin-top: 10px;">
              ${contentLang === "ar" ? "تم التصدير بواسطة LectureMate" : "Exported by LectureMate"} • ${new Date().toLocaleDateString(contentLang === "ar" ? "ar-EG" : "en-US")}
            </p>
          </div>
          <div style="margin-bottom: 20px;">
            <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px; margin-bottom: 10px; text-align: ${textAlign};">
              ${contentLang === "ar" ? "ملخص الذكاء الاصطناعي" : "AI Summary"}
            </h2>
            ${contentHTML}
          </div>
          <div style="margin-top: 30px; padding-top: 15px; border-top: 2px solid ${borderColor}; text-align: center;">
            <p style="font-size: 9px; color: ${mutedText};">
              ${contentLang === "ar"
          ? "© 2025 LectureMate. جميع الحقوق محفوظة. هذا المستند محمي بحقوق النشر ولا يجوز نسخه أو توزيعه دون إذن."
          : "© 2025 LectureMate. All rights reserved. This document is protected by copyright and may not be copied or distributed without permission."}
            </p>
          </div>
        </div>
      `;

      // Create temporary container
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

      // Wait for fonts to load
      await new Promise(resolve => setTimeout(resolve, 100));

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
      const filename = `${displayTitle.replace(/[^a-z0-9\u0600-\u06FF]/gi, "_")}_summary.pdf`;
      pdf.save(filename);

      toast({
        title: t.toast.exported,
        description: t.toast.exportedDesc,
      });
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast({
        title: t.toast.exportFailed,
        description: t.toast.exportFailedDesc,
        variant: "destructive",
      });
    }
  };

  // Use detected content language for content direction
  const contentDir = detectContentLanguage === "ar" ? "rtl" : "ltr";
  const displayTextAlign = detectContentLanguage === "ar" ? "right" : "left";

  // Use UI language for UI elements
  const uiDir = language === "ar" ? "rtl" : "ltr";

  return (
    <div className="space-y-6" key={`summary-${language}-${detectContentLanguage}`}>
      {/* Header */}
      <div className={`flex items-center justify-between ${language === "ar" ? "flex-row-reverse" : ""}`}>
        <h3 className={`text-lg font-semibold flex items-center gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}>
          <Sparkles className="w-5 h-5 text-primary" />
          {t.aiSummary}
        </h3>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleShare} disabled={!hasSummary}>
            <Share2 className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.share}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveSummary} disabled={!hasSummary}>
            <Download className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.saveSummary}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!hasSummary}>
            <FileDown className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.exportPDF}
          </Button>
        </div>
      </div>

      {!hasSummary ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            {t.noSummary}
          </CardContent>
        </Card>
      ) : parsedSections ? (
        // Structured format: Introduction, Summary, Key Points (all on same page)
        <div className="space-y-6">
          {/* Introduction */}
          {parsedSections.intro && (
            <Card className="border bg-card/80">
              <CardContent className="p-6">
                <h4
                  className="font-semibold text-lg mb-4 text-primary"
                  style={{ textAlign: language === "ar" ? "right" : "left" }}
                >
                  {t.introduction}
                </h4>
                <p
                  className="text-base leading-relaxed text-foreground"
                  dir={contentDir}
                  style={{ textAlign: displayTextAlign }}
                >
                  {renderFormattedText(parsedSections.intro)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {parsedSections.summary && (
            <Card className="border bg-card/80">
              <CardContent className="p-6">
                <h4
                  className="font-semibold text-lg mb-4 text-primary"
                  style={{ textAlign: language === "ar" ? "right" : "left" }}
                >
                  {t.summaryLabel}
                </h4>
                <div className="space-y-4">
                  {parsedSections.summary
                    .split(/\n\s*\n/)
                    .filter((p) => p.trim().length > 0)
                    .map((paragraph, idx) => (
                      <motion.p
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.1 }}
                        className="text-base leading-relaxed text-foreground"
                        dir={contentDir}
                        style={{ textAlign: displayTextAlign }}
                      >
                        {renderFormattedText(paragraph.trim())}
                      </motion.p>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Points */}
          {parsedSections.keyPoints.length > 0 && (
            <Card className="border bg-card/80">
              <CardContent className="p-6">
                <h4
                  className="font-semibold text-lg mb-4 text-primary"
                  style={{ textAlign: language === "ar" ? "right" : "left" }}
                >
                  {t.keyPoints}
                </h4>
                <ul
                  className="space-y-3 text-base leading-relaxed"
                  dir={contentDir}
                  style={{
                    listStyle: "disc",
                    paddingRight: detectContentLanguage === "ar" ? "1.5rem" : "0",
                    paddingLeft: detectContentLanguage === "ar" ? "0" : "1.5rem",
                  }}
                >
                  {parsedSections.keyPoints.map((point, idx) => {
                    // Detect bold labels at the start: **Label:** or **Label:**
                    const match = point.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
                    if (match) {
                      const label = match[1].trim();
                      const rest = match[2].trim();
                      return (
                        <motion.li
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: idx * 0.05 }}
                          className="text-foreground"
                        >
                          <span className="font-semibold text-primary">{label}</span>
                          {rest ? <span>: {renderFormattedText(rest)}</span> : ""}
                        </motion.li>
                      );
                    }
                    // Regular point with potential bold text inside
                    return (
                      <motion.li
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className="text-foreground"
                      >
                        {renderFormattedText(point)}
                      </motion.li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : isLongForm ? (
        // Fallback: show as paragraphs if parsing failed
        <Card className="border bg-card/80">
          <CardContent className="p-6">
            <div className="space-y-4">
              {summaryParagraphs.map((paragraph, idx) => (
                <motion.p
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.1 }}
                  className="text-base leading-relaxed text-foreground"
                  dir={contentDir}
                  style={{ textAlign: displayTextAlign }}
                >
                  {renderFormattedText(paragraph.trim())}
                </motion.p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        // Legacy array format
        <Card>
          <CardContent className="p-6">
            <ul
              className="space-y-2 text-base leading-relaxed"
              dir={contentDir}
              style={{
                listStyle: "disc",
                paddingRight: detectContentLanguage === "ar" ? "1.5rem" : "0",
                paddingLeft: detectContentLanguage === "ar" ? "0" : "1.5rem",
              }}
            >
              {summaryArray.map((point, idx) => (
                <li key={idx} style={{ textAlign: displayTextAlign }}>{point}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
