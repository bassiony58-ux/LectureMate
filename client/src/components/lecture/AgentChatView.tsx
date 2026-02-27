import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Sparkles, Loader2, Bot, User, CornerDownLeft, Copy, Check } from "lucide-react";
import { chatWithAgent } from "@/lib/aiService";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";


// Custom renderer for code blocks in markdown
const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const languageMatch = match ? match[1] : "";
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const text = typeof children === 'string' ? children : String(children);
        navigator.clipboard.writeText(text.replace(/\n$/, ""));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!inline) {
        return (
            <div className="my-6 rounded-xl overflow-hidden border border-zinc-800 bg-[#000000] shadow-2xl max-w-full" dir="ltr">
                <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] border-b border-white/5">
                    <span className="text-xs font-mono font-medium text-zinc-400 capitalize flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        {languageMatch || "code"}
                    </span>
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-md hover:bg-white/10 text-zinc-500 hover:text-white transition-all"
                        title="Copy code"
                        type="button"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>
                <div className="text-sm font-mono leading-relaxed overflow-x-auto custom-scrollbar">
                    <SyntaxHighlighter
                        language={languageMatch || 'javascript'}
                        style={vscDarkPlus}
                        customStyle={{
                            margin: 0,
                            padding: '1.25rem',
                            background: '#000000',
                            fontSize: '0.9rem',
                            lineHeight: '1.6',
                        }}
                    >
                        {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                </div>
            </div>
        );
    }

    // Inline code styling
    return (
        <code className={`px-1.5 py-0.5 mx-0.5 rounded-md bg-primary/10 text-primary text-[0.85em] font-mono border border-primary/20 ${className || ""}`} {...props}>
            {children}
        </code>
    );
};


