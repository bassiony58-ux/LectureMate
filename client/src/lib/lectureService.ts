import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Lecture, Question, Slide, Flashcard } from "./mockData";

// Helper to remove undefined values recursively (Firestore doesn't allow undefined)
function cleanData(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => cleanData(v));
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Timestamp)) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, cleanData(v)])
    );
  }
  return obj;
}

// Convert Firestore data to Lecture format
function firestoreToLecture(docData: any, id: string): Lecture {
  return {
    id,
    title: docData.title || "",
    thumbnailUrl: docData.thumbnailUrl || "",
    duration: docData.duration || "0:00",
    date: docData.date || new Date().toLocaleDateString(),
    status: docData.status || "processing",
    progress: docData.progress,
    summary: docData.summary || (typeof docData.summary === "string" ? docData.summary : []),
    transcript: docData.transcript || "",
    questions: docData.questions || [],
    quiz_sets: docData.quiz_sets || undefined, // Read quiz_sets from Firestore
    slides: docData.slides || [],
    flashcards: docData.flashcards || [],
    modelType: docData.modelType || undefined, // Read modelType from Firestore
    category: docData.category || undefined, // Read category from Firestore
  };
}

// Convert Lecture to Firestore format (for creation)
function lectureToFirestore(lecture: Partial<Lecture>): any {
  const data: any = {};

  // Only include fields that are explicitly provided (not undefined or null)
  if (lecture.title !== undefined && lecture.title !== null) data.title = lecture.title;
  if (lecture.thumbnailUrl !== undefined && lecture.thumbnailUrl !== null) data.thumbnailUrl = lecture.thumbnailUrl;
  if (lecture.duration !== undefined && lecture.duration !== null) data.duration = lecture.duration;
  if (lecture.date !== undefined && lecture.date !== null) data.date = lecture.date;
  if (lecture.status !== undefined && lecture.status !== null) data.status = lecture.status;
  if (lecture.progress !== undefined && lecture.progress !== null) data.progress = lecture.progress;
  if (lecture.summary !== undefined && lecture.summary !== null) data.summary = lecture.summary;
  if (lecture.transcript !== undefined && lecture.transcript !== null) data.transcript = lecture.transcript;
  if (lecture.questions !== undefined && lecture.questions !== null) data.questions = lecture.questions;
  if (lecture.quiz_sets !== undefined && lecture.quiz_sets !== null) data.quiz_sets = lecture.quiz_sets;
  if (lecture.slides !== undefined && lecture.slides !== null) data.slides = lecture.slides;
  if (lecture.flashcards !== undefined && lecture.flashcards !== null) data.flashcards = lecture.flashcards;
  if (lecture.modelType !== undefined && lecture.modelType !== null) data.modelType = lecture.modelType;
  if (lecture.category !== undefined && lecture.category !== null) data.category = lecture.category;

  return data;
}

// Convert updates to Firestore format (for updates)
function updatesToFirestore(updates: Partial<Lecture>): any {
  const data: any = {};

  // Only include fields that are explicitly provided (not undefined)
  if (updates.title !== undefined && updates.title !== null) data.title = updates.title;
  if (updates.thumbnailUrl !== undefined && updates.thumbnailUrl !== null) data.thumbnailUrl = updates.thumbnailUrl;
  if (updates.duration !== undefined && updates.duration !== null) data.duration = updates.duration;
  if (updates.date !== undefined && updates.date !== null) data.date = updates.date;
  if (updates.status !== undefined && updates.status !== null) data.status = updates.status;
  if (updates.progress !== undefined && updates.progress !== null) data.progress = updates.progress;
  if (updates.summary !== undefined && updates.summary !== null) data.summary = updates.summary;
  if (updates.transcript !== undefined && updates.transcript !== null) data.transcript = updates.transcript;
  if (updates.questions !== undefined && updates.questions !== null) data.questions = updates.questions;
  if (updates.quiz_sets !== undefined && updates.quiz_sets !== null) data.quiz_sets = updates.quiz_sets;
  if (updates.slides !== undefined && updates.slides !== null) data.slides = updates.slides;
  if (updates.flashcards !== undefined && updates.flashcards !== null) data.flashcards = updates.flashcards;
  if (updates.modelType !== undefined && updates.modelType !== null) data.modelType = updates.modelType;
  if (updates.category !== undefined && updates.category !== null) data.category = updates.category;

  // Always update the updatedAt timestamp
  data.updatedAt = Timestamp.now();

  return data;
}

