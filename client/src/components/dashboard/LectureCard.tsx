import { Lecture } from "@/lib/mockData";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Calendar, ArrowRight, PlayCircle, FileText, Trash2, X, Cpu, Cloud } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { getCategoryInfo } from "@/lib/categoryClassifier";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLectures } from "@/hooks/useLectures";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface LectureCardProps {
  lecture: Lecture;
}

export function LectureCard({ lecture }: LectureCardProps) {
  const { deleteLecture, updateLecture, isDeleting, isUpdating } = useLectures();
  const { toast } = useToast();
  const { language } = useLanguage();
  const [isDeletingLocal, setIsDeletingLocal] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeletingLocal(true);
    try {
      // Stop backend processes first if processing
      if (lecture.status === "processing") {
        try {
          const stopResponse = await fetch(`/api/lecture/${lecture.id}/stop`, {
            method: "POST",
          });
          if (stopResponse.ok) {
            const stopData = await stopResponse.json();
            console.log(`[LectureCard] Stopped ${stopData.stopped || 0} process(es) before deletion`);
          }
        } catch (stopError) {
          console.error("[LectureCard] Error stopping processes before deletion:", stopError);
          // Continue even if stop endpoint fails
        }
      }

      await deleteLecture(lecture.id);
      toast({
        title: "Lecture deleted",
        description: "The lecture has been deleted successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lecture.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingLocal(false);
    }
  };

  const handleStopProcessing = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      // Stop backend processes first
      try {
        const stopResponse = await fetch(`/api/lecture/${lecture.id}/stop`, {
          method: "POST",
        });
        if (stopResponse.ok) {
          const stopData = await stopResponse.json();
          console.log(`[LectureCard] Stopped ${stopData.stopped || 0} process(es)`);
        }
      } catch (stopError) {
        console.error("[LectureCard] Error stopping processes:", stopError);
        // Continue even if stop endpoint fails
      }

      await updateLecture({ lectureId: lecture.id, updates: { status: "failed" } });
      toast({
        title: "Processing stopped",
        description: "The lecture processing has been stopped.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to stop processing.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-all duration-300 group border-border/60 hover:border-primary/50 relative">
      {/* Action buttons - top right */}
      <div className="absolute top-2 right-2 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {lecture.status === "processing" && (
          <Button
            size="icon"
            variant="destructive"
            className="h-8 w-8"
            onClick={handleStopProcessing}
            disabled={isUpdating}
            title="Stop processing"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8"
              onClick={(e) => e.stopPropagation()}
              disabled={isDeleting || isDeletingLocal}
              title="Delete lecture"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the lecture
                "{lecture.title}" and all of its data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Link href={`/lecture/${lecture.id}`} className="block">
        <div className="relative aspect-video overflow-hidden bg-muted">
          <img 
            src={lecture.thumbnailUrl || ""} 
            alt={lecture.title}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
          
          <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
            {lecture.duration || "0:00"}
          </div>
          
          {lecture.status === "processing" && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
              <div className="w-full max-w-[200px] space-y-2">
                <div className="flex justify-between text-xs text-white font-medium">
                  <span>Processing...</span>
                  <span>{lecture.progress || 0}%</span>
                </div>
                <Progress value={lecture.progress || 0} className="h-2 bg-white/20" />
              </div>
            </div>
          )}
        </div>
      </Link>
        
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2 gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={lecture.status === "completed" ? "default" : "secondary"} className="mb-2">
                {lecture.status === "completed" ? "Ready" : "Processing"}
              </Badge>
              {lecture.category && (
                <Badge variant="outline" className="mb-2 text-xs">
                  <span className="mr-1">{getCategoryInfo(lecture.category, language).icon}</span>
                  {getCategoryInfo(lecture.category, language)[language]}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
              <Calendar size={12} />
              {lecture.date}
            </span>
          </div>
          
          <h3 className="font-semibold text-lg leading-tight mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {lecture.title}
          </h3>
        </CardContent>
        
        <CardFooter className="p-4 pt-0 flex justify-between items-center text-sm text-muted-foreground gap-2">
          <div className="flex gap-3 flex-wrap items-center">
            <span className="flex items-center gap-1 text-xs">
              <FileText size={14} /> Transcript
            </span>
            <span className="flex items-center gap-1 text-xs">
              <PlayCircle size={14} /> Quiz
            </span>
            {(lecture.modelType === "gpu" || lecture.modelType === "api") && (
              <span className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md",
                lecture.modelType === "gpu" 
                  ? "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800" 
                  : "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              )}>
                {lecture.modelType === "gpu" ? (
                  <>
                    <Cpu size={12} />
                    LM-Titan (GPU)
                  </>
                ) : (
                  <>
                    <Cloud size={12} />
                    LM-Cloud (API)
                  </>
                )}
              </span>
            )}
          </div>
          <ArrowRight size={16} className={cn(
            "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-primary flex-shrink-0",
            language === "ar" && "translate-x-2 group-hover:translate-x-0"
          )} />
        </CardFooter>
      </Card>
  );
}
