import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Video,
  FolderOpen,
  Settings,
  LogOut,
  PlusCircle,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";

export function SidebarContent() {
  const [location] = useLocation();
  const { user } = useAuth();
   const { language, isRTL, toggleLanguage } = useLanguage();

  const t = {
    brand: "LectureMate",
    newAnalysis: language === "ar" ? "تحليل جديد" : "New Analysis",
    dashboard: language === "ar" ? "لوحة التحكم" : "Dashboard",
    history: language === "ar" ? "محاضراتي" : "My Lectures",
    settings: language === "ar" ? "الإعدادات" : "Settings",
    languageShort: language === "ar" ? "عربي" : "EN",
  };

  const links = [
    { href: "/", icon: PlusCircle, label: t.newAnalysis },
    { href: "/dashboard", icon: LayoutDashboard, label: t.dashboard },
    { href: "/history", icon: FolderOpen, label: t.history },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-6">
        <div className={cn("flex items-center justify-between gap-3 text-sidebar-primary mb-8", isRTL && "flex-row-reverse")}>
          <Link href="/" className={cn("flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity", isRTL && "flex-row-reverse")}>
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-white">
            <Video size={18} strokeWidth={3} />
            </div>
            <span className="font-bold text-lg tracking-tight text-sidebar-foreground">
              {t.brand}
            </span>
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full border-sidebar-border"
            onClick={toggleLanguage}
            title={language === "ar" ? "تبديل اللغة" : "Toggle language"}
          >
            <Globe className="w-4 h-4" />
          </Button>
        </div>

        <nav className="space-y-1.5">
          {links.map((link) => {
            const isActive = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-sidebar-primary/10 text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    isRTL && "flex-row-reverse"
                  )}
                >
                  <link.icon size={18} />
                  {link.label}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-6 border-t border-sidebar-border space-y-4">
        <Link href="/profile">
          <div
            className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
            location === "/profile" 
              ? "bg-sidebar-primary/10 text-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isRTL && "flex-row-reverse",
            )}
          >
            <Settings size={18} />
            <span>{t.settings}</span>
          </div>
        </Link>
        
        <Link href="/profile">
          <div
            className={cn(
              "flex items-center gap-3 pt-2 border-t border-sidebar-border/50 cursor-pointer hover:opacity-80 transition-opacity",
              isRTL && "flex-row-reverse",
            )}
          >
            <Avatar className="w-9 h-9 border">
              <AvatarImage src={user?.photoURL || undefined} />
              <AvatarFallback>
                {user?.displayName?.charAt(0).toUpperCase() ||
                  user?.email?.charAt(0).toUpperCase() ||
                  "U"}
              </AvatarFallback>
            </Avatar>
            <div className={cn("flex flex-col min-w-0", isRTL ? "text-right" : "text-left")}>
              <span className="text-sm font-medium text-sidebar-foreground">
                {user?.displayName || "User"}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                {user?.email || "Not signed in"}
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { isRTL } = useLanguage();
  
  return (
    <div className={cn(
      "w-64 h-screen bg-sidebar hidden md:flex flex-col flex-shrink-0 transition-all duration-300",
      isRTL ? "border-l border-sidebar-border" : "border-r border-sidebar-border"
    )}>
      <SidebarContent />
    </div>
  );
}