export const lectureService = {
  // Get all lectures for a user
  async getUserLectures(userId: string): Promise<Lecture[]> {
    try {
      const lecturesRef = collection(db, "users", userId, "lectures");
      const q = query(lecturesRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((doc) =>
        firestoreToLecture(doc.data(), doc.id)
      );
    } catch (error) {
      console.error("Error fetching lectures:", error);
      return [];
    }
  },

  // Get a single lecture
  async getLecture(userId: string, lectureId: string): Promise<Lecture | null> {
    try {
      const lectureRef = doc(db, "users", userId, "lectures", lectureId);
      const snapshot = await getDoc(lectureRef);

      if (snapshot.exists()) {
        return firestoreToLecture(snapshot.data(), snapshot.id);
      }
      return null;
    } catch (error) {
      console.error("Error fetching lecture:", error);
      return null;
    }
  },

  // Create a new lecture
  async createLecture(
    userId: string,
    lecture: Partial<Lecture>
  ): Promise<string> {
    try {
      const lecturesRef = collection(db, "users", userId, "lectures");
      const data = cleanData(lectureToFirestore(lecture));
      // Add timestamps for new documents
      data.createdAt = Timestamp.now();
      data.updatedAt = Timestamp.now();
      // Set defaults for required fields
      if (!data.date) data.date = new Date().toLocaleDateString();
      if (!data.status) data.status = "processing";
      const docRef = await addDoc(lecturesRef, data);
      return docRef.id;
    } catch (error) {
      console.error("Error creating lecture:", error);
      throw error;
    }
  },

  // Update a lecture
  async updateLecture(
    userId: string,
    lectureId: string,
    updates: Partial<Lecture>
  ): Promise<void> {
    try {
      // Validate inputs
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId");
      }
      if (!lectureId || typeof lectureId !== "string") {
        throw new Error("Invalid lectureId");
      }

      const lectureRef = doc(db, "users", userId, "lectures", lectureId);
      const data = cleanData(updatesToFirestore(updates));

      console.log(`[lectureService] Updating lecture ${lectureId}:`, {
        userId,
        updates: Object.keys(updates),
        dataKeys: Object.keys(data),
        hasTranscript: !!data.transcript,
        transcriptLength: data.transcript?.length || 0
      });

      // Ensure data is not empty
      if (Object.keys(data).length === 0) {
        console.warn("[lectureService] No updates provided");
        return;
      }

      await updateDoc(lectureRef, data);
      console.log(`[lectureService] Lecture ${lectureId} updated successfully`);
    } catch (error: any) {
      console.error("[lectureService] Error updating lecture:", error);
      if (error.code === 'permission-denied') {
        console.error("[lectureService] Permission denied! Check your Firestore rules. Allowed keys: ['title', 'thumbnailUrl', 'duration', 'date', 'status', 'progress', 'summary', 'transcript', 'questions', 'slides', 'flashcards', 'category', 'modelType', 'updatedAt']");
      }
      throw error;
    }
  },

  // Delete a lecture
  async deleteLecture(userId: string, lectureId: string): Promise<void> {
    try {
      const lectureRef = doc(db, "users", userId, "lectures", lectureId);
      await deleteDoc(lectureRef);
    } catch (error) {
      console.error("Error deleting lecture:", error);
      throw error;
    }
  },

  // Search lectures
  async searchLectures(
    userId: string,
    searchTerm: string
  ): Promise<Lecture[]> {
    try {
      const lectures = await this.getUserLectures(userId);
      const term = searchTerm.toLowerCase();
      return lectures.filter(
        (lecture) =>
          lecture.title.toLowerCase().includes(term) ||
          lecture.transcript?.toLowerCase().includes(term)
      );
    } catch (error) {
      console.error("Error searching lectures:", error);
      return [];
    }
  },
};