export function AgentChatView({ transcript, title, mode = "api" }: { transcript: string, title: string, mode?: "gpu" | "api" }) {
    const { language } = useLanguage();
    const [messages, setMessages] = useState<{ id: number; role: "user" | "ai"; content: string }[]>([
        { id: 1, role: "ai", content: language === "ar" ? "أهلاً! أنا الوكيل الذكي الخاص بك. لقد قرأت المحاضرة، كيف يمكنني مساعدتك اليوم؟" : "Hi! I'm your Smart Agent. I've read the lecture. How can I help you today?" }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            requestAnimationFrame(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            });
        }
    }, [messages, isLoading]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = { id: Date.now(), role: "user" as const, content: input.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const history = messages
                .filter(m => m.id !== 1)
                .map(m => ({ role: m.role, content: m.content }));

            const reply = await chatWithAgent(transcript, userMsg.content, history, mode);

            setMessages(prev => [...prev, { id: Date.now(), role: "ai", content: reply }]);
        } catch (error) {
            setMessages(prev => [...prev, { id: Date.now(), role: "ai", content: language === "ar" ? "عذراً، حدث خطأ أثناء معالجة طلبك الرجاء المحاولة مرة أخرى." : "Sorry, an error occurred while processing your request. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!transcript || transcript.length < 50) {
        return (
            <div className="flex flex-col items-center justify-center p-12 min-h-[400px] border border-dashed rounded-xl bg-card/30">
                <div className="bg-primary/10 p-4 rounded-full mb-4">
                    <MessageSquare className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{language === "ar" ? "الوكيل الذكي غير متاح بعد" : "Smart Agent not available yet"}</h3>
                <p className="text-muted-foreground text-center max-w-sm">
                    {language === "ar"
                        ? "ميزة المحادثة الذكية تعمل فقط بعد أن يتم استخراج نص المحاضرة."
                        : "The smart agent only works when the lecture transcript is available."}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-350px)] min-h-[400px] border rounded-2xl overflow-hidden bg-background shadow-lg relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5 pointer-events-none" />

            {/* Header */}
            <div className="p-4 border-b bg-background dark:bg-card flex flex-row items-center gap-3 z-40 shrink-0 relative shadow-sm">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-md" />
                    <div className="relative bg-gradient-to-br from-primary to-primary-foreground p-2 rounded-xl shadow-md border border-primary/20">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                </div>
                <div>
                    <h2 className="font-bold text-foreground bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70">
                        {language === "ar" ? "الوكيل الذكي" : "Smart Agent"}
                    </h2>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        {language === "ar" ? "متصل ومستعد للمساعدة" : "Online and ready to help"}
                    </p>
                </div>
            </div>

            {/* Chat Area - ABSOLUTE CONTAINMENT */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 bg-white/50 dark:bg-zinc-950/30 px-4 py-8"
            >
                <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 w-full items-start ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            dir={language === "ar" ? "rtl" : "ltr"}
                        >
                            <div className="flex-shrink-0 mt-1">
                                {msg.role === "ai" ? (
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shadow-sm border border-primary/10 text-primary">
                                        <Sparkles className="w-4 h-4" />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border flex items-center justify-center shadow-sm">
                                        <User className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                            <div
                                className={`p-4 text-sm max-w-[85%] flex flex-col gap-1.5 shadow-md border ${msg.role === "user"
                                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none whitespace-pre-wrap border-primary"
                                    : "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-none"
                                    } `}
                            >
                                {msg.role === "ai" ? (
                                    <div className="flex flex-col gap-2 leading-relaxed max-w-full text-sm overflow-hidden">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkMath]}
                                            rehypePlugins={[rehypeKatex]}
                                            components={{
                                                code: CodeBlock,
                                                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed break-words">{children}</p>,
                                                ul: ({ children }) => <ul className="list-disc ml-4 space-y-1 my-2 marker:text-primary">{children}</ul>,
                                                ol: ({ children }) => <ol className="list-decimal ml-4 space-y-1 my-2 marker:text-primary">{children}</ol>,
                                                li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
                                                h1: ({ children }) => <h1 className="text-lg font-bold my-3 border-b pb-1">{children}</h1>,
                                                h2: ({ children }) => <h2 className="text-base font-bold my-2">{children}</h2>,
                                                h3: ({ children }) => <h3 className="text-sm font-bold my-1">{children}</h3>,
                                                blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/20 pl-4 py-1 italic bg-primary/5 rounded-r-md my-2">{children}</blockquote>,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                                )}
                                <span className={`text-[10px] opacity-50 mt-1 ${msg.role === "user" ? "text-primary-foreground/80 self-end" : "self-end"}`}>
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className={`flex gap-3 w-full items-start ${language === "ar" ? "flex-row" : "flex-row"}`} dir={language === "ar" ? "rtl" : "ltr"}>
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1 border border-primary/10">
                                <Bot className="w-4 h-4 text-primary animate-pulse" />
                            </div>
                            <div className="rounded-2xl rounded-tl-none p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-2 max-w-[85%]">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-zinc-500 dark:text-zinc-400 text-xs font-medium ml-1">{language === "ar" ? "يتم التحضير..." : "Thinking..."}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-card border-t z-40 shrink-0 relative mt-auto">
                <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex items-end gap-2" dir={language === "ar" ? "rtl" : "ltr"}>
                    <div className="relative flex-1 bg-background rounded-2xl border shadow-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all overflow-hidden flex items-center p-1">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={language === "ar" ? "اسأل عن المحاضرة أو أي موضوع آخر..." : "Ask about the lecture or anything else..."}
                            className="border-0 bg-transparent ring-0 focus-visible:ring-0 shadow-none px-4 py-6"
                            disabled={isLoading}
                        />
                        <div className="px-2">
                            <Button
                                type="submit"
                                size="icon"
                                disabled={isLoading || !input.trim()}
                                className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md transition-all hover:scale-105 disabled:hover:scale-100 disabled:opacity-50"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CornerDownLeft className={`w-5 h-5 ${language === "ar" ? "rotate-90" : "-rotate-90"}`} strokeWidth={2.5} />}
                            </Button>
                        </div>
                    </div>
                </form>
                <p className="text-center text-[10px] text-muted-foreground mt-3">
                    {language === "ar" ? "الوكيل قد يرتكب أخطاء. الرجاء التحقق من المعلومات المهمة." : "Agent can make mistakes. Consider verifying important information."}
                </p>
            </div>
        </div>
    );
}
