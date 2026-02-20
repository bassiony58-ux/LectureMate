import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin if not already initialized
let app;
if (getApps().length === 0) {
  try {
    // Try to use service account key from environment or file
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      path.join(__dirname, "..", "firebase-service-account.json");

    if (existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
      app = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: "lecturemate-project.firebasestorage.app",
      });
      console.log("[Firebase Storage] Initialized with service account key");
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use credentials from environment variable
      app = initializeApp({
        storageBucket: "lecturemate-project.firebasestorage.app",
      });
      console.log("[Firebase Storage] Initialized with GOOGLE_APPLICATION_CREDENTIALS");
    } else {
      // Use Application Default Credentials (for local development or GCP)
      app = initializeApp({
        storageBucket: "lecturemate-project.firebasestorage.app",
      });
      console.log("[Firebase Storage] Initialized with Application Default Credentials");
    }
  } catch (error: any) {
    console.warn("[Firebase Storage] Could not initialize Firebase Admin:", error.message);
    console.warn("[Firebase Storage] Audio files will not be saved to Firebase Storage");
    // Don't throw error, just disable Firebase Storage functionality
    app = null as any;
  }
} else {
  app = getApps()[0];
}

// Get storage bucket (only if app is initialized)
let bucket: any = null;
try {
  if (app) {
    bucket = getStorage(app).bucket();
  }
} catch (error) {
  console.warn("[Firebase Storage] Could not get storage bucket");
}

/**
 * Upload audio file to Firebase Storage
 * @param filePath Local file path to upload
 * @param userId User ID (for organizing files)
 * @param videoId YouTube video ID (for naming)
 * @returns Download URL of uploaded file
 */
export async function uploadAudioToFirebase(
  filePath: string,
  userId: string,
  videoId?: string
): Promise<string> {
  if (!bucket) {
    throw new Error("Firebase Storage is not initialized");
  }

  try {
    const fileName = videoId
      ? `audio/${userId}/${videoId}.mp3`
      : `audio/${userId}/${Date.now()}.mp3`;

    console.log(`[Firebase Storage] Uploading audio file: ${fileName}`);

    await bucket.upload(filePath, {
      destination: fileName,
      metadata: {
        contentType: "audio/mpeg",
        cacheControl: "public, max-age=31536000", // Cache for 1 year
      },
    });

    // Make file publicly accessible
    const file = bucket.file(fileName);
    await file.makePublic();

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    console.log(`[Firebase Storage] File uploaded successfully: ${publicUrl}`);

    return publicUrl;
  } catch (error: any) {
    console.error("[Firebase Storage] Error uploading file:", error);
    throw error;
  }
}

/**
 * Check if audio file exists in Firebase Storage
 * @param userId User ID
 * @param videoId YouTube video ID
 * @returns Download URL if exists, null otherwise
 */
export async function checkAudioExists(
  userId: string,
  videoId: string
): Promise<string | null> {
  if (!bucket) {
    return null; // Return null if Firebase Storage is not available
  }

  try {
    const fileName = `audio/${userId}/${videoId}.mp3`;
    const file = bucket.file(fileName);

    const [exists] = await file.exists();

    if (exists) {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      console.log(`[Firebase Storage] Audio file found: ${publicUrl}`);
      return publicUrl;
    }

    return null;
  } catch (error: any) {
    console.error("[Firebase Storage] Error checking file existence:", error);
    return null;
  }
}

/**
 * Download audio file from Firebase Storage to local temp file
 * @param userId User ID
 * @param videoId YouTube video ID
 * @param localPath Local path to save the file
 */
export async function downloadAudioFromFirebase(
  userId: string,
  videoId: string,
  localPath: string
): Promise<void> {
  if (!bucket) {
    throw new Error("Firebase Storage is not initialized");
  }

  try {
    const fileName = `audio/${userId}/${videoId}.mp3`;
    const file = bucket.file(fileName);

    await file.download({ destination: localPath });
    console.log(`[Firebase Storage] Audio downloaded to: ${localPath}`);
  } catch (error: any) {
    console.error("[Firebase Storage] Error downloading file:", error);
    throw error;
  }
}


