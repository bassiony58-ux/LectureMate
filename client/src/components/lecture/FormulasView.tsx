import { useState, useEffect, useRef } from "react";
import { Formula } from "@/lib/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Sigma, BookOpen, Info, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FormulasViewProps {
    formulas: Formula[];
}

export function FormulasView({ formulas }: FormulasViewProps) {
    const { toast } = useToast();
    const { language } = useLanguage();
    const [selectedFormula, setSelectedFormula] = useState<Formula | null>(null);

    const t = {
        emptyTitle: language === "ar" ? "لا توجد قوانين أو معادلات" : "No Formulas Found",
        emptyDesc: language === "ar"
            ? "لم يتم العثور على أي قوانين أو معادلات رياضية في هذه المحاضرة."
            : "No mathematical formulas or laws were found in this lecture.",
        copySuccess: language === "ar" ? "تم نسخ المعادلة بنجاح" : "Formula Copied",
        copySuccessDesc: language === "ar" ? "تم نسخ رمز LaTeX إلى الحافظة." : "LaTeX code copied to clipboard.",
        category: language === "ar" ? "التصنيف" : "Category",
        description: language === "ar" ? "الشرح" : "Description",
    };

    const copyToClipboard = (text: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast({
            title: t.copySuccess,
            description: t.copySuccessDesc,
            duration: 3000,
        });
    };

    if (!formulas || formulas.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center space-y-6">
                <div className="bg-primary/5 rounded-full p-8 relative">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                    <Sigma className="w-16 h-16 text-primary relative z-10" />
                </div>
                <div className="max-w-md space-y-2">
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                        {t.emptyTitle}
                    </h3>
                    <p className="text-muted-foreground">{t.emptyDesc}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {formulas.map((item, index) => (
                    <FormulaCard
                        key={item.id || index}
                        formula={item}
                        index={index}
                        language={language}
                        onCopy={copyToClipboard}
                        onClick={() => setSelectedFormula(item)}
                    />
                ))}
            </div>

            <AnimatePresence>
                {selectedFormula && (
                    <Dialog open={!!selectedFormula} onOpenChange={(open) => !open && setSelectedFormula(null)}>
                        <DialogContent className="max-w-[95vw] sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl border-2 overflow-hidden p-0 gap-0">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 -z-10" />

                            <div className="p-6 border-b bg-card/50 backdrop-blur-sm shadow-sm flex items-start justify-between">
                                <div className="space-y-1">
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <Sigma className="w-5 h-5 text-primary" />
                                        {selectedFormula.name}
                                    </h2>
                                    {selectedFormula.category && (
                                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                                            {selectedFormula.category}
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 sm:p-8 bg-black/5 dark:bg-black/20 relative group">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 hover:bg-background"
                                    onClick={(e) => copyToClipboard(selectedFormula.formula, e)}
                                >
                                    <Copy className="w-4 h-4 text-muted-foreground" />
                                </Button>
                                <div className="overflow-x-auto w-full pb-2 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                                    <div className="min-w-fit flex items-center justify-center px-4 py-6">
                                        <KaTeXMath formula={selectedFormula.formula} displayMode={true} />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-card space-y-4">
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <h4 className="font-semibold text-sm text-foreground">{t.description}</h4>
                                        <div className="text-sm text-muted-foreground leading-relaxed">
                                            <TextWithMath text={selectedFormula.description} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </AnimatePresence>
        </div>
    );
}

function FormulaCard({
    formula,
    index,
    language,
    onCopy,
    onClick
}: {
    formula: Formula;
    index: number;
    language: string;
    onCopy: (text: string, e: React.MouseEvent) => void;
    onClick: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.4 }}
            className="group relative h-full"
        >
            <Card className="h-full flex flex-col border-2 border-transparent hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 overflow-hidden bg-gradient-to-br from-card via-card to-card">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                <CardHeader className="pb-4 relative z-10 flex-row items-start justify-between space-y-0 cursor-pointer" onClick={onClick}>
                    <div className="space-y-1.5 flex-1 pr-4">
                        <CardTitle className="text-lg font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2" title={formula.name}>
                            {formula.name}
                        </CardTitle>
                        {formula.category && (
                            <Badge variant="outline" className="bg-background/50 text-xs font-medium backdrop-blur-sm border-primary/20">
                                <BookOpen className="w-3 h-3 mr-1 text-primary" />
                                {formula.category}
                            </Badge>
                        )}
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCopy(formula.formula, e);
                            }}
                            title={language === "ar" ? "نسخ LaTeX" : "Copy LaTeX"}
                        >
                            <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10"
                            title={language === "ar" ? "تكبير" : "Expand"}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClick();
                            }}
                        >
                            <Maximize2 className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4 flex-1 flex flex-col relative z-10 pb-6 overflow-hidden">
                    <div
                        className="bg-black/5 dark:bg-black/20 rounded-xl p-4 flex items-center justify-center min-h-[100px] border border-black/5 dark:border-white/5 relative group/math"
                        style={{ width: "100%" }}
                    >
                        <div className="overflow-x-auto w-full text-center pb-2 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent hover:scrollbar-thumb-primary/40" style={{ maxWidth: "100%" }}>
                            <div className="min-w-fit px-2 inline-block">
                                <KaTeXMath formula={formula.formula} />
                            </div>
                        </div>
                    </div>

                    <div
                        className="text-sm line-clamp-3 leading-relaxed flex-1 pt-2 border-t text-muted-foreground group-hover:text-foreground/80 transition-colors cursor-pointer"
                        onClick={onClick}
                    >
                        <TextWithMath text={formula.description} />
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

export function TextWithMath({ text }: { text: string }) {
    if (!text) return null;

    // 1. Convert `$ ... $` to `\( ... \)`
    let processed = text.replace(/\$([^\$]+)\$/g, '\\($1\\)');

    // 2. Fix double escaped slashes Gemini sometimes outputs
    processed = processed.replace(/\\\\/g, '\\');

    // Finally split by \( ... \)
    const parts = processed.split(/\\\((.*?)\\\)/g);

    return (
        <span className="leading-loose" dir="auto">
            {parts.map((part, i) => {
                if (i % 2 === 0) {
                    return <span key={i}>{part}</span>;
                } else {
                    return <KaTeXMath key={`math-${i}`} formula={part} displayMode={false} />;
                }
            })}
        </span>
    );
}

function KaTeXMath({ formula, displayMode = false }: { formula: string, displayMode?: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                katex.render(formula, containerRef.current, {
                    displayMode,
                    throwOnError: false,
                    errorColor: "#ef4444",
                    strict: false,
                    trust: true,
                    output: "htmlAndMathml",
                });
            } catch (error) {
                console.error("KaTeX rendering error:", error);
                containerRef.current.textContent = formula; // Fallback to raw text
            }
        }
    }, [formula, displayMode]);

    if (displayMode) {
        return <div ref={containerRef} className="text-xl text-center py-4" />;
    }

    return <span ref={containerRef} className="text-base inline-block px-1" dir="ltr" />;
}
