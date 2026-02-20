import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { lectureService } from "@/lib/lectureService";
import type { Lecture } from "@/lib/mockData";

export function useLectures() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: lectures = [],
    isLoading,
    error,
  } = useQuery<Lecture[]>({
    queryKey: ["lectures", user?.uid],
    queryFn: () => {
      if (!user?.uid) return [];
      return lectureService.getUserLectures(user.uid);
    },
    enabled: !!user?.uid,
  });

  const createMutation = useMutation({
    mutationFn: async (lecture: Partial<Lecture>) => {
      if (!user?.uid) throw new Error("User not authenticated");
      const id = await lectureService.createLecture(user.uid, lecture);
      return { ...lecture, id } as Lecture;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lectures", user?.uid] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      lectureId,
      updates,
    }: {
      lectureId: string;
      updates: Partial<Lecture>;
    }) => {
      if (!user?.uid) throw new Error("User not authenticated");
      await lectureService.updateLecture(user.uid, lectureId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lectures", user?.uid] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (lectureId: string) => {
      if (!user?.uid) throw new Error("User not authenticated");
      await lectureService.deleteLecture(user.uid, lectureId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lectures", user?.uid] });
    },
  });

  return {
    lectures,
    isLoading,
    error,
    createLecture: createMutation.mutateAsync,
    updateLecture: updateMutation.mutateAsync,
    deleteLecture: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useLecture(lectureId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: lecture,
    isLoading,
    error,
  } = useQuery<Lecture | null>({
    queryKey: ["lecture", user?.uid, lectureId],
    queryFn: async () => {
      if (!user?.uid || !lectureId) return null;
      const result = await lectureService.getLecture(user.uid, lectureId);
      console.log(`[useLecture] Fetched lecture ${lectureId}:`, {
        hasTranscript: !!result?.transcript,
        transcriptLength: result?.transcript?.length || 0,
        status: result?.status
      });
      return result;
    },
    enabled: !!user?.uid && !!lectureId,
    // Refetch every 2 seconds while processing to get real-time updates
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "processing" ? 2000 : false;
    },
  });

  // Also invalidate when lectures list is updated
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey[0] === "lectures" && event?.query?.queryKey[1] === user?.uid) {
        queryClient.invalidateQueries({ queryKey: ["lecture", user?.uid, lectureId] });
      }
    });
    return unsubscribe;
  }, [queryClient, user?.uid, lectureId]);

  return { lecture, isLoading, error };
}

