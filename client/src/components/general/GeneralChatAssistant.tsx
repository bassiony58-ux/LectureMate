import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Send, Sparkles, X, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface Message {
  id: number;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

export function GeneralChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: 1, 
      role: "ai", 
      content: "مرحباً! أنا مساعد LectureMate. يمكنني مساعدتك في أي استفسار عام حول الموقع أو كيفية استخدامه. كيف يمكنني مساعدتك اليوم؟",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { language } = useLanguage();

  const t = {
    welcome: language === "ar" 
      ? "مرحباً! أنا مساعد LectureMate. يمكنني مساعدتك في أي استفسار عام حول الموقع أو كيفية استخدامه. كيف يمكنني مساعدتك اليوم؟"
      : "Hello! I'm LectureMate assistant. I can help you with any general questions about the site or how to use it. How can I help you today?",
    placeholder: language === "ar" 
      ? "اسأل عن أي شيء..."
      : "Ask anything...",
    sending: language === "ar" ? "جاري الإرسال..." : "Sending...",
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { 
      id: Date.now(), 
      role: "user", 
      content: input,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    const question = input;
    setInput("");
    setIsLoading(true);

    try {
      // Call backend API for Gemini response
      const response = await fetch("/api/chat/general", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          question,
          language: language === "ar" ? "arabic" : "english"
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const aiMsg: Message = { 
        id: Date.now() + 1, 
        role: "ai", 
        content: data.response || "Sorry, I couldn't generate a response.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error: any) {
      console.error("[GeneralChatAssistant] Error:", error);
      const errorMsg: Message = { 
        id: Date.now() + 1, 
        role: "ai", 
        content: language === "ar" 
          ? "عذراً، حدث خطأ. يرجى المحاولة مرة أخرى."
          : "Sorry, an error occurred. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-8 w-96 h-[500px] bg-card border shadow-2xl rounded-xl z-50 flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b bg-primary/5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-semibold">LectureMate Assistant</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <Avatar className="w-8 h-8 border">
                      {msg.role === "ai" ? (
                        <>
                          <AvatarImage src="/bot-avatar.png" />
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            <Sparkles className="w-4 h-4" />
                          </AvatarFallback>
                        </>
                      ) : (
                        <>
                          <AvatarImage src="https://github.com/shadcn.png" />
                          <AvatarFallback>ME</AvatarFallback>
                        </>
                      )}
                    </Avatar>
                    <div
                      className={`rounded-lg p-3 text-sm max-w-[80%] ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <Avatar className="w-8 h-8 border">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <Sparkles className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg p-3 text-sm bg-muted flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t.sending}</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <form onSubmit={handleSend} className="flex gap-2">
                <Input 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t.placeholder}
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button type="submit" size="icon" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-xl z-50"
        size="icon"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </Button>
    </>
  );
}
