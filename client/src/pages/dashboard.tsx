import { AppLayout } from "@/components/layout/AppLayout";
import { LectureCard } from "@/components/dashboard/LectureCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, BookOpen, Brain, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLectures } from "@/hooks/useLectures";
import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Dashboard() {
  const { user } = useAuth();
  const { lectures, isLoading } = useLectures();
  const { language } = useLanguage();

  const t = {
    welcome: language === "ar" ? "مرحباً بعودتك" : "Welcome back",
    subtitle:
      language === "ar"
        ? "إليك ما يحدث في رحلة تعلّمك اليوم."
        : "Here's what's happening with your learning today.",
    analyzeNew: language === "ar" ? "حلّل محاضرة جديدة" : "Analyze New Lecture",
    statsTitles:
      language === "ar"
        ? ["إجمالي المحاضرات", "متوسط الاختبارات", "وقت الدراسة", "البطاقات المنشأة"]
        : ["Total Lectures", "Quiz Average", "Study Time", "Cards Created"],
    continueLearning: language === "ar" ? "أكمل التعلّم" : "Continue Learning",
    processingLabel: language === "ar" ? "جاري المعالجة" : "Processing",
    inProgressLabel: language === "ar" ? "قيد التقدّم" : "In Progress",
    processingText: (progress?: number) =>
      language === "ar"
        ? `جاري المعالجة... ${progress ?? 0}%`
        : `Processing... ${progress ?? 0}% complete`,
    pickUp: language === "ar" ? "أكمل من حيث توقفت." : "Pick up where you left off.",
    continueBtn: language === "ar" ? "متابعة" : "Continue",
    noLecturesTitle: language === "ar" ? "لا توجد محاضرات بعد" : "No lectures yet",
    noLecturesDesc:
      language === "ar"
        ? "ابدأ بتحليل فيديو لتبدأ رحلتك."
        : "Start analyzing a video to get started!",
    recentUploads: language === "ar" ? "الرفع الأخير" : "Recent Uploads",
    viewAll: language === "ar" ? "عرض الكل" : "View All",
  };
  
  const recentLectures = useMemo(() => lectures.slice(0, 2), [lectures]);
  const inProgressLecture = useMemo(() => 
    lectures.find(l => l.status === "processing") || lectures[0], 
    [lectures]
  );

  // Helper function to parse duration string (e.g., "45:20" or "1:23:45") to minutes
  const parseDurationToMinutes = (duration: string): number => {
    if (!duration || duration === "0:00") return 0;
    
    const parts = duration.split(":").map(Number);
    
    if (parts.length === 2) {
      // Format: MM:SS or HH:MM
      const [first, second] = parts;
      // If first part > 60, it's likely HH:MM format, otherwise MM:SS
      if (first > 60) {
        return first * 60 + second; // HH:MM format
      } else {
        return first + second / 60; // MM:SS format (convert seconds to minutes)
      }
    } else if (parts.length === 3) {
      // Format: HH:MM:SS
      const [hours, minutes, seconds] = parts;
      return hours * 60 + minutes + seconds / 60;
    }
    
    return 0;
  };

  // Helper function to format minutes to "Xh Ym" format
  const formatStudyTime = (totalMinutes: number): string => {
    if (totalMinutes === 0) return "0h 0m";
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    
    if (hours === 0) {
      return `${minutes}m`;
    } else if (minutes === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h ${minutes}m`;
    }
  };

  const stats = useMemo(() => {
    const totalLectures = lectures.length;
    const completedLectures = lectures.filter(l => l.status === "completed").length;
    const totalQuestions = lectures.reduce((sum, l) => sum + (l.questions?.length || 0), 0);
    const totalCards = lectures.reduce((sum, l) => sum + (l.slides?.length || 0), 0);
    
    // Calculate total study time from completed lectures
    const totalStudyMinutes = lectures
      .filter(l => l.status === "completed" && l.duration)
      .reduce((sum, l) => sum + parseDurationToMinutes(l.duration || "0:00"), 0);
    
    const studyTimeFormatted = formatStudyTime(totalStudyMinutes);
    
    return [
      { title: t.statsTitles[0], value: totalLectures.toString(), icon: BookOpen, color: "text-blue-500", bg: "bg-blue-500/10" },
      { title: t.statsTitles[1], value: completedLectures > 0 && totalLectures > 0 ? `${Math.round((completedLectures / totalLectures) * 100)}%` : "0%", icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" },
      { title: t.statsTitles[2], value: studyTimeFormatted, icon: Clock, color: "text-violet-500", bg: "bg-violet-500/10" },
      { title: t.statsTitles[3], value: totalCards.toString(), icon: Brain, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];
  }, [lectures, t.statsTitles]);

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t.welcome}, {user?.displayName || (language === "ar" ? "مستخدم" : "User")}! 👋
            </h1>
            <p className="text-muted-foreground mt-1">{t.subtitle}</p>
          </div>
          <Link href="/">
            <Button className="bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Sparkles className="w-4 h-4 mr-2" />
              {t.analyzeNew}
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i} className="border shadow-sm">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-2">
                <div className={`p-3 rounded-full ${stat.bg} ${stat.color} mb-2`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <span className="text-2xl font-bold">{stat.value}</span>
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.title}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Continue Learning Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              {t.continueLearning}
            </h2>
          </div>
          {inProgressLecture ? (
            <Link href={`/lecture/${inProgressLecture.id}`}>
              <div className="bg-card border rounded-xl p-6 flex flex-col md:flex-row gap-6 items-center shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                <div className="relative w-full md:w-64 aspect-video rounded-lg overflow-hidden flex-shrink-0">
                  <img 
                    src={inProgressLecture.thumbnailUrl || ""} 
                    alt={inProgressLecture.title || "Lecture"}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                    {inProgressLecture.duration || "0:00"}
                  </div>
                </div>
                <div className="flex-1 space-y-3 w-full">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded uppercase">
                      {inProgressLecture.status === "processing" ? t.processingLabel : t.inProgressLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">{inProgressLecture.date}</span>
                  </div>
                  <h3 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors">
                    {inProgressLecture.title}
                  </h3>
                  <p className="text-muted-foreground text-sm line-clamp-2">
                    {inProgressLecture.status === "processing" 
                      ? t.processingText(inProgressLecture.progress)
                      : t.pickUp}
                  </p>
                  {inProgressLecture.progress !== undefined && (
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div className="bg-primary h-full" style={{ width: `${inProgressLecture.progress}%` }} />
                    </div>
                  )}
                </div>
                <Button size="lg" className="shrink-0 w-full md:w-auto">
                  {t.continueBtn}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </Link>
          ) : (
            <div className="bg-card border rounded-xl p-6 flex items-center justify-center min-h-[200px]">
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-lg font-medium mb-2">{t.noLecturesTitle}</p>
                <p className="text-sm">{t.noLecturesDesc}</p>
                <Link href="/">
                  <Button className="mt-4">
                    <Sparkles className="w-4 h-4 mr-2" />
                    {t.analyzeNew}
                  </Button>
                </Link>
              </div>
          </div>
          )}
        </section>

        {/* Recent Activity */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t.recentUploads}</h2>
            <Link href="/history">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                {t.viewAll}
                <ArrowRight className="ml-1 w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentLectures.map((lecture) => (
              <LectureCard key={lecture.id} lecture={lecture} />
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
