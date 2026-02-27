import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Image as ImageIcon, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface ImagesViewProps {
    lectureId: string;
    images: { url: string; description: string; analyzed?: boolean }[];
    onAnalysisRequested?: (imgUrl: string) => void;
}

export function ImagesView({ lectureId, images, onAnalysisRequested }: ImagesViewProps) {
    const { language } = useLanguage();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const t = {
        title: language === "ar" ? "الصور المستخرجة" : "Extracted Images",
        subtitle: language === "ar" ? "تم استخراج هذه الصور من المستند" : "These images were extracted from the document",
        analyze: language === "ar" ? "تحليل بالذكاء الاصطناعي" : "Analyze with AI",
        noImages: language === "ar" ? "لم يتم العثور على صور" : "No images found",
    };

    if (!images || images.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border-2 border-dashed rounded-xl border-border/50">
                <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-primary/50" />
                </div>
                <p className="text-lg font-medium">{t.noImages}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <ImageIcon className="w-6 h-6 text-primary" />
                    {t.title}
                </h2>
                <p className="text-muted-foreground mt-1">{t.subtitle}</p>
            </div>

            <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                {images.map((img, idx) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx}
                        className="break-inside-avoid"
                    >
                        <Card className="overflow-hidden hover:shadow-md transition-shadow">
                            <div
                                className="w-full bg-muted relative cursor-pointer"
                                onClick={() => setSelectedImage(img.url)}
                            >
                                <img
                                    src={img.url}
                                    alt={`Extracted from document`}
                                    className="w-full object-contain max-h-[300px] hover:scale-105 transition-transform duration-300"
                                />
                            </div>
                            <CardContent className="p-4 flex flex-col">
                                <div>
                                    {img.description ? (
                                        <p className="text-sm text-foreground/80 leading-relaxed mb-4 whitespace-pre-wrap">
                                            {img.description}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic mb-4">
                                            {language === "ar" ? "لم يتم تحليل هذه الصورة بعد الإستخراج." : "This image has not been analyzed yet."}
                                        </p>
                                    )}
                                </div>
                                {!img.description && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full gap-2 mt-auto"
                                        onClick={() => onAnalysisRequested?.(img.url)}
                                    >
                                        <Sparkles className="w-4 h-4 text-primary" />
                                        {t.analyze}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setSelectedImage(null)}
                    >
                        <motion.img
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            src={selectedImage}
                            alt="Fullscreen view"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                            variant="secondary"
                            size="icon"
                            className="absolute top-4 right-4 rounded-full"
                            onClick={() => setSelectedImage(null)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
