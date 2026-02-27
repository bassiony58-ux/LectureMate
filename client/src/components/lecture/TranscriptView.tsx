import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Download, Copy, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import { useLanguage } from "@/contexts/LanguageContext";
import html2canvas from "html2canvas";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface TranscriptViewProps {
  text: string;
  title?: string;
}

export function TranscriptView({ text, title }: TranscriptViewProps) {
  const { toast } = useToast();
  const { language } = useLanguage();

  const defaultTitle = language === "ar" ? "النص الكامل" : "Transcript";
  const displayTitle = title || defaultTitle;

  const t = {
    fullTranscript: language === "ar" ? "النص الكامل" : "Full Transcript",
    copy: language === "ar" ? "نسخ" : "Copy",
    exportPDF: language === "ar" ? "تصدير PDF" : "Export PDF",
    noTranscript: language === "ar" ? "لا يوجد نص متاح." : "No transcript available.",
    toast: {
      copied: language === "ar" ? "تم النسخ" : "Copied to clipboard",
      copiedDesc: language === "ar" ? "تم نسخ النص إلى الحافظة." : "The transcript has been copied to your clipboard.",
      exported: language === "ar" ? "تم تصدير PDF" : "PDF exported",
      exportedDesc: language === "ar" ? "تم تصدير النص كملف PDF." : "The transcript has been exported as PDF.",
      exportFailed: language === "ar" ? "فشل التصدير" : "Export failed",
      exportFailedDesc: language === "ar" ? "فشل تصدير PDF. يرجى المحاولة مرة أخرى." : "Failed to export PDF. Please try again.",
    },
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    toast({
      title: t.toast.copied,
      description: t.toast.copiedDesc,
    });
  };

  const handleExportPDF = async () => {
    try {
      // Check if text contains Arabic characters
      const hasArabic = /[\u0600-\u06FF]/.test(text || displayTitle);
      const dir = hasArabic ? "rtl" : "ltr";
      const textAlign = hasArabic ? "right" : "left";

      // Site colors
      const primaryColor = "#8B5CF6"; // Violet primary
      const primaryDark = "#7C3AED"; // Darker violet
      const textColor = "#0A0A0B"; // Dark foreground
      const mutedText = "#6B7280"; // Muted text
      const borderColor = "#E4E4E7"; // Border color
      const bgColor = "#FFFFFF"; // White background
      const mutedBg = "#F4F4F5"; // Muted background

      // Create HTML content
      const htmlContent = `
        <div style="font-family: 'Tajawal', Arial, sans-serif; direction: ${dir}; color: ${textColor}; line-height: 1.8; padding: 20px; background-color: ${bgColor};">
          <div style="text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid ${primaryColor};">
            <h1 style="font-size: 24px; font-weight: bold; color: ${primaryColor}; margin: 0;">
              ${displayTitle}
            </h1>
            <p style="font-size: 9px; color: ${mutedText}; margin-top: 10px;">
              ${language === "ar" ? "تم التصدير بواسطة LectureMate" : "Exported by LectureMate"} • ${new Date().toLocaleDateString(language === "ar" ? "ar-EG" : "en-US")}
            </p>
          </div>
          <div style="margin-bottom: 20px;">
            <h2 style="font-size: 18px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px; margin-bottom: 10px; text-align: ${textAlign};">
              ${language === "ar" ? "📄 النص الكامل" : "📄 Full Transcript"}
            </h2>
            <div style="font-size: 11px; text-align: justify; line-height: 1.8; padding: 10px; background-color: ${mutedBg}; color: ${textColor};">
              ${(text || t.noTranscript).replace(/\n/g, "<br>")}
            </div>
          </div>
          <div style="margin-top: 30px; padding-top: 15px; border-top: 2px solid ${borderColor}; text-align: center;">
            <p style="font-size: 9px; color: ${mutedText};">
              ${language === "ar"
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
      const filename = `${displayTitle.replace(/[^a-z0-9\u0600-\u06FF]/gi, "_")}_transcript.pdf`;
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

  // Detect language from content
  const detectContentLanguage = useMemo(() => {
    const hasArabic = /[\u0600-\u06FF]/.test(text || "");
    return hasArabic ? "ar" : language;
  }, [text, language]);

  // Use UI language for UI elements
  const uiDir = language === "ar" ? "rtl" : "ltr";

  // Use content language for content direction
  const contentDir = detectContentLanguage === "ar" ? "rtl" : "ltr";
  const contentTextAlign = detectContentLanguage === "ar" ? "right" : "left";

  return (
    <div className="space-y-4">
      <div className={`flex items-center justify-between mb-4 ${language === "ar" ? "flex-row-reverse" : ""}`}>
        <h3 className={`text-lg font-semibold flex items-center gap-2 ${language === "ar" ? "flex-row-reverse" : ""}`}>
          <FileText className="w-5 h-5 text-primary" />
          {t.fullTranscript}
        </h3>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.copy}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className={`w-4 h-4 ${language === "ar" ? "ml-2" : "mr-2"}`} />
            {t.exportPDF}
          </Button>
        </div>
      </div>

      <div
        className="bg-card rounded-xl border shadow-sm p-8 font-serif leading-relaxed text-lg text-card-foreground/90 max-w-none"
        dir={contentDir}
        style={{ textAlign: contentTextAlign }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <p className="mb-6 last:mb-0 whitespace-pre-wrap">{children}</p>,
            h1: ({ children }) => <h1 className="text-2xl font-bold my-4 border-b pb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-bold my-3">{children}</h2>,
            h3: ({ children }) => <h3 className="text-lg font-bold my-2">{children}</h3>,
            ul: ({ children }) => <ul className="list-disc ml-6 space-y-2 my-4 opacity-90">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal ml-6 space-y-2 my-4 opacity-90">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/40 pl-4 py-2 italic bg-primary/5 rounded-r my-4">{children}</blockquote>,
            code: ({ inline, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || "");
              if (inline || !match) {
                return (
                  <code className="px-1.5 py-0.5 rounded-md bg-muted text-foreground text-[0.85em] font-mono border" {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <div className="my-6 rounded-lg overflow-hidden border bg-muted shadow-sm max-w-full" dir="ltr">
                  <div className="text-sm font-mono leading-relaxed overflow-x-auto p-4 custom-scrollbar">
                    <code>{String(children).replace(/\n$/, "")}</code>
                  </div>
                </div>
              );
            },
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
