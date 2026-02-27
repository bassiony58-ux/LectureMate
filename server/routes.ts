import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { exec, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, unlinkSync, mkdirSync, readFileSync, copyFileSync } from "fs";
import { createRequire } from "module";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import pptxgen from "pptxgenjs";
import multer from "multer";
import os from "os";
import { uploadAudioToFirebase, checkAudioExists, downloadAudioFromFirebase, uploadImageToFirebase } from "./firebaseStorage";
import youtubedl from "youtube-dl-exec";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const officeParser = require("officeparser");

const execAsync = promisify(exec);

// Process tracking: Map lectureId to child processes that can be killed
interface ProcessInfo {
  process: ChildProcess;
  type: "transcribe" | "download" | "youtube_transcribe";
  startTime: Date;
}

const activeProcesses = new Map<string, ProcessInfo[]>();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const uploadDir = path.join(os.tmpdir(), "lecture-assistant-uploads");
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `audio-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: storageConfig,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept audio and video files
    const allowedMimes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/webm",
      "audio/ogg",
      "audio/m4a",
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
      "audio/x-m4a",
      "audio/mp4",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint"
    ];

    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|doc|pptx|ppt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: audio, video, PDF, Word, PPT.`));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // Serve the local uploads directory for fallback images when Firebase fails
  const localImagesDir = path.join(process.cwd(), "uploads", "images");
  if (!existsSync(localImagesDir)) {
    mkdirSync(localImagesDir, { recursive: true });
  }
  const expressModule = require("express");
  app.use("/uploads", expressModule.static(path.join(process.cwd(), "uploads")));

  // Helper for Gemini requests with retry logic and model fallback
  const callGeminiWithRetry = async (genAI: any, prompt: string | any[], preferredModel = "gemini-2.5-flash", retries = 3, temperature?: number, responseMimeType?: string) => {
    // Models to try in order of preference (fallback strategy)
    const modelsToTry = [preferredModel, "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
    let lastError: any;

    let currentModelIndex = 0;

    for (let i = 0; i < retries; i++) {
      // Try next model if previous one hard failed
      if (currentModelIndex >= modelsToTry.length) currentModelIndex = 0;
      const modelName = modelsToTry[currentModelIndex];
      try {
        console.log(`[API] Attempting with model: ${modelName} (Attempt ${i + 1}/${retries}), Temp: ${temperature ?? 'default'}`);
        const config: any = temperature !== undefined ? { temperature } : {};
        if (responseMimeType) {
          config.responseMimeType = responseMimeType;
        }
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: config });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
      } catch (error: any) {
        lastError = error;

        // Handle 429 (Rate Limit) with backoff
        if ((error.status === 429 || error.message?.includes("429")) && i < retries - 1) {
          const waitTime = 3000 * Math.pow(2, i);
          console.log(`[API] Gemini Rate Limited (${modelName}). Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // Handle 404 or other failures by switching model immediately
        console.error(`[API] Gemini Error with ${modelName}:`, error.message);
        currentModelIndex++;
        if (currentModelIndex < modelsToTry.length) {
          console.log(`[API] Falling back to model: ${modelsToTry[currentModelIndex]}...`);
        } else {
          console.log(`[API] Retrying with same model...`);
        }
        continue;
      }
    }
    throw lastError;
  };

  // Helper to upload file to Gemini for vision processing
  const uploadToGemini = async (filePath: string, mimeType: string) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const fileManager = new GoogleAIFileManager(apiKey);
    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType,
      displayName: path.basename(filePath),
    });

    const file = uploadResult.file;
    console.log(`[API] Uploaded file to Gemini: ${file.uri} (${file.state})`);

    // Wait for file to be active
    let fileState = file.state;
    while (fileState === "PROCESSING") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const fileStatus = await fileManager.getFile(file.name);
      fileState = fileStatus.state;
      console.log(`[API] File processing state: ${fileState}`);
    }

    if (fileState !== "ACTIVE") {
      throw new Error(`Gemini file processing failed with state: ${fileState}`);
    }

    return file;
  };

  /**
   * Stop processing endpoint - kills all processes for a lecture
   */
  app.post("/api/lecture/:lectureId/stop", async (req: Request, res: Response) => {
    try {
      const { lectureId } = req.params;

      if (!lectureId) {
        return res.status(400).json({ error: "Lecture ID is required" });
      }

      const processes = activeProcesses.get(lectureId);

      if (!processes || processes.length === 0) {
        console.log(`[API] No active processes found for lecture: ${lectureId}`);
        return res.json({ message: "No active processes to stop", stopped: 0 });
      }

      let stoppedCount = 0;
      for (const procInfo of processes) {
        try {
          if (procInfo.process && !procInfo.process.killed) {
            console.log(`[API] Killing process for lecture ${lectureId}, type: ${procInfo.type}`);
            procInfo.process.kill('SIGTERM');

            // Force kill after 2 seconds if still running
            setTimeout(() => {
              if (procInfo.process && !procInfo.process.killed) {
                console.log(`[API] Force killing process for lecture ${lectureId}`);
                procInfo.process.kill('SIGKILL');
              }
            }, 2000);

            stoppedCount++;
          }
        } catch (error: any) {
          console.error(`[API] Error killing process:`, error);
        }
      }

      // Remove from tracking
      activeProcesses.delete(lectureId);

      console.log(`[API] Stopped ${stoppedCount} process(es) for lecture: ${lectureId}`);
      res.json({ message: `Stopped ${stoppedCount} process(es)`, stopped: stoppedCount });
    } catch (error: any) {
      console.error("[API] Error stopping processes:", error);
      res.status(500).json({ error: "Failed to stop processes" });
    }
  });

  /**
   * Health check endpoint
   */
  app.get("/api/health", async (req: Request, res: Response) => {
    try {
      // Check Python availability
      const venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
      const pythonExecutable = process.platform === "win32" ? "python" : "python3";
      const pythonCmd = process.env.PYTHON_CMD || (existsSync(venvPython) ? venvPython : pythonExecutable);

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        python: pythonCmd,
        node: process.version,
        cuda: process.env.CUDA_VISIBLE_DEVICES || "not set",
      });
    } catch (error: any) {
      res.status(500).json({
        status: "unhealthy",
        error: error.message,
      });
    }
  });

  /**
   * YouTube video info extraction endpoint (title, thumbnail, duration, etc.)
   * Uses Python script with yt-dlp (scripts/get_video_info.py)
   */
  app.post("/api/youtube/info", async (req: Request, res: Response) => {
    try {
      const { videoId } = req.body;

      if (!videoId || typeof videoId !== "string") {
        return res.status(400).json({ error: "Video ID is required" });
      }

      console.log(`[API] Fetching video info for: ${videoId}`);

      try {
        console.log(`[API] Info: using python command configuration`);
        // Allow custom python command via env, fallback to venv python, then python/python3
        const venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
        const pythonExecutable = process.platform === "win32" ? "python" : "python3";
        const pythonCmd = process.env.PYTHON_CMD || (existsSync(venvPython) ? venvPython : pythonExecutable);
        const pythonScript = path.join(__dirname, "scripts", "get_video_info.py");
        const { stdout, stderr } = await execAsync(
          `${pythonCmd} "${pythonScript}" "${videoId}"`,
          { timeout: 60000 } // 1 minute timeout for info
        );

        if (stderr) {
          console.error(`[API] Python stderr (video info):`, stderr);
        }

        const result = JSON.parse(stdout.trim());

        if (!result.success) {
          return res.status(404).json({
            error: result.error || "Failed to fetch video information",
            details: result.details || "Could not retrieve video details from YouTube.",
          });
        }

        console.log(`[API] Video info fetched successfully:`, {
          title: result.title,
          duration: result.duration,
          channel: result.channelName,
        });

        res.json({
          videoId: result.videoId,
          title: result.title,
          thumbnailUrl: result.thumbnailUrl,
          duration: result.duration,
          channelName: result.channelName,
          durationSeconds: result.durationSeconds,
        });
      } catch (pythonError: any) {
        console.error("[API] Error calling Python script for video info:", pythonError);
        res.status(500).json({
          error: "Failed to fetch video info via Python script",
          details: pythonError.message || "Unknown error",
        });
      }
    } catch (error: any) {
      console.error("[API] Error in video info endpoint:", error);
      res.status(500).json({ error: "Failed to fetch video info" });
    }
  });

  /**
   * YouTube transcript extraction endpoint
   * Uses Python script scripts/get_transcript.py (youtube_transcript_api)
   */
  app.post("/api/youtube/transcript", async (req: Request, res: Response) => {
    try {
      const { videoId, startTime, endTime } = req.body;

      if (!videoId || typeof videoId !== "string") {
        return res.status(400).json({ error: "Video ID is required" });
      }

      const startTimeSeconds = startTime !== undefined && startTime !== null ? parseFloat(startTime) : null;
      const endTimeSeconds = endTime !== undefined && endTime !== null ? parseFloat(endTime) : null;

      console.log(`[API] Fetching transcript for video: ${videoId}${startTimeSeconds !== null ? ` (from ${startTimeSeconds}s)` : ''}${endTimeSeconds !== null ? ` (to ${endTimeSeconds}s)` : ''}`);

      try {
        console.log(`[API] Transcript: starting process...`);
        console.log(`[API] Calling Python script to fetch transcript...`);
        const pythonScript = path.join(__dirname, "scripts", "get_transcript.py");

        // Build command with optional time parameters
        // Use venv python if available, otherwise fallback to python/python3
        const venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
        const pythonExecutable = process.platform === "win32" ? "python" : "python3";
        const pythonCmd = process.env.PYTHON_CMD || (existsSync(venvPython) ? venvPython : pythonExecutable);
        let command = `${pythonCmd} "${pythonScript}" "${videoId}"`;
        if (startTimeSeconds !== null) {
          command += ` "${startTimeSeconds}"`;
        }
        if (endTimeSeconds !== null) {
          command += ` "${endTimeSeconds}"`;
        }

        console.log(`[API] Executing command: ${command}`);
        const { stdout, stderr } = await execAsync(command, { timeout: 180000 }); // 3 minutes timeout for transcript

        if (stderr) {
          console.error(`[API] Python stderr:`, stderr);
        }

        console.log(`[API] Python stdout length: ${stdout.length}`);
        console.log(`[API] Python stdout preview: ${stdout.substring(0, 100)}`);

        const result = JSON.parse(stdout.trim());

        if (!result.success) {
          return res.status(404).json({
            error: result.error || "No transcript available for this video",
            details:
              result.details || "The video may not have captions enabled.",
          });
        }

        const fullTranscript = result.transcript;

        if (!fullTranscript || fullTranscript.length === 0) {
          return res.status(404).json({
            error: "No transcript text found",
            details: "The transcript exists but contains no text.",
          });
        }

        console.log(
          `[API] Successfully fetched transcript (${fullTranscript.length} characters, ${result.wordCount} words, language: ${result.language})`,
        );

        res.json({
          transcript: fullTranscript,
          wordCount: result.wordCount,
          characterCount: fullTranscript.length,
          language: result.language,
        });
        return;
      } catch (pythonError: any) {
        console.error("[API] Error calling Python script for transcript:", pythonError);

        let errorMessage = "Failed to extract transcript";
        if (
          pythonError.message?.includes("No module named 'youtube_transcript_api'")
        ) {
          errorMessage =
            "Python 'youtube_transcript_api' not installed. Please run 'pip install youtube-transcript-api'.";
        } else if (pythonError.message?.includes("No transcript available")) {
          errorMessage =
            "No transcript available for this video. The video may not have captions.";
        } else if (pythonError.message?.includes("Transcripts are disabled")) {
          errorMessage = "Transcripts are disabled for this video by the creator.";
        }

        res.status(500).json({
          error: errorMessage,
          details: pythonError.message,
        });
      }
    } catch (error: any) {
      console.error("[API] Error in transcript endpoint:", error);
      res.status(500).json({ error: "Failed to extract transcript" });
    }
  });

  /**
   * YouTube audio download and transcription endpoint using Faster Whisper
   * Downloads audio from YouTube and converts it to text using Whisper
   * Saves audio files to Firebase Storage for future use
   */
  app.post("/api/youtube/transcribe", async (req: Request, res: Response) => {
    let downloadedFilePath: string | null = null;
    let downloadProcess: ChildProcess | null = null;
    let transcribeProcess: ChildProcess | null = null;
    // Get userId from request body or auth (if available)
    const userId = req.body.userId || (req as any).user?.uid || "anonymous";
    const lectureId = req.body.lectureId as string | undefined;

    try {
      const { videoId, startTime, endTime, modelSize = "large-v3", language, device = "cuda", videoTitle, channelName } = req.body;

      if (!videoId || typeof videoId !== "string") {
        return res.status(400).json({ error: "Video ID is required" });
      }

      const startTimeSeconds = startTime !== undefined && startTime !== null ? parseFloat(startTime) : null;
      const endTimeSeconds = endTime !== undefined && endTime !== null ? parseFloat(endTime) : null;

      // Auto-detect Arabic from video title or channel name
      let detectedLanguage = language;
      if (!language || language === "auto") {
        const hasArabicInTitle = videoTitle && /[\u0600-\u06FF]/.test(videoTitle);
        const hasArabicInChannel = channelName && /[\u0600-\u06FF]/.test(channelName);
        if (hasArabicInTitle || hasArabicInChannel) {
          detectedLanguage = "ar";
          console.log(`[API] Auto-detected Arabic language from ${hasArabicInTitle ? 'title' : 'channel'}`);
        }
      }

      console.log(`[API] Downloading and transcribing YouTube video: ${videoId}`);
      console.log(`[API] Time range: ${startTimeSeconds || 0}s - ${endTimeSeconds || "end"}`);
      console.log(`[API] Model: ${modelSize}, Language: ${detectedLanguage || "auto"}, Device: ${device}`);

      // Check if audio already exists in Firebase Storage (only if no time range specified)
      let audioUrl: string | null = null;
      if (startTimeSeconds === null && endTimeSeconds === null) {
        try {
          audioUrl = await checkAudioExists(userId, videoId);
          if (audioUrl) {
            console.log(`[API] Audio file found in Firebase Storage: ${audioUrl}`);
            // Download from Firebase to temp file for transcription
            const tempFile = path.join(os.tmpdir(), `firebase-${videoId}-${Date.now()}.mp3`);
            await downloadAudioFromFirebase(userId, videoId, tempFile);
            downloadedFilePath = tempFile;
          }
        } catch (firebaseError) {
          console.warn(`[API] Could not check Firebase Storage, proceeding with YouTube download:`, firebaseError);
        }
      }

      try {
        // Get Python command (needed for both download and transcription)
        const venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
        const pythonExecutable = process.platform === "win32" ? "python" : "python3";
        const pythonCmd = process.env.PYTHON_CMD || (existsSync(venvPython) ? venvPython : pythonExecutable);

        let geminiFileUri: string | undefined;
        let geminiFileMimeType: string | undefined;

        // Step 1: Download video from YouTube (if not found in Firebase)
        if (!downloadedFilePath) {
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          downloadedFilePath = path.join(os.tmpdir(), `youtube-vid-${videoId}-${Date.now()}.mp4`);

          console.log(`[API] Downloading YouTube video using youtube-dl-exec for Vision processing...`);

          const dlOptions: any = {
            format: 'best[height<=720]/best',
            output: downloadedFilePath,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
          };

          if (startTimeSeconds !== null || endTimeSeconds !== null) {
            const startStr = startTimeSeconds !== null ? startTimeSeconds.toString() : '0';
            const endStr = endTimeSeconds !== null ? endTimeSeconds.toString() : 'inf';
            dlOptions.downloadSections = `*${startStr}-${endStr}`;
          }

          try {
            await youtubedl(videoUrl, dlOptions);
            console.log(`[API] Video downloaded successfully to ${downloadedFilePath}`);

            // Optionally upload to Firebase Storage if no time range
            if (startTimeSeconds === null && endTimeSeconds === null && userId !== "anonymous") {
              try {
                audioUrl = await uploadAudioToFirebase(downloadedFilePath, userId as string, videoId as string);
                console.log(`[API] Media uploaded to Firebase Storage: ${audioUrl}`);
              } catch (uploadError) {
                console.warn(`[API] Could not upload to Firebase Storage (acceptable):`, uploadError);
              }
            }
          } catch (dlError: any) {
            console.error(`[API] youtube-dl-exec failed:`, dlError);
            return res.status(500).json({
              error: "Failed to download media from YouTube",
              details: dlError.message || "Could not download file.",
            });
          }
        }

        // Upload to Gemini for Vision API (optional but highly recommended for math)
        if (process.env.GEMINI_API_KEY && existsSync(downloadedFilePath)) {
          try {
            console.log(`[API] Proactively uploading YouTube video to Gemini for future Vision tasks...`);
            const fileRecord = await uploadToGemini(downloadedFilePath, "video/mp4");
            geminiFileUri = fileRecord.uri;
            geminiFileMimeType = fileRecord.mimeType;
            console.log(`[API] YouTube video uploaded to Gemini: ${geminiFileUri}`);
          } catch (uploadError) {
            console.warn("[API] Proactive YouTube upload to Gemini failed, continuing without Vision support:", uploadError);
          }
        }

        // Step 2: Transcribe using Whisper
        const transcribeScript = path.join(__dirname, "scripts", "transcribe_audio.py");

        const transcribeArgs = [transcribeScript, downloadedFilePath, modelSize];
        if (detectedLanguage) {
          transcribeArgs.push(detectedLanguage);
        } else {
          transcribeArgs.push("None");
        }
        transcribeArgs.push(device);

        console.log(`[API] Transcribing audio with Whisper...`);

        // Use spawn to track the process
        transcribeProcess = spawn(pythonCmd, transcribeArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        // Track process if lectureId is provided
        if (lectureId) {
          if (!activeProcesses.has(lectureId)) {
            activeProcesses.set(lectureId, []);
          }
          activeProcesses.get(lectureId)!.push({
            process: transcribeProcess,
            type: "youtube_transcribe",
            startTime: new Date()
          });
        }

        let transcribeStdout = '';
        let transcribeStderr = '';

        transcribeProcess.stdout?.on('data', (data) => {
          transcribeStdout += data.toString();
        });

        transcribeProcess.stderr?.on('data', (data) => {
          transcribeStderr += data.toString();
        });

        // Wait for transcription to complete
        await new Promise<void>((resolve, reject) => {
          transcribeProcess!.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`Transcribe process exited with code ${code}. ${transcribeStderr}`));
            } else {
              resolve();
            }
          });

          transcribeProcess!.on('error', (error) => {
            reject(error);
          });
        });

        if (transcribeStderr) {
          console.error(`[API] Python stderr (transcription):`, transcribeStderr);
        }

        const transcribeResult = JSON.parse(transcribeStdout.trim());

        // Remove transcribe process from tracking on success
        if (lectureId && transcribeProcess) {
          const processes = activeProcesses.get(lectureId);
          if (processes) {
            const index = processes.findIndex(p => p.process === transcribeProcess);
            if (index !== -1) {
              processes.splice(index, 1);
              if (processes.length === 0) {
                activeProcesses.delete(lectureId);
              }
            }
          }
        }

        if (!transcribeResult.success) {
          return res.status(500).json({
            error: transcribeResult.error || "Transcription failed",
            details: transcribeResult.details || "Could not transcribe audio file.",
          });
        }

        const transcript = transcribeResult.transcript;

        if (!transcript || transcript.length === 0) {
          return res.status(404).json({
            error: "No transcript text found",
            details: "The transcription completed but contains no text.",
          });
        }

        console.log(
          `[API] Successfully transcribed YouTube audio (${transcript.length} characters, ${transcribeResult.wordCount} words, language: ${transcribeResult.language})`,
        );

        res.json({
          transcript,
          wordCount: transcribeResult.wordCount,
          characterCount: transcribeResult.characterCount || transcript.length,
          language: transcribeResult.language,
          audioUrl: audioUrl || undefined, // Include Firebase Storage URL if available
          geminiFileUri,
          geminiFileMimeType,
        });
      } catch (pythonError: any) {
        // Remove processes from tracking on error
        if (lectureId) {
          const processes = activeProcesses.get(lectureId);
          if (processes) {
            if (downloadProcess) {
              const index = processes.findIndex(p => p.process === downloadProcess);
              if (index !== -1) {
                processes.splice(index, 1);
              }
            }
            if (transcribeProcess) {
              const index = processes.findIndex(p => p.process === transcribeProcess);
              if (index !== -1) {
                processes.splice(index, 1);
              }
            }
            if (processes.length === 0) {
              activeProcesses.delete(lectureId);
            }
          }
        }

        console.error("[API] Error in YouTube transcription:", pythonError);

        let errorMessage = "Failed to transcribe YouTube audio";
        if (pythonError.message?.includes("No module named 'yt_dlp'")) {
          errorMessage = "Python 'yt-dlp' not installed. Please run 'pip install yt-dlp'.";
        } else if (pythonError.message?.includes("No module named 'faster_whisper'")) {
          errorMessage = "Python 'faster-whisper' not installed. Please run 'pip install faster-whisper'.";
        }

        res.status(500).json({
          error: errorMessage,
          details: pythonError.message,
        });
      }
    } catch (error: any) {
      // Remove processes from tracking on error
      if (lectureId) {
        const processes = activeProcesses.get(lectureId);
        if (processes) {
          if (downloadProcess) {
            const index = processes.findIndex(p => p.process === downloadProcess);
            if (index !== -1) {
              processes.splice(index, 1);
            }
          }
          if (transcribeProcess) {
            const index = processes.findIndex(p => p.process === transcribeProcess);
            if (index !== -1) {
              processes.splice(index, 1);
            }
          }
          if (processes.length === 0) {
            activeProcesses.delete(lectureId);
          }
        }
      }

      console.error("[API] Error in YouTube transcription endpoint:", error);
      res.status(500).json({ error: "Failed to transcribe YouTube audio" });
    } finally {
      // Clean up downloaded file
      if (downloadedFilePath && existsSync(downloadedFilePath)) {
        try {
          unlinkSync(downloadedFilePath);
          console.log(`[API] Cleaned up downloaded file: ${downloadedFilePath}`);
        } catch (cleanupError) {
          console.error(`[API] Error cleaning up file: ${cleanupError}`);
        }
      }
    }
  });

  /**
   * Audio file transcription endpoint using Faster Whisper
   * Accepts audio/video files and converts them to text transcript
   */
  app.post("/api/audio/transcribe", upload.single("audio"), async (req: Request, res: Response) => {
    let uploadedFilePath: string | null = null;
    let originalFilename: string = "unknown";
    let childProcess: ChildProcess | null = null;
    const lectureId = req.body.lectureId as string | undefined;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file uploaded" });
      }

      uploadedFilePath = req.file.path;
      originalFilename = req.file.originalname;

      let geminiFileUri: string | undefined;
      let geminiFileMimeType: string | undefined;

      // We no longer convert PPT to PDF because Gemini 1.5 natively supports PPTX files
      // and we can extract images via zipfile locally if needed.

      const isVideoInfo = req.file?.mimetype?.startsWith("video/") || originalFilename.match(/\.(mp4|webm|ogg|mov)$/i);
      const isDocumentInfo = req.file?.mimetype === "application/pdf" || originalFilename.match(/\.(pdf|pptx?)$/i);
      const isVisualFile = isVideoInfo || isDocumentInfo;

      if (isVisualFile && process.env.GEMINI_API_KEY && existsSync(uploadedFilePath)) {
        try {
          console.log(`[API] Proactively uploading visual file ${originalFilename} to Gemini for future Vision tasks...`);
          // Note: Gemini natively supports PDFs and PPTXs.
          let mimeType = req.file?.mimetype || "video/mp4";
          if (originalFilename.match(/\.pptx$/i)) mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
          if (originalFilename.match(/\.pdf$/i)) mimeType = "application/pdf";

          const fileRecord = await uploadToGemini(uploadedFilePath, mimeType);
          geminiFileUri = fileRecord.uri;
          geminiFileMimeType = fileRecord.mimeType;
        } catch (uploadError) {
          console.warn("[API] Proactive upload to Gemini failed, continuing without Vision formulas support:", uploadError);
        }
      }

      // Extract parameters from FormData (multer puts them in req.body)
      // Default to large-v3 for best quality (especially on GPU/RunPod)
      const modelSize = req.body.modelSize || "large-v3";
      const language = req.body.language || undefined;
      // Support both "gpu" and "cuda" for GPU device
      // Default to cuda for RunPod/GPU environments
      let device = req.body.device || "cuda";
      if (device === "gpu") {
        device = "cuda";
      }

      // Log configuration for debugging
      console.log(`[API] Whisper Configuration:`, {
        modelSize,
        device,
        language: language || "auto-detect",
        fileSize: `${(req.file.size / 1024 / 1024).toFixed(2)} MB`,
        lectureId: lectureId || "none"
      });

      console.log(`[API] Processing file: ${originalFilename} (original size: ${req.file.size} bytes)`);

      const fileExt = path.extname(originalFilename).toLowerCase();
      let transcript = "";

      // Handle Document Files
      let extractedImages: { url: string, description: string }[] = [];

      if (fileExt === ".pdf") {
        try {
          const venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
          const pythonExecutable = process.platform === "win32" ? "python" : "python3";
          const pythonCmd = process.env.PYTHON_CMD || (existsSync(venvPython) ? venvPython : pythonExecutable);
          const extractPdfScript = path.join(__dirname, "scripts", "extract_pdf_content.py");

          console.log(`[API] Executing: ${pythonCmd} ${extractPdfScript} ${uploadedFilePath}`);
          const { stdout, stderr } = await execAsync(`"${pythonCmd}" "${extractPdfScript}" "${uploadedFilePath}"`);

          if (stderr) {
            console.error(`[API] Python stderr (PDF extraction):`, stderr);
          }

          let result;
          try {
            // To handle potential encoding issues or extra print statements from python
            let cleanStdout = stdout.substring(stdout.indexOf('{'));
            result = JSON.parse(cleanStdout);
          } catch (e) {
            console.error("[API] Failed to parse PyMuPDF output:", stdout);
            throw new Error("Invalid output from PyMuPDF script");
          }

          if (!result.success) {
            throw new Error(`PDF extraction failed: ${result.error}`);
          }

          transcript = result.transcript;

          // Upload extracted images to Firebase Storage
          if (result.images && result.images.length > 0 && lectureId) {
            const userId = req.body.userId || (req as any).user?.uid || "anonymous";
            console.log(`[API] Uploading ${result.images.length} extracted images to Firebase (with local fallback)...`);
            for (const imgPath of result.images) {
              try {
                const url = await uploadImageToFirebase(imgPath, userId, lectureId);
                extractedImages.push({ url, description: "" });
              } catch (err) {
                console.warn(`[API] Firebase upload failed, falling back to local storage for image ${imgPath}:`, err);
                try {
                  const fileName = path.basename(imgPath);
                  const localDest = path.join(process.cwd(), "uploads", "images", fileName);
                  copyFileSync(imgPath, localDest);
                  extractedImages.push({ url: `/uploads/images/${fileName}`, description: "" });
                } catch (fallbackErr) {
                  console.error(`[API] Local fallback failed for image ${imgPath}:`, fallbackErr);
                }
              }
              // Clean up temp image file
              if (existsSync(imgPath)) unlinkSync(imgPath);
            }
          }

          if (!transcript || transcript.trim().length < 50) {
            console.log(`[API] PDF text is empty or too short. Escalating to Gemini PDF extraction.`);
            throw new Error("PDF text too short or empty for standard parsing");
          }
        } catch (err) {
          console.log(`[API] PyMuPDF failed or returned little text. Escalating to Gemini PDF extraction.`);
          throw err;
        }
      } else if (fileExt === ".docx" || fileExt === ".doc") {
        const result = await mammoth.extractRawText({ path: uploadedFilePath });
        transcript = result.value;
      } else if (fileExt === ".pptx" || fileExt === ".ppt") {
        try {
          const data: any = await new Promise((resolve, reject) => {
            officeParser.parseOffice(uploadedFilePath, (data: any, err: any) => {
              if (err) return reject(err);
              resolve(data);
            });
          });

          const extractText = (obj: any): string => {
            if (!obj) return "";
            if (typeof obj === "string") return obj;
            if (Array.isArray(obj)) return obj.map(extractText).join("\n");

            let text = "";
            if (obj.text) text += obj.text + "\n";

            if (obj.children) text += extractText(obj.children);
            if (obj.content) text += extractText(obj.content);
            if (obj.data) text += extractText(obj.data);

            return text;
          };

          transcript = typeof data === 'string' ? data : extractText(data);
          transcript = transcript.replace(/\\n/g, "\n").replace(/\s+/g, " ").trim();

          // We ALSO extract images from PPTX using our new lightweight python zip extractor
          if (fileExt === ".pptx" && lectureId) {
            try {
              const venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
              const pythonExecutable = process.platform === "win32" ? "python" : "python3";
              const pythonCmd = process.env.PYTHON_CMD || (existsSync(venvPython) ? venvPython : pythonExecutable);
              const pptxImagesScript = path.join(__dirname, "scripts", "extract_pptx_images.py");

              console.log(`[API] Executing: ${pythonCmd} ${pptxImagesScript} for images...`);
              const { stdout, stderr } = await execAsync(`"${pythonCmd}" "${pptxImagesScript}" "${uploadedFilePath}"`);

              if (stderr) console.warn(`[API] extract_pptx_images stderr:`, stderr);
              console.log(`[API] extract_pptx_images stdout:`, stdout);

              let cleanStdout = stdout.indexOf('{') >= 0 ? stdout.substring(stdout.indexOf('{')) : stdout;
              let result = JSON.parse(cleanStdout);

              if (result.success && result.images && result.images.length > 0) {
                const userId = req.body.userId || (req as any).user?.uid || "anonymous";
                console.log(`[API] Uploading ${result.images.length} extracted PPTX images to Firebase (with local fallback)...`);
                for (const imgPath of result.images) {
                  try {
                    const url = await uploadImageToFirebase(imgPath, userId, lectureId);
                    extractedImages.push({ url, description: "" });
                  } catch (err) {
                    console.warn(`[API] Firebase upload failed, falling back to local storage for PPTX image ${imgPath}:`, err);
                    try {
                      const fileName = path.basename(imgPath);
                      const localDest = path.join(process.cwd(), "uploads", "images", fileName);
                      copyFileSync(imgPath, localDest);
                      extractedImages.push({ url: `/uploads/images/${fileName}`, description: "" });
                    } catch (fallbackErr) {
                      console.error(`[API] Local fallback failed for PPTX image ${imgPath}:`, fallbackErr);
                    }
                  }
                  if (existsSync(imgPath)) unlinkSync(imgPath);
                }
              } else {
                console.log(`[API] extraction returned no images or false success. Result:`, result);
              }
            } catch (err: any) {
              console.warn(`[API] Could not extract images from PPTX (non-fatal):`, err.message);
            }
          }
        } catch (err) {
          console.error("[API] Error parsing PPTX:", err);
          transcript = "";
        }
      }

      if (transcript && typeof transcript === 'string' && transcript.length > 0) {
        console.log(`[API] Successfully extracted text from document: ${originalFilename} (${transcript.length} chars)`);
        return res.json({
          transcript,
          wordCount: transcript.split(/\s+/).length,
          characterCount: transcript.length,
          language: "auto",
          geminiFileUri,
          geminiFileMimeType,
          extractedImages: extractedImages.length > 0 ? extractedImages : undefined,
        });
      } else if (transcript) {
        console.log(`[API] Extracted data from document: ${originalFilename}`);
        return res.json({
          transcript: String(transcript),
          wordCount: 0,
          characterCount: 0,
          language: "auto",
          geminiFileUri,
          geminiFileMimeType,
          extractedImages: extractedImages.length > 0 ? extractedImages : undefined,
        });
      }

      // If not a document, proceed with audio transcription (Whisper)
      console.log(`[API] Proceeding with Whisper transcription for: ${originalFilename}`);

      // Extract parameters from FormData (multer puts them in req.body)
      const pythonScript = path.join(__dirname, "scripts", "transcribe_audio.py");
      const venvPython = path.join(__dirname, "..", "venv", "bin", "python3");
      const pythonCmd = process.env.PYTHON_CMD || (existsSync(venvPython) ? venvPython : "python3");

      // Build command arguments
      const args = [pythonScript, uploadedFilePath, modelSize];
      if (language) {
        args.push(language);
      } else {
        args.push("None");
      }
      args.push(device);

      console.log(`[API] Calling Python script for transcription...`);

      // Use spawn instead of execAsync to track the process
      const pythonProcess = spawn(pythonCmd, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      childProcess = pythonProcess;

      // Track process if lectureId is provided
      if (lectureId) {
        if (!activeProcesses.has(lectureId)) {
          activeProcesses.set(lectureId, []);
        }
        const processes = activeProcesses.get(lectureId);
        if (processes) {
          processes.push({
            process: pythonProcess,
            type: "transcribe",
            startTime: new Date()
          });
        }
      }

      let stdout = '';
      let stderr = '';

      if (pythonProcess.stdout) {
        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (pythonProcess.stderr) {
        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      // Wait for process to complete
      await new Promise<void>((resolve, reject) => {
        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Process exited with code ${code}. ${stderr}`));
          } else {
            resolve();
          }
        });

        pythonProcess.on('error', (error) => {
          reject(error);
        });
      });

      if (stderr) {
        console.error(`[API] Python stderr (transcription):`, stderr);
      }

      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch (parseError) {
        console.error(`[API] Failed to parse Python output: ${stdout}`);
        throw new Error(`Invalid JSON output from transcription script: ${stdout.substring(0, 100)}...`);
      }

      // Remove from tracking on success
      if (lectureId) {
        const processes = activeProcesses.get(lectureId);
        if (processes) {
          const index = processes.findIndex(p => p.process === pythonProcess);
          if (index !== -1) {
            processes.splice(index, 1);
            if (processes.length === 0) {
              activeProcesses.delete(lectureId);
            }
          }
        }
      }

      if (!result.success) {
        return res.status(500).json({
          error: result.error || "Transcription failed",
          details: result.details || "Could not transcribe audio file.",
        });
      }

      // Use a new variable name to avoid conflict with the 'transcript' variable from the document parsing block
      const audioTranscript = result.transcript;

      if (!audioTranscript || audioTranscript.length === 0) {
        return res.status(404).json({
          error: "No transcript text found",
          details: "The transcription completed but contains no text.",
        });
      }

      console.log(
        `[API] Successfully transcribed audio (${audioTranscript.length} characters, ${result.wordCount} words, language: ${result.language})`,
      );

      res.json({
        transcript: audioTranscript,
        wordCount: result.wordCount,
        characterCount: result.characterCount || audioTranscript.length,
        language: result.language,
        geminiFileUri,
        geminiFileMimeType,
      });

    } catch (error: any) {
      // Check if we should try visual extraction for video/PDF files
      // This happens if Whisper/pdf-parse failed OR if we catch an error
      const isVideo = req.file?.mimetype?.startsWith("video/") || originalFilename.match(/\.(mp4|webm|ogg|mov)$/i);
      const isPdf = req.file?.mimetype === "application/pdf" || originalFilename.match(/\.pdf$/i);

      if ((isVideo || isPdf) && process.env.GEMINI_API_KEY) {
        console.log(`[API] Audio/Doc translation failed or irrelevant. Attempting Visual Extraction via Gemini...`);
        try {
          // Use the file we already have (uploadedFilePath)
          const mimeType = isPdf ? "application/pdf" : (req.file?.mimetype || "video/mp4");

          if (!uploadedFilePath || !existsSync(uploadedFilePath)) {
            throw new Error("File not found for visual extraction");
          }

          const fileRecord = await uploadToGemini(uploadedFilePath, mimeType);

          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          // Use the same model as the rest of the application
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          const prompt = isPdf
            ? `You are an expert document transcriber and analyzer.
            Your task:
            1. Extract all text from this document accurately and in its natural reading order.
            2. For any meaningful diagrams, charts, or images, describe them naturally within the flow of the text, without using explicit labels like "Diagram Description".
            3. *MATHEMATICS & FORMULAS*: Carefully extract all mathematical equations, formulas, physical laws, and scientific notations using standard LaTeX format (e.g., $inline$ or $$block$$). Interweave them seamlessly into the text just as they appear in the document.
            4. CRITICAL: DO NOT use explicit headers or labels such as "Text:", "Mathematics & Formulas:", or "Diagram Description:". The final output must read smoothly and continuously like a textbook or a cohesive lecture transcript.
            
            Important: Output ONLY the combined transcript text. Do not add any introductory or concluding remarks.`
            : `You are an expert transcriber. The audio in this video might be silent, missing, or unclear. 
            Your task:
            1. Extract all VISIBLE text from the slides, whiteboard, or screen.
            2. Describe any meaningful diagrams, charts, or visual actions that explain the concepts.
            3. If there is any audible speech, include that as well.
            4. Combine everything into a comprehensive, coherent lecture transcript.
            
            Important: Output ONLY the combined transcript text, do not add introductory remarks.`;


          const result = await model.generateContent([
            prompt,
            {
              fileData: {
                fileUri: fileRecord.uri,
                mimeType: fileRecord.mimeType,
              },
            },
          ]);

          const visualTranscript = result.response.text();
          console.log(`[API] Visual Extraction Successful (${visualTranscript.length} chars)`);

          // Return this as the transcript
          return res.json({
            transcript: visualTranscript,
            wordCount: visualTranscript.split(/\s+/).length,
            characterCount: visualTranscript.length,
            language: "auto",
            method: "visual_extraction",
            geminiFileUri: fileRecord.uri,
            geminiFileMimeType: fileRecord.mimeType,
          });

        } catch (visualError: any) {
          console.error("[API] Visual extraction also failed:", visualError);
          // Fall through to original error response
        }
      }

      // Remove from tracking on error
      if (lectureId && childProcess) {
        const processes = activeProcesses.get(lectureId);
        if (processes) {
          const index = processes.findIndex(p => p.process === childProcess);
          if (index !== -1) {
            processes.splice(index, 1);
            if (processes.length === 0) {
              activeProcesses.delete(lectureId);
            }
          }
        }
      }

      console.error("[API] Error in audio transcription endpoint:", error);

      let errorMessage = "Failed to transcribe audio file";
      if (error.message?.includes("No module named 'faster_whisper'")) {
        errorMessage = "Python 'faster-whisper' not installed. Please run 'pip install faster-whisper'.";
      } else if (error.message?.includes("CUDA")) {
        errorMessage = "CUDA/GPU error. Try using device='cpu' instead.";
      }

      res.status(500).json({
        error: errorMessage,
        details: error.message
      });
    } finally {
      // Clean up uploaded file
      if (uploadedFilePath && existsSync(uploadedFilePath)) {
        try {
          unlinkSync(uploadedFilePath);
          console.log(`[API] Cleaned up temporary file: ${uploadedFilePath}`);
        } catch (cleanupError) {
          console.error(`[API] Error cleaning up file: ${cleanupError}`);
        }
      }
    }
  });

  /**
   * AI Chat Agent endpoint
   * POST /api/ai/chat
   */
  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    try {
      const { transcript, message, history, mode } = req.body;
      const isGpuMode = mode === "gpu";

      console.log(`[API] Chat endpoint hit with mode: ${mode}`);
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "Transcript is required" });
      }
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey && !isGpuMode) {
        // Helper to get Gemini response for chat
        const getChatResponse = async (transcript: string, message: string, history: any[]) => {
          const genAI = new GoogleGenerativeAI(geminiApiKey);
          // models to try in order of stability and performance
          const models = ["gemini-2.5-flash"];
          let lastErr;

          for (const modelName of models) {
            try {
              console.log(`[API] Attempting chat with model: ${modelName}`);

              const systemPrompt = `You are a highly efficient academic assistant and an expert in the broad field or discipline discussed in the provided transcript.
                    
                    ## CONTEXT AND SCOPE RULE:
                    - First, identify the general field of the transcript (e.g., Programming, Mathematics, Physics, History, etc.).
                    - You MUST answer ANY question the user asks as long as it falls within this general field or discipline, even if the specific topic was never mentioned in the lecture.
                    - EXTERNAL KNOWLEDGE IS HIGHLY ENCOURAGED. Act as an expert tutor for this entire discipline.
                    - Example 1: If the lecture is about "Python Variables", you CAN and SHOULD answer questions about "Java Arrays", "Web Development", or "Algorithms" because they are in the same broad field of Computer Science/Programming.
                    - Example 2: If the lecture is about "Algebra", you CAN answer questions about "Calculus" or "Geometry".
                    - ONLY decline completely unrelated, non-academic topics (like asking about sports, pop culture, random trivia, etc.) that have absolutely zero connection to the lecture's broad academic field. When declining, do so politely.


                    ## STRICT LANGUAGE RULE:
                    - You MUST detect the language of the user's message and respond in that EXACT SAME LANGUAGE. (Arabic -> Arabic, English -> English).
                    - NEVER mix languages unless asked.

                    ## CODE RENDERING:
                    - You MUST ALWAYS wrap code snippets in markdown code blocks with the correct language tag (e.g., \`\`\`python, \`\`\`javascript) to ensure it is colored properly. 
                    - Avoid plain text code blocks; always specify the language.

                    ## MATHEMATICAL RENDERING:
                    - Use LaTeX for ALL formulas: $inline$ and $$block$$.
                    - Always provide the full law when asked.

                    TRANSCRIPT CONTEXT:
                    ${transcript.substring(0, 10000)}
                    `;

              const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: systemPrompt
              });

              // Clean history: must alternate user/model and start with user
              const rawHistory = (history || [])
                .filter(h => h.content && typeof h.content === 'string' && h.content.trim().length > 0)
                .map(h => ({
                  role: (h.role === "ai" || h.role === "model" ? "model" : "user") as "model" | "user",
                  parts: [{ text: String(h.content) }]
                }));

              const cleanHistory: any[] = [];
              let lastRole: string | null = null;

              for (const entry of rawHistory) {
                if (entry.role !== lastRole) {
                  cleanHistory.push(entry);
                  lastRole = entry.role;
                }
              }

              // Ensure it starts with 'user'
              if (cleanHistory.length > 0 && cleanHistory[0].role !== "user") {
                cleanHistory.shift();
              }

              const chat = model.startChat({
                history: cleanHistory,
                generationConfig: {
                  maxOutputTokens: 2048,
                  temperature: 0.7,
                }
              });

              const result = await chat.sendMessage(message);
              return result.response.text();
            } catch (err: any) {
              console.error(`[API] Model ${modelName} failed:`, err.message || err);
              lastErr = err;
              // Continue to next model
              continue;
            }
          }
          throw lastErr;
        };

        try {
          const reply = await getChatResponse(transcript, message, history || []);
          return res.json({ reply });
        } catch (chatError: any) {
          console.error("[API] All chat models failed:", chatError);
          return res.status(500).json({ error: "AI failed to respond. Please try again later." });
        }
      }

      // Fallback
      return res.status(500).json({ error: "Gemini API key not found or GPU mode not supported yet for chat" });
    } catch (error: any) {
      console.error("[API] Error in chat:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to get AI response" });
      }
    }
  });

  /**
   * AI Summary endpoint
   * Priority:
   * 1) Gemini API (GEMINI_API_KEY)
   * 2) Ollama local model (OLLAMA_URL, OLLAMA_MODEL)
   * 3) Simple text-based fallback
   */
  app.post("/api/ai/summary", async (req: Request, res: Response) => {
    try {
      const { transcript, mode } = req.body as { transcript?: string; mode?: "gpu" | "api" };

      const isGpuMode = mode === "gpu";
      const isApiMode = mode === "api";

      console.log(`[API] Summary endpoint hit with mode: ${mode}`);
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "Transcript is required" });
      }

      if (transcript.length < 100) {
        return res.status(400).json({
          error: "Transcript is too short to generate a summary",
        });
      }

      console.log(
        `[API] Generating AI summary for transcript (${transcript.length} characters)`,
      );

      // Priority 1: Gemini (Google Generative AI) - only if not forcing GPU/local-only
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (geminiApiKey && !isGpuMode) {
        try {
          console.log("[API] Using Gemini API for summary generation (unified call)");
          const genAI = new GoogleGenerativeAI(geminiApiKey);

          const hasArabic = /[\u0600-\u06FF]/.test(transcript);
          const language = hasArabic ? "Arabic" : "English";
          const headingIntro = hasArabic ? "المقدمة" : "Introduction";
          const headingSummary = hasArabic ? "الملخص" : "Summary";
          const headingPoints = hasArabic ? "أهم النقاط" : "Key Points";

          const unifiedPrompt = `You are an expert academic summarizer. Generate a comprehensive summary for the following lecture transcript in ${language}.
          Return ONLY valid JSON in this structure:
          {
            "introduction": "2-4 sentence introduction about the topic and its importance",
            "summary": "Detailed technical main summary (2-3 paragraphs) rewriting concepts cleanly",
            "keypoints": ["list", "of", "important", "bullet", "points"]
          }
          Transcript: ${transcript.substring(0, 25000)}`;

          const aiResponseRaw = await callGeminiWithRetry(genAI, unifiedPrompt, "gemini-2.5-flash", 3, undefined, "application/json");

          let parsed;
          let cleaned = aiResponseRaw.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            cleaned = jsonMatch[0];
          }

          try {
            // Remove invalid escapes (like \ت) replacing it with ت
            const strictCleaned = cleaned.replace(/\\([^"\\/bfnrtu])/g, '$1');
            parsed = JSON.parse(strictCleaned);
          } catch (e) {
            console.warn("[API] Failed to parse unified summary JSON, using regex fallback");

            // Regex fallback
            const extractField = (fieldName: string) => {
              const match = cleaned.match(new RegExp(`"${fieldName}"\\s*:\\s*(?:\\[(.*?)\\]|"([^"]*)")`, "is"));
              if (match) {
                if (match[1] !== undefined) {
                  const arrMatch = match[1].match(/"([^"]*)"/g);
                  return arrMatch ? arrMatch.map((s: string) => s.replace(/^"|"$/g, "").replace(/\\n/g, "\n")) : [];
                }
                return match[2] !== undefined ? match[2].replace(/\\n/g, "\n") : null;
              }
              return null;
            };

            const intro = extractField("introduction");
            const summ = extractField("summary");
            const kp = extractField("keypoints");

            if (!intro && !summ && (!kp || kp.length === 0)) {
              parsed = { introduction: "", summary: cleaned, keypoints: [] };
            } else {
              parsed = {
                introduction: typeof intro === "string" ? intro : "",
                summary: typeof summ === "string" ? summ : "",
                keypoints: Array.isArray(kp) ? kp : []
              };
            }
          }

          const introSection = parsed.introduction ? `### ${headingIntro}\n${parsed.introduction}\n\n` : "";
          const keypointsSection = parsed.keypoints && parsed.keypoints.length > 0 ? `\n\n### ${headingPoints}\n${parsed.keypoints.map((p: string) => `- ${p}`).join("\n")}` : "";
          const combinedSummary = `${introSection}### ${headingSummary}\n${parsed.summary}${keypointsSection}`;

          console.log(`[API] Gemini unified summary generated (${combinedSummary.length} characters)`);
          return res.json({
            summary: combinedSummary,
            introduction: parsed.introduction,
            mainSummary: parsed.summary,
            keypoints: parsed.keypoints
          });
        } catch (geminiError: any) {
          console.error("[API] Gemini API error (unified summary):", geminiError);
        }
      }

      // Priority 2: Ollama (local AI model)
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:32b";
      try {
        if (!isApiMode) {
          const ollamaCheck = await fetch(`${ollamaUrl}/api/tags`, { method: "GET", signal: AbortSignal.timeout(2000) });
          if (ollamaCheck.ok) {
            console.log(`[API] Using Ollama model: ${ollamaModel}`);
            const hasArabic = /[\u0600-\u06FF]/.test(transcript);
            const language = hasArabic ? "Arabic" : "English";
            const headingIntro = hasArabic ? "المقدمة" : "Introduction";
            const headingSummary = hasArabic ? "الملخص" : "Summary";
            const headingPoints = hasArabic ? "أهم النقاط" : "Key Points";

            const generateOllamaSection = async (sectionPrompt: string) => {
              const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: ollamaModel, prompt: sectionPrompt, stream: false, options: { temperature: 0.3, num_predict: 2500, num_ctx: 16384 } }),
              });
              if (ollamaResponse.ok) {
                const ollamaData = await ollamaResponse.json();
                return (ollamaData.response || "").trim();
              }
              return "";
            };

            const introText = await generateOllamaSection(`Write introduction for: ${transcript.substring(0, 5000)}`);
            const summaryTextRaw = await generateOllamaSection(`Write summary for: ${transcript.substring(0, 15000)}`);
            const pointsRaw = await generateOllamaSection(`Extract key points from: ${transcript.substring(0, 15000)}`);

            const keyPoints: string[] = pointsRaw.split(/\n/).map((l: string) => l.trim()).filter((l: string) => l.startsWith("-")).map((l: string) => l.substring(1).trim());
            const finalSummary = `${headingIntro}\n${introText}\n\n${headingSummary}\n${summaryTextRaw}\n\n${headingPoints}\n${keyPoints.map(p => `- ${p}`).join("\n")}`;
            return res.json({ summary: finalSummary });
          }
        }
      } catch (ollamaError) {
        console.error("[API] Ollama not available:", ollamaError);
      }

      // Priority 3: Simple fallback
      const sentences = transcript.split(/[.!؟\n]+/).map(s => s.trim()).filter(s => s.length > 30);
      const summaryText = sentences.slice(0, 5).join(". ") + ".";
      console.log(`[API] Simple fallback summary generated`);
      return res.json({ summary: summaryText });
    } catch (error: any) {
      console.error("[API] Error generating summary:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  /**
   * Mindmap generation endpoint using AI
   * POST /api/ai/mindmap
   * Body: { "transcript": "...", "mode": "gpu" | "api" }
   * Returns: { "mindmap": "mermaid syntax string" }
   */
  app.post("/api/ai/mindmap", async (req: Request, res: Response) => {
    try {
      const { transcript, flashcards, mode } = req.body as { transcript?: string; flashcards?: any[]; mode?: "gpu" | "api" };

      if (!transcript && !flashcards) {
        return res.status(400).json({ error: "Transcript or flashcards are required" });
      }

      console.log(`[API] Generating mind map using Flashcards or Transcript...`);
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (geminiApiKey && mode !== "gpu") {
        try {
          const genAI = new GoogleGenerativeAI(geminiApiKey);

          let contentSource = "";
          let hasArabic = false;

          if (flashcards && flashcards.length > 0) {
            const flashcardsText = JSON.stringify(flashcards);
            contentSource = `FLASHCARDS JSON DATA:\n${flashcardsText}\n\n`;
            hasArabic = /[\u0600-\u06FF]/.test(flashcardsText);
          } else {
            contentSource = `Transcript fragment:\n${transcript!.substring(0, 15000)}\n\n`;
            hasArabic = /[\u0600-\u06FF]/.test(transcript || "");
          }

          const targetLanguage = hasArabic ? "Arabic" : "English";

          const mindmapPrompt = `You are an expert pedagogical designer. Create a Concept Map data structure based strictly on the provided source material (which contains Flashcards or a Transcript).

CRITICAL RULES:
1. OUTPUT FORMAT: You MUST return a SINGLE valid JSON object ONLY. No markdown highlighting like \`\`\`json. The JSON must have exactly three keys: "nodes", "edges", and "interactiveGuide".
2. "nodes": An array of objects. Each object MUST have:
   - "id": A unique string ID (e.g. "1", "2").
   - "label": The purely theoretical concept text. Keep it concise. Focus on the core concepts presented in the flashcards (if provided).
3. "edges": An array of objects representing the arrows. Each object MUST have:
   - "id": A unique string ID (e.g. "e1-2").
   - "source": The ID of the parent node.
   - "target": The ID of the child node.
   - "label": (Optional) The verb or relationship phrase written ON the arrow (e.g. "يؤدي إلى", "يعتمد على" in Arabic, or "leads to" in English).
4. Identify the PRIMARY language from the source text. ALL output MUST be in that exact primary language.
5. NO FORMULAS OR NUMBERS. Extract ONLY pure qualitative theoretical concepts.
6. "interactiveGuide": An array of objects. Each MUST have "node" (name of the concept) and "explanation" (contextual academic explanation based on the flashcard definitions).

Ensure the graph flows logically. If flashcards are provided, map out the connections between the terms defined in them.

Source Material:
${contentSource}
`;

          let aiResponse = await callGeminiWithRetry(genAI, mindmapPrompt, "gemini-2.0-flash", 3, 0.3, "application/json");

          let finalPayload = aiResponse;
          try {
            // Attempt to clean any potential markdown and parse JSON
            const cleanJson = aiResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleanJson);

            // Structure enforcing
            if (!parsed.nodes) parsed.nodes = [];
            if (!parsed.edges) parsed.edges = [];
            if (!parsed.interactiveGuide) parsed.interactiveGuide = [];

            finalPayload = JSON.stringify(parsed);
          } catch (e) {
            console.error("[API] Mindmap AI response was not valid JSON, applying fallback:", e);
            finalPayload = JSON.stringify({
              nodes: [{ id: "1", label: "Failed to parse map" }],
              edges: [],
              interactiveGuide: []
            });
          }

          console.log(`[API] Generated Mindmap payload (${finalPayload.length} chars)`);
          return res.json({ mindmap: finalPayload });
        } catch (error: any) {
          console.error("[API] Failed to generate mind map via Gemini:", error);
        }
      }

      // Fallback simple mindmap
      return res.json({ mindmap: "mindmap\n  Root\n    Topic 1\n    Topic 2" });
    } catch (error: any) {
      console.error("[API] Error in mindmap endpoint:", error);
    }
  });

  /**
   * Image analysis endpoint using Gemini Vision
   * POST /api/ai/analyze-image
   * Body: { "imageUrl": "...", "transcript": "..." }
   * Returns: { "description": "..." }
   */
  app.post("/api/ai/analyze-image", async (req: Request, res: Response) => {
    try {
      const { imageUrl, transcript } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      console.log(`[API] Analyzing image: ${imageUrl}`);
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (!geminiApiKey) {
        return res.status(500).json({ error: "Gemini API key not configured" });
      }

      // We need to get the image buffer
      let imageBuffer: Buffer;
      let mimeType = "image/jpeg";

      try {
        if (imageUrl.startsWith("http")) {
          const imgRes = await fetch(imageUrl);
          if (!imgRes.ok) throw new Error("Failed to fetch image");
          const arrayBuffer = await imgRes.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
          mimeType = imgRes.headers.get("content-type") || "image/jpeg";
        } else if (imageUrl.startsWith("/uploads/")) {
          const localPath = path.join(process.cwd(), imageUrl);
          imageBuffer = readFileSync(localPath);
          mimeType = imageUrl.endsWith(".png") ? "image/png" : "image/jpeg";
        } else {
          throw new Error("Invalid image URL format");
        }
      } catch (e: any) {
        console.error("[API] Failed to get image for analysis:", e);
        return res.status(400).json({ error: "Could not access image for analysis" });
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const hasArabic = /[\u0600-\u06FF]/.test(transcript || "");
      const outputLanguage = hasArabic ? "Arabic" : "English";

      const prompt = `Act as an expert academic assistant. Analyze this image in detail.
While this image was extracted from a lecture/presentation context, you should use your full AI knowledge base to accurately and comprehensively explain what is in it.

Lecture context (for reference only, may not be relevant):
${transcript ? transcript.substring(0, 500) : "No context provided."}

Please provide a clear, concise, and academic explanation of the concepts, diagrams, charts, or text shown in this image. Do not hallucinate based on the context if the image shows something else.
Ensure your response is ONLY in ${outputLanguage} and formatted neatly as a description.`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBuffer.toString("base64"),
            mimeType: mimeType
          }
        }
      ]);

      const description = result.response.text().trim();
      res.json({ description });

    } catch (error: any) {
      console.error("[API] Error analyzing image:", error);
      res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  /**
   * Category classification endpoint using AI
   * POST /api/ai/category
   * Body: { "title": "...", "transcript": "...", "summary": "...", "mode": "gpu" | "api" }
   * Returns: { "category": "science" | "technology" | ... }
   */
  app.post("/api/ai/category", async (req: Request, res: Response) => {
    try {
      const { title, transcript, summary, mode } = req.body as {
        title?: string;
        transcript?: string;
        summary?: string | string[];
        mode?: "gpu" | "api";
      };

      const isGpuMode = mode === "gpu";
      console.log(`[API] Category endpoint hit with mode: ${mode} `);

      if (!title && !transcript && !summary) {
        return res.status(400).json({
          error: "At least one of title, transcript, or summary is required",
        });
      }

      const content = [
        title || "",
        typeof summary === "string" ? summary : Array.isArray(summary) ? (summary as string[]).join(" ") : "",
        transcript || "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .substring(0, 10000); // Limit content length

      console.log(`[API] Classifying lecture category(${content.length} characters)`);

      const categories = [
        "science",
        "technology",
        "mathematics",
        "medicine",
        "history",
        "art",
        "language",
        "business",
        "education",
        "other",
      ];

      const categoryDescriptions: Record<string, string> = {
        science: "Natural sciences: Physics, Chemistry, Biology, Scientific research, Experiments, Quantum mechanics, Molecular biology",
        technology: "Computer science and technology: Programming languages, Software development, Computer systems, Web development, Mobile apps, IT infrastructure. Only use this for technical/computer-related content, NOT for general topics that happen to mention technology.",
        mathematics: "Mathematical topics: Math, Calculus, Algebra, Geometry, Statistics, Equations, Mathematical proofs, Number theory",
        medicine: "Medical and health sciences: Medical practice, Health, Anatomy, Physiology, Surgery, Treatment, Clinical medicine, Healthcare",
        history: "Historical topics: Historical events, Ancient civilizations, Wars, Empires, Historical periods, Historical analysis",
        art: "Arts and creative fields: Visual arts, Painting, Sculpture, Design, Creative works, Aesthetics, Art history, Artistic techniques",
        language: "Languages and linguistics: Language learning, Linguistics, Literature, Writing, Poetry, Language structure, Translation",
        business: "Business and economics: Business management, Marketing, Finance, Economics, Entrepreneurship, Business strategy, Commerce",
        education: "Educational content: Teaching methods, Learning strategies, Academic courses, Educational theory, Pedagogy, Study techniques",
        other: "Any topic that does not clearly fit into the above categories",
      };

      const hasArabic = /[\u0600-\u06FF]/.test(content);
      const language = hasArabic ? "Arabic" : "English";

      // Priority 1: Gemini API
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (geminiApiKey && !isGpuMode) {
        try {
          console.log("[API] Using Gemini API for category classification");
          const genAI = new GoogleGenerativeAI(geminiApiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          const prompt = `You are an expert content classifier.Analyze the following lecture content and classify it into ONE of these categories:

          Categories:
${categories
              .map(
                (cat) =>
                  `- ${cat}: ${categoryDescriptions[cat]}`,
              )
              .join("\n")
            }

CRITICAL REQUIREMENTS:
          - The content is in ${language}.Respond in ${language} if needed, but the category name must be in English(one of: ${categories.join(", ")}).
- Analyze the MAIN TOPIC and PRIMARY FOCUS of the content, not just keywords that appear.
- Be precise: Only classify as "technology" if the content is primarily about computer science, programming, or technical IT topics.
- If the content mentions technology but is about another subject(e.g., "How AI is used in medicine" → medicine, not technology), classify by the MAIN subject.
- Return ONLY the category name(one word) in lowercase, nothing else. No explanations, no additional text.
- Examples:
          - "Introduction to Quantum Mechanics" → science
            - "Python Programming Tutorial" → technology
              - "Calculus Basics" → mathematics
                - "History of Ancient Rome" → history
                  - "How AI is Transforming Healthcare" → medicine(not technology)
                    - "Business Strategy for Startups" → business
                      - "Learning Spanish Grammar" → language

Content to classify:
          Title: ${title || "N/A"}
          Summary: ${typeof summary === "string" ? summary.substring(0, 500) : Array.isArray(summary) ? (summary as string[]).join(" ").substring(0, 500) : "N/A"}
          Transcript(first 2000 chars): ${transcript?.substring(0, 2000) || "N/A"}

          Category: `;

          const categoryPrompt = `You are an expert content classifier.Analyze the following and classify it into ONE of: ${categories.join(", ")}.
          Return ONLY the single word for the category in lowercase.
            Title: ${title || "N/A"}
          Content: ${transcript?.substring(0, 5000) || "N/A"}
          Category: `;

          const aiResponse = await callGeminiWithRetry(genAI, categoryPrompt, "gemini-2.5-flash");
          const text = aiResponse.toLowerCase();

          // Extract category from response - improved matching
          let category = "other";

          // Clean the response - remove common prefixes/suffixes
          const cleanedText = text
            .replace(/^(category|class|type|result|answer):?\s*/i, "")
            .replace(/\s*\.\s*$/, "")
            .trim()
            .toLowerCase();

          // First, try exact match at the start of cleaned response
          const firstWord = cleanedText.split(/\s+/)[0];
          if (categories.includes(firstWord)) {
            category = firstWord;
          } else {
            // Try to find category as a whole word in the response
            for (const cat of categories) {
              // Check if category appears as a whole word (not part of another word)
              const regex = new RegExp(`\\b${cat} \\b`, "i");
              if (regex.test(cleanedText)) {
                category = cat;
                break;
              }
            }
          }

          // Validate the category
          if (!categories.includes(category)) {
            console.warn(`[API] Invalid category "${category}" from Gemini, defaulting to "other"`);
            category = "other";
          }

          console.log(`[API] Gemini classified as: ${category} (from response: "${text.substring(0, 100)}...")`);
          return res.json({ category });
        } catch (error: any) {
          console.error("[API] Gemini classification error:", error);
          // Fall through to Ollama
        }
      }

      // Priority 2: Ollama (GPU mode)
      if (isGpuMode) {
        const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
        const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:32b";

        try {
          console.log(`[API] Using Ollama model for category classification: ${ollamaModel} `);

          const prompt = `You are an expert content classifier.Analyze the following lecture content and classify it into ONE of these categories:

  Categories:
${categories
              .map(
                (cat) =>
                  `- ${cat}: ${categoryDescriptions[cat]}`,
              )
              .join("\n")
            }

Analyze the content and return ONLY the category name(one word) in lowercase.

    Content:
  Title: ${title || "N/A"}
  Summary: ${typeof summary === "string" ? summary.substring(0, 500) : Array.isArray(summary) ? (summary as string[]).join(" ").substring(0, 500) : "N/A"}
  Transcript: ${transcript?.substring(0, 2000) || "N/A"}

  Category: `;

          const ollamaResponse = await fetch(`${ollamaUrl} /api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: ollamaModel,
              prompt: prompt,
              stream: false,
              options: {
                temperature: 0.3,
                top_p: 0.9,
                num_predict: 50,
              },
            }),
          });

          if (ollamaResponse.ok) {
            const ollamaData = await ollamaResponse.json();
            const text = ollamaData.response?.trim().toLowerCase() || "";

            let category = "other";
            for (const cat of categories) {
              if (text.includes(cat)) {
                category = cat;
                break;
              }
            }

            console.log(`[API] Ollama classified as: ${category} `);
            return res.json({ category });
          }
        } catch (error: any) {
          console.error("[API] Ollama classification error:", error);
        }
      }

      // Fallback: Return "other" if both AI methods fail
      console.log("[API] AI classification failed, using fallback");
      return res.json({ category: "other" });
    } catch (error: any) {
      console.error("[API] Category classification error:", error);
      return res.status(500).json({
        error: "Failed to classify lecture category",
        details: error.message,
      });
    }
  });

  /**
   * Quiz generation endpoint using Gemini API
   * POST /api/ai/quiz
   */
  app.post("/api/ai/quiz", async (req: Request, res: Response) => {
    try {
      const { transcript, title, mode = "comprehensive" } = req.body;

      if ((!transcript || typeof transcript !== "string" || transcript.trim().length < 100) && !title) {
        return res.status(400).json({
          error: "Transcript or Title is required to generate quiz questions",
        });
      }

      console.log(`[API] Generating quiz(${mode}) for transcript(${transcript?.length || 0} chars).Title: ${title} `);

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured" });
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const hasArabic = /[\u0600-\u06FF]/.test(transcript || title || "");
      const language = hasArabic ? "Arabic" : "English";

      let promptInstructions = "";
      switch (mode) {
        case "advanced":
          promptInstructions = "Difficulty: Medium to Hard. Focus on application and analysis. Questions should be challenging.";
          break;
        case "expert":
          promptInstructions = "Difficulty: Very Hard. Focus on critical thinking, complex scenarios, and deep understanding.";
          break;
        case "comprehensive":
        default:
          promptInstructions = "Difficulty: Mix of Easy (30%), Medium (40%), and Hard (30%). Cover all basics and advanced topics comprehensively.";
          break;
      }

      const quizPrompt = `Generate a quiz exam in JSON format based on the transcript and the topic: "${title || 'General Topic'}".
      
      DIFFICULTY LEVEL: ${promptInstructions}

      CRITICAL INSTRUCTIONS:
1. Source Material Strategy:
- 70 - 80 % of questions MUST be directly from the transcript(Source: "uploaded_content").
         - 20 - 30 % of questions MUST be based on general knowledge related to the topic "${title}", testing broader understanding beyond the specific video content(Source: "related_topic").
         - For 'expert' mode, increase general knowledge questions to 40 - 50 %.
      2. Question Count: Generate exactly 20 questions(to ensure high quality and complete response).
      3. Distribution:
- 10 Multiple Choice Questions
  - 7 True / False Questions
    - 3 Open - Ended / Essay Questions
4. Content Logic:
- If the topic involves Mathematics, Engineering, or Physics:
           * Essay questions MUST be numerical problems / exercises.
           * Multiple Choice questions MUST include numerical problems.
           * Purely theoretical questions in Multiple Choice should be minimized.
         - For other topics, focus on key concepts and understanding.
      5. Ordering & Variety:
- SHUFFLE the questions in the final JSON array.
         - Do NOT group questions by type(e.g.do NOT put all MCQs first).
         - Do NOT group by source(e.g.do NOT put all video questions first).
         - Mix Easy, Medium, and Hard questions randomly(adhering to the difficulty mode).
      6. Essay Questions:
- Must include "expected_keywords"(array of strings) that would appear in a correct answer.
         - IF the question is a Mathematical, Physics, or Engineering numerical problem, the "expected_keywords" MUST ONLY contain the final numerical answer(s) to be computed, NO TEXTual words(e.g., ["9.8", "-4.5", "10"]).
         - IF it is a theoretical / descriptive question, "expected_keywords" should contain the core conceptual words expected.
      7. Language: Detect and respond in the SAME language as the transcript(${language}).
      7. References: For EACH question, you MUST provide a "reference" object:
- "concept": The specific concept being tested(e.g., "Polymorphism").
         - "location": 
            * If "source_type" is "uploaded_content": Provide the approximate timestamp(e.g., "05:20").
            * If "source_type" is "related_topic": You MUST provide a specific, real - world citation.Example: "Book: 'Clean Code' by Robert C. Martin, Ch. 2" or "Website: 'MDN Web Docs - Array Methods'".Do NOT use generic terms like "General Knowledge".
         - "source_type": Use "uploaded_content" if the info is present in the transcript.Use "related_topic" if you used outside knowledge.

  Format: Return ONLY valid JSON with this EXACT structure(pay attention to "type" field):
{
  "questions": [
    {
      "id": 1,
      "text": "Question text...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "type": "multiple_choice",
      "reference": {
        "concept": "Core Concept (e.g. Variables)",
        "location": "Approx timestamp (e.g. 05:30) or 'General Knowledge'",
        "source_type": "uploaded_content" OR "external_knowledge"
            }
    },
    {
      "id": 16,
      "text": "True/False Statement...",
      "options": ["True", "False"],
      "correct_answer": "True",
      "type": "true_false",
      "reference": {
        "concept": "Concept...",
        "location": "Location...",
        "source_type": "uploaded_content"
      }
    },
    {
      "id": 26,
      "text": "Essay question text...",
      "type": "open_ended",
      "expected_keywords": ["keyword1", "keyword2"],
      "reference": {
        "concept": "Concept...",
        "location": "Location...",
        "source_type": "external_knowledge"
      }
    }
  ]
}
IMPORTANT: Ensure "true_false" questions have type "true_false" and options["True", "False"](or Arabic equivalents).
  Transcript: ${(transcript || "").substring(0, 20000)} `;

      // Enable retries (3) to allow fallback to other models
      const aiResponse = await callGeminiWithRetry(genAI, quizPrompt, "gemini-2.5-flash", 3, undefined, "application/json");

      let parsedResponse;
      try {
        const cleanedResponse = aiResponse.replace(/```json\n ? /g, "").replace(/```\n?/g, "").trim();
        parsedResponse = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error("[API] Failed to parse JSON from Gemini quiz response:", parseError);
        return res.status(500).json({ error: "Failed to generate valid quiz JSON" });
      }

      return res.json(parsedResponse);
    } catch (error: any) {
      console.error("[API] Error generating quiz:", error);
      res.status(500).json({ error: "Failed to generate quiz questions" });
    }
  });

  /**
   * Evaluate Essay Answer endpoint
   * POST /api/ai/evaluate-answer
   */
  app.post("/api/ai/evaluate-answer", async (req: Request, res: Response) => {
    try {
      const { question, userAnswer, correctAnswer, expectedKeywords = [] } = req.body;

      if (!question || !userAnswer) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured" });
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const isArabic = /[\u0600-\u06FF]/.test(userAnswer + question);
      const languageText = isArabic ? "Arabic" : "English";

      const prompt = `You are an expert examiner.Evaluate the student's answer to the given question.

Question: "${question}"
      Reference Correct Answer / Context: "${correctAnswer || 'N/A'}"
      Expected Keywords: ${expectedKeywords.join(', ') || 'None'}
      Student's Answer: "${userAnswer}"

      CRITICAL RULE FOR NUMERICAL / MATH QUESTIONS:
      If the \`Expected Keywords\` represent a Numerical Answer (e.g., numbers, formulas, equations) or the question is a math/physics problem requiring a calculated result:
      - STRICT EVALUATION: The student's answer is either completely correct (100%) or completely wrong (0%) based purely on whether their final number/expression is mathematically equivalent to the expected keyword(s). 
      - Do NOT give partial credit (e.g., 60%) for just having a "close" number. It is 100% or 0%.
      - If it is correct, similarityScore MUST be 100, isCorrect MUST be true.
      - If it is incorrect, similarityScore MUST be 0, isCorrect MUST be false.
      - ONLY use similarityScore between 1 and 99 for partial marking in theoretical/essay (text) questions!

      Provide your evaluation in JSON format exactly like this:
      {
        "similarityScore": <number between 0 and 100 representing how close the student's answer is to the correct concepts>,
        "isCorrect": <boolean: true if similarityScore is >= 60, false otherwise. AND for math, it must be strict.>,
        "feedback": "<string: In ${languageText}, tell the user why they are correct or incorrect.>",
        "correctAnswer": "<string: In ${languageText}, provide a very short and brief correct answer. If the student is correct, just write the core answer without extra details.>"
      }
      
      Do NOT include markdown block markers like \`\`\`json. Return only raw JSON.`;

      const aiResponse = await callGeminiWithRetry(genAI, prompt, "gemini-2.5-flash", 2);

      let parsedResponse;
      try {
        const cleanedResponse = aiResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsedResponse = JSON.parse(cleanedResponse);
      } catch (e) {
        return res.status(500).json({ error: "Failed to parse evaluation response" });
      }

      return res.json(parsedResponse);
    } catch (error: any) {
      console.error("[API] Error evaluating answer:", error);
      res.status(500).json({ error: "Failed to evaluate answer" });
    }
  });

  /**
   * AI Flashcards endpoint
   * POST /api/ai/flashcards
   * Body: { "transcript": "...", "mode": "api" | "gpu" }
   * Returns: { "flashcards": [{ "id": 1, "term": "...", "definition": "..." }] }
   */
  app.post("/api/ai/flashcards", async (req: Request, res: Response) => {
    try {
      const { transcript, mode } = req.body as { transcript?: string; mode?: "gpu" | "api" };

      const isGpuMode = mode === "gpu";

      if (!transcript || typeof transcript !== "string" || transcript.trim().length < 200) {
        return res.status(400).json({
          error: "Transcript is too short to generate flashcards (minimum 200 characters)",
        });
      }

      console.log(`[API] Generating flashcards for transcript (${transcript.length} characters)`);

      // Priority 1: Gemini API (skip if GPU mode is requested)
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (geminiApiKey && !isGpuMode) {
        try {
          console.log("[API] Using Gemini API for flashcards generation");
          const genAI = new GoogleGenerativeAI(geminiApiKey);
          const flashcardPrompt = `Create 10-15 study flashcards in JSON format: { "flashcards": [{ "id": 1, "term": "...", "definition": "..." }] }. Use the same language as transcript.
          CRITICAL: If the transcript contains mathematical formulas, laws, or equations, you MUST preserve them using standard LaTeX format (e.g., $inline$ or $$block$$) in both the term and definition.
          Transcript: ${transcript.substring(0, 20000)}`;
          const aiResponse = await callGeminiWithRetry(genAI, flashcardPrompt, "gemini-2.5-flash", 3, undefined, "application/json");

          if (aiResponse) {
            // Parse JSON from response (remove markdown code blocks if present)
            let parsedResponse: { flashcards?: any[] };
            try {
              const cleanedResponse = aiResponse
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
              parsedResponse = JSON.parse(cleanedResponse);
            } catch (parseError) {
              console.warn("[API] Failed to parse JSON from Gemini flashcards response");
              parsedResponse = { flashcards: [] };
            }

            if (parsedResponse.flashcards && Array.isArray(parsedResponse.flashcards) && parsedResponse.flashcards.length > 0) {
              // Validate and format flashcards
              const validFlashcards = parsedResponse.flashcards
                .filter((f: any) => f.term && f.definition && f.term.trim().length > 0 && f.definition.trim().length > 0)
                .map((f: any, index: number) => ({
                  id: index + 1,
                  term: f.term.trim(),
                  definition: f.definition.trim(),
                }));

              if (validFlashcards.length > 0) {
                console.log(`[API] Gemini flashcards generated with ${validFlashcards.length} cards`);
                return res.json({ flashcards: validFlashcards });
              }
            }
          }
        } catch (geminiError: any) {
          console.error("[API] Gemini API error for flashcards:", geminiError);
          // Fall through to fallback
        }
      }

      // Priority 2: Ollama (GPU mode)
      if (isGpuMode) {
        const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
        const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:32b";

        try {
          console.log(`[API] Using Ollama model for flashcards: ${ollamaModel}`);

          const hasArabic = /[\u0600-\u06FF]/.test(transcript);
          const language = hasArabic ? "Arabic" : "English";

          const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: ollamaModel,
              prompt: `You are an expert educational content creator. Create 8-15 high-quality study flashcards based on the following lecture transcript.

CRITICAL REQUIREMENTS:
- The transcript is in ${language}. You MUST write ALL terms and definitions in ${language}. Do NOT translate.
- Generate flashcards for key concepts, important terms, definitions, formulas, dates, names, or significant facts.
- Each flashcard should have a clear, concise term (front) and a detailed, informative definition (back).
- Focus on the most important and memorable information that would help students master the material.
- CRITICAL: If the transcript contains mathematical formulas, laws, or equations, you MUST preserve them using standard LaTeX format (e.g., $inline$ or $$block$$) in both the term and definition.
- Return ONLY valid JSON in this exact format (no markdown, no code blocks, no extra text):
{
  "flashcards": [
    {
      "id": 1,
      "term": "Term or concept name",
      "definition": "Detailed explanation or definition of the term"
    }
  ]
}

Transcript:
${transcript.substring(0, 20000)}

Generate the flashcards as JSON:`,
              stream: false,
              options: {
                temperature: 0.4,
                top_p: 0.9,
                top_k: 40,
                repeat_penalty: 1.1,
                num_predict: 3000,
                num_ctx: 8192,
              },
            }),
          });

          if (ollamaResponse.ok) {
            const ollamaData = await ollamaResponse.json();
            const aiResponse: string = (ollamaData.response || "").trim();

            if (aiResponse) {
              try {
                const cleanedResponse = aiResponse
                  .replace(/```json\n?/g, "")
                  .replace(/```\n?/g, "")
                  .trim();
                const parsedResponse = JSON.parse(cleanedResponse);

                if (parsedResponse.flashcards && Array.isArray(parsedResponse.flashcards) && parsedResponse.flashcards.length > 0) {
                  const validFlashcards = parsedResponse.flashcards
                    .filter((f: any) => f.term && f.definition && f.term.trim().length > 0 && f.definition.trim().length > 0)
                    .map((f: any, index: number) => ({
                      id: index + 1,
                      term: f.term.trim(),
                      definition: f.definition.trim(),
                    }));

                  if (validFlashcards.length > 0) {
                    console.log(`[API] Ollama flashcards generated with ${validFlashcards.length} cards`);
                    return res.json({ flashcards: validFlashcards });
                  }
                }
              } catch (parseError) {
                console.warn("[API] Failed to parse JSON from Ollama flashcards response");
              }
            }
          }
        } catch (ollamaError) {
          console.error("[API] Ollama flashcards generation error:", ollamaError);
        }
      }

      // Fallback: Simple flashcards generation
      console.log("[API] Using fallback flashcards generation");
      const sentences = transcript
        .split(/[.!؟\n]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 30 && s.length < 200);

      const flashcards: any[] = [];
      const hasArabic = /[\u0600-\u06FF]/.test(transcript);

      if (sentences.length > 0) {
        // Extract key terms and create simple flashcards
        const keyTerms = sentences.slice(0, Math.min(10, sentences.length));
        keyTerms.forEach((sentence, index) => {
          const words = sentence.split(/\s+/);
          if (words.length > 3) {
            const term = words.slice(0, 3).join(" ");
            flashcards.push({
              id: index + 1,
              term: term,
              definition: sentence,
            });
          }
        });
      }

      if (flashcards.length === 0) {
        flashcards.push({
          id: 1,
          term: hasArabic ? "المفهوم الرئيسي" : "Main Concept",
          definition: hasArabic ? "المفهوم الرئيسي الذي تمت مناقشته في هذه المحاضرة" : "The main concept discussed in this lecture",
        });
      }

      return res.json({ flashcards });
    } catch (error: any) {
      console.error("[API] Error generating flashcards:", error);
      res.status(500).json({ error: "Failed to generate flashcards" });
    }
  });

  /**
   * AI Formulas endpoint
   * POST /api/ai/formulas
   * Body: { "transcript": "...", "mode": "api" | "gpu" }
   */
  app.post("/api/ai/formulas", async (req: Request, res: Response) => {
    try {
      const { transcript, mode, geminiFileUri, geminiFileMimeType } = req.body as { transcript?: string; mode?: "gpu" | "api"; geminiFileUri?: string; geminiFileMimeType?: string; };

      const isGpuMode = mode === "gpu";

      if (!transcript || typeof transcript !== "string" || transcript.trim().length < 200) {
        return res.status(400).json({
          error: "Transcript is too short to generate formulas (minimum 200 characters)",
        });
      }

      console.log(`[API] Extracting formulas from transcript (${transcript.length} characters)`);

      const hasArabic = /[\u0600-\u06FF]/.test(transcript);
      const languageText = hasArabic ? "Arabic" : "English";

      const prompt = `You are a strict data science and engineering professor.
Your ONLY task is to return a JSON array of mathematical formulas, equations, statistical rules, or laws found in the transcript.

CRITICAL REQUIREMENTS:
- **STRICT ENFORCEMENT:** You MUST ONLY extract formulas if the transcript EXPLICITLY contains mathematical concepts, physics formulas, algorithms, or numeric logic.
- **DO NOT HALLUCINATE OR INVENT:** If the transcript is about history, psychology, general conversational topics, or does NOT contain significant mathematical/scientific numbers, you MUST return an empty array: \`{ "formulas": [] }\`. THIS IS A STRICT RULE. Do not force the creation of fake formulas.
- Write ALL names and descriptions in ${languageText}. (Keep LaTeX formulas in standard mathematical notation).
- Format: \`{ "formulas": [ { "id": 1, "name": "...", "formula": "c = \\sqrt{a^2+b^2}", "description": "...", "category": "Statistics" } ] }\`
- Categories: Algebra, Calculus, Geometry, Trigonometry, Statistics, Physics, Chemistry, Machine Learning, Computer Science, Other.
- In "description", you MUST wrap all inline variables, numbers, or short expressions in $...$ (e.g., $x$, $P(y=0)$).
- NEVER use double quotes (") inside strings. Use single quotes.

Return ONLY valid JSON in this exact structure (no markdown borders, no code blocks, just raw JSON):
{
  "formulas": [
    {
      "id": 1,
      "name": "formula name",
      "formula": "latex representation",
      "description": "detailed description of the formula and its variables",
      "category": "category name"
    }
  ]
}

Transcript for Analysis:
${transcript.substring(0, 25000)}`;

      // Priority 1: Gemini API
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (geminiApiKey && !isGpuMode) {
        try {
          console.log("[API] Using Gemini API for formulas extraction");
          // Non-null assertion on geminiApiKey to fix TS error since we checked it above
          const genAI = new GoogleGenerativeAI(geminiApiKey!);

          let apiPrompt: string | any[] = prompt;
          if (geminiFileUri && geminiFileMimeType) {
            console.log(`[API] Using Vision API with file ${geminiFileUri} for formula extraction.`);
            apiPrompt = [
              prompt,
              {
                fileData: {
                  fileUri: geminiFileUri,
                  mimeType: geminiFileMimeType,
                },
              },
            ];
          }

          const aiResponse = await callGeminiWithRetry(genAI, apiPrompt, "gemini-2.5-flash", 3, 0.1, "application/json");

          if (aiResponse) {
            let parsedResponse: { formulas?: any[] } = { formulas: [] };
            let cleanedResponse = aiResponse
              .replace(/```json\n?/gi, "")
              .replace(/```\n?/g, "")
              .trim();

            // Try to extract just the JSON part in case the model added conversational text
            const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              cleanedResponse = jsonMatch[0];
            }

            try {
              // Fix unescaped backslashes before non-standard JSON escape characters (crucial for LaTeX)
              const strictCleaned = cleanedResponse.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
              parsedResponse = JSON.parse(strictCleaned);
            } catch (parseError) {
              console.warn("[API] Failed to parse JSON from Gemini formulas response, using Regex fallback");

              const formulasFallback: any[] = [];
              const formulaBlocks = cleanedResponse.split(/\{\s*"id"|\{\s*"name"/).slice(1);

              for (let i = 0; i < formulaBlocks.length; i++) {
                const block = formulaBlocks[i];
                const nameMatch = block.match(/"name"\s*:\s*"([^"]*)"/);
                const formulaMatch = block.match(/"formula"\s*:\s*"([^"]*)"/);
                const descMatch = block.match(/"description"\s*:\s*"([^"]*)"/);
                const catMatch = block.match(/"category"\s*:\s*"([^"]*)"/);

                if (nameMatch && formulaMatch) {
                  formulasFallback.push({
                    id: i + 1,
                    name: nameMatch[1],
                    formula: formulaMatch[1].replace(/\\\\/g, "\\"),
                    description: descMatch ? descMatch[1] : "",
                    category: (catMatch ? catMatch[1] : "Other")
                  });
                }
              }

              if (formulasFallback.length > 0) {
                parsedResponse = { formulas: formulasFallback };
              }
            }

            if (parsedResponse.formulas && Array.isArray(parsedResponse.formulas)) {
              console.log(`[API] Gemini formulas extraction found ${parsedResponse.formulas.length} formulas`);
              return res.json({ formulas: parsedResponse.formulas });
            }
          }
        } catch (geminiError: any) {
          console.error("[API] Gemini API error for formulas:", geminiError);
        }
      }

      // Priority 2: Ollama (GPU mode)
      if (isGpuMode) {
        const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
        const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:32b";

        try {
          console.log(`[API] Using Ollama model for formulas: ${ollamaModel}`);
          const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: ollamaModel,
              prompt: prompt,
              stream: false,
              options: { temperature: 0.1, top_p: 0.9, top_k: 40 },
            }),
          });

          if (ollamaResponse.ok) {
            const ollamaData = await ollamaResponse.json();
            const aiResponse: string = (ollamaData.response || "").trim();

            if (aiResponse) {
              try {
                let cleanedResponse = aiResponse
                  .replace(/```json\n?/gi, "")
                  .replace(/```\n?/g, "")
                  .trim();

                const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  cleanedResponse = jsonMatch[0];
                }

                // Fix unescaped backslashes before non-standard JSON escape characters (crucial for LaTeX)
                cleanedResponse = cleanedResponse.replace(/\\([^"\\/bfnrtu\n\r])/g, '\\\\$1');

                const parsedResponse = JSON.parse(cleanedResponse);

                if (parsedResponse.formulas && Array.isArray(parsedResponse.formulas)) {
                  console.log(`[API] Ollama formulas generated with ${parsedResponse.formulas.length} formulas`);
                  return res.json({ formulas: parsedResponse.formulas });
                }
              } catch (parseError) {
                console.warn("[API] Failed to parse JSON from Ollama formulas response. Raw output:", aiResponse);
              }
            }
          }
        } catch (ollamaError) {
          console.error("[API] Ollama formulas extraction error:", ollamaError);
        }
      }

      // Fallback: Return empty formulas array (graceful degradation)
      console.log("[API] No formulas could be extracted or generated");
      return res.json({ formulas: [] });
    } catch (error: any) {
      console.error("[API] Error generating formulas:", error);
      res.status(500).json({ error: "Failed to generate formulas" });
    }
  });

  /**
   * Text summarization endpoint using Gemini API
   * POST /api/summarize
   */
  app.post("/api/summarize", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "Text is required" });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "Gemini API key is not configured" });
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `You are a high-level academic content summarizer. Analyze the provided text and structure your response exactly as follows:

1. **Introduction**: A brief overview of the main topic and its significance (2-3 sentences).
2. **Summary**: A comprehensive but concise summary of the core concepts and arguments.
3. **Key Points**: A bulleted list of the most important takeaways and specific details.

CRITICAL RULES:
- Detect the language of the input text and respond in the SAME language.
- If the content is mathematical or scientific, ensure formulas and numerical data are preserved.
- Return the response as valid JSON with these keys: "introduction", "summary", "keypoints" (as an array of strings).

Text to summarize:
${text.substring(0, 30000)}`;

      const summarizePrompt = `Summarize this text in 3 sections: introduction, summary, keypoints.
Return ONLY valid JSON: { "introduction": "...", "summary": "...", "keypoints": ["...", "..."] }.
Language: Match input.
Text: ${text.substring(0, 25000)}`;

      const aiResponse = await callGeminiWithRetry(genAI, summarizePrompt, "gemini-2.5-flash");

      let parsedResponse;
      let cleanedResponse = aiResponse.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }

      try {
        // Remove invalid escapes
        const strictCleaned = cleanedResponse.replace(/\\([^"\\/bfnrtu])/g, '$1');
        parsedResponse = JSON.parse(strictCleaned);
      } catch (e) {
        console.warn("[API] Failed to parse /api/summarize JSON, using regex fallback");

        const extractField = (fieldName: string) => {
          const match = cleanedResponse.match(new RegExp(`"${fieldName}"\\s*:\\s*(?:\\[(.*?)\\]|"([^"]*)")`, "is"));
          if (match) {
            if (match[1] !== undefined) {
              const arrMatch = match[1].match(/"([^"]*)"/g);
              return arrMatch ? arrMatch.map((s: string) => s.replace(/^"|"$/g, "").replace(/\\n/g, "\n")) : [];
            }
            return match[2] !== undefined ? match[2].replace(/\\n/g, "\n") : null;
          }
          return null;
        };

        const intro = extractField("introduction");
        const summ = extractField("summary");
        const kp = extractField("keypoints");

        if (!intro && !summ && (!kp || kp.length === 0)) {
          parsedResponse = { introduction: "", summary: cleanedResponse, keypoints: [] };
        } else {
          parsedResponse = {
            introduction: typeof intro === "string" ? intro : "",
            summary: typeof summ === "string" ? summ : "",
            keypoints: Array.isArray(kp) ? kp : []
          };
        }
      }

      return res.json({
        introduction: parsedResponse.introduction,
        summary: parsedResponse.summary,
        keypoints: parsedResponse.keypoints
      });
    } catch (error: any) {
      console.error("[API] Error in /api/summarize:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  /**
   * AI Slides generation endpoint
   * POST /api/ai/slides
   * Body: { transcript, summary?, theme? }
   * Returns: { lectureTitle, language, theme, slides: [{ title, bullets, notes? }] }
   */
  app.post("/api/ai/slides", async (req: Request, res: Response) => {
    try {
      const { transcript, summary, theme = "clean", mode } = req.body as {
        transcript?: string;
        summary?: string | string[];
        theme?: "clean" | "dark" | "academic" | "vibrant";
        mode?: "gpu" | "api";
      };

      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "Transcript is required" });
      }

      const isGpuMode = mode === "gpu";
      const hasArabic = /[\u0600-\u06FF]/.test(transcript);
      const language = hasArabic ? "Arabic" : "English";

      // Priority 1: Ollama (GPU) if requested or Gemini not available
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:14b";

      if (isGpuMode || !process.env.GEMINI_API_KEY) {
        try {
          const ollamaCheck = await fetch(`${ollamaUrl}/api/tags`, {
            method: "GET",
            signal: AbortSignal.timeout(2000),
          });

          if (ollamaCheck.ok) {
            console.log(`[API] Using Ollama model: ${ollamaModel} for slides generation`);

            const slidesPrompt = language === "Arabic"
              ? `أنت مصمم عروض. أنشئ شرائح JSON من المحاضرة.

مهم جداً: JSON فقط. بدون markdown، بدون شرح.

التنسيق:
{ "lectureTitle": "عنوان", "slides": [{ "title": "عنوان 1", "bullets": ["نقطة 1", "نقطة 2", "نقطة 3"] }, { "title": "عنوان 2", "bullets": ["نقطة 1", "نقطة 2"] }] }

المتطلبات:
- 8-12 شريحة
- كل شريحة: عنوان + 3-5 نقاط
- عربي فقط
- JSON كامل وصالح

المحاضرة:
${transcript.substring(0, 25000)}

أرجع JSON:`
              : `You are an expert presentation designer. Create a professional, comprehensive slide deck from this lecture.

Requirements:
- Language: English. Write EVERYTHING in English.
- Format: Valid JSON (no markdown, no code blocks).
- Number of slides: 10-15 slides (comprehensive and detailed).

Required JSON Format:
{
  "lectureTitle": "Complete and descriptive lecture title",
  "slides": [
    {
      "title": "Clear slide title",
      "bullets": ["Detailed point one", "Detailed point two", "Detailed point three"],
      "notes": "Additional notes"
    }
  ]
}

Quality Guidelines:
1. Each slide: Clear title + 3-6 information-rich points
2. Titles: Descriptive and specific (e.g., "Core Concepts", "Practical Applications")
3. Bullets: Detailed and comprehensive (one or two sentences each)
4. Organization: Introduction -> Concepts -> Details -> Examples -> Applications -> Conclusion
5. Coverage: Comprehensive coverage of all lecture aspects

Lecture Transcript:
${transcript.substring(0, 30000)}`;

            const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: ollamaModel,
                prompt: slidesPrompt,
                stream: false,
                options: {
                  temperature: 0.2,
                  top_k: 50,
                  top_p: 0.95,
                  repeat_penalty: 1.15,
                  num_predict: 4500,  // More tokens for complete slides
                  num_ctx: 16384,
                },
              }),
            });

            if (ollamaResponse.ok) {
              const ollamaData = await ollamaResponse.json();
              const aiResponseRaw = (ollamaData.response || "").trim();

              console.log("[API] Ollama slides response length:", aiResponseRaw.length);

              // Clean and parse JSON
              let cleanedResponse = aiResponseRaw
                .replace(/```json\n?/gi, "")
                .replace(/```/g, "")
                .trim();

              const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                cleanedResponse = jsonMatch[0];
              }

              try {
                const parsedResponse = JSON.parse(cleanedResponse);

                if (parsedResponse.slides && Array.isArray(parsedResponse.slides) && parsedResponse.slides.length > 0) {
                  // Format slides
                  const formattedSlides = parsedResponse.slides.map((slide: any, index: number) => ({
                    id: index + 1,
                    title: slide.title || (language === "Arabic" ? `شريحة ${index + 1}` : `Slide ${index + 1}`),
                    content: Array.isArray(slide.bullets) ? slide.bullets : (slide.bullets ? [slide.bullets] : []),
                    notes: slide.notes || "",
                  }));

                  console.log(`[API] Ollama slides generated: ${formattedSlides.length} slides`);

                  return res.json({
                    lectureTitle: parsedResponse.lectureTitle || (language === "Arabic" ? "شرائح المحاضرة" : "Lecture Slides"),
                    language,
                    theme,
                    slides: formattedSlides,
                  });
                }
              } catch (parseError: any) {
                console.warn("[API] Failed to parse Ollama slides JSON:", parseError.message);
                // In GPU mode, don't fall back to Gemini - return error
                if (isGpuMode) {
                  return res.status(500).json({
                    error: "Failed to generate slides with Ollama (JSON parsing error)",
                    details: "Please try again or use API mode",
                  });
                }
                // Fall through to Gemini only if not in GPU mode
              }
            }
          }
        } catch (ollamaError: any) {
          console.error("[API] Ollama slides generation failed:", ollamaError.message);
          // In GPU mode, return error instead of falling back
          if (isGpuMode) {
            return res.status(500).json({
              error: "Ollama is not available for slides generation",
              details: "Please ensure Ollama is running or use API mode",
            });
          }
          // Fall through to Gemini only if not in GPU mode
        }
      }

      // Priority 2: Gemini API (only if not GPU mode)
      if (isGpuMode) {
        // Should not reach here, but just in case
        return res.status(500).json({
          error: "GPU mode slides generation failed",
          details: "Please check Ollama or use API mode",
        });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "Gemini API key not configured" });
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);

      // Use gemini-2.5-flash (most reliable and widely available)
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.3,
          topP: 0.9,
          maxOutputTokens: 4096,
        },
      });

      console.log(`[API] Using Gemini model: gemini-2.5-flash for ${language} language`);

      const prompt = language === "Arabic"
        ? `أنت مصمم عروض تقديمية خبير متخصص في المحتوى التعليمي العربي. قم بإنشاء مجموعة شرائح احترافية ومنظمة من نص المحاضرة هذا.

المتطلبات الأساسية:
- اللغة: العربية فقط. اكتب كل شيء بالعربية الفصحى أو العامية حسب نص المحاضرة.
- تنسيق المخرجات: JSON صالح فقط (بدون markdown، بدون كتل كود، بدون شرح إضافي).
- الهيكل: 8-14 شريحة إجمالاً.
- الشريحة الأولى: شريحة العنوان الرئيسي مع موضوع المحاضرة (يجب أن يكون عنواناً واضحاً وليس فارغاً).
- الشريحة الأخيرة: ملخص شامل أو النقاط الرئيسية.
- الشرائح الوسطى: محتوى منظم منطقياً يغطي الموضوع.

تنسيق JSON المطلوب (يجب أن يكون صالحاً تماماً):
{
  "lectureTitle": "عنوان المحاضرة الكامل",
  "slides": [
    {
      "title": "عنوان الشريحة الواضح والوصفي",
      "bullets": ["نقطة رئيسية أولى", "نقطة رئيسية ثانية", "نقطة رئيسية ثالثة"],
      "notes": "ملاحظات اختيارية"
    }
  ]
}

الإرشادات المهمة جداً:
1. كل شريحة يجب أن تحتوي على عنوان واضح ومميز وليس فارغاً أبداً.
2. العناوين يجب أن تكون وصفية وتعبر عن محتوى الشريحة بوضوح.
3. كل شريحة يجب أن تحتوي على 3-6 نقاط رئيسية كحد أقصى.
4. النقاط يجب أن تكون مختصرة ولكنها مفيدة وغنية بالمعلومات.
5. هام جداً للرياضيات: لا تستخدم رموز LaTeX (مثل $...$ أو \\sqrt) مطلقاً في الشرائح. قم بتبسيط أو تحويل جميع المعادلات الرياضية إلى نص مقروء ومفهوم (مثال: اكتب "س تربيع" بدلاً من الوصف البرمجي، أو استخدم رموز عادية بسيطة). إذا كانت المعادلة معقدة، اشرح معناها بدلاً من كتابة الرموز المعقدة.
6. نظم المحتوى منطقياً: مقدمة → المفاهيم الرئيسية → تفاصيل → أمثلة → تطبيقات → خاتمة.
7. تأكد من أن كل شريحة لها عنوان واضح وليس "شريحة 1" أو "عنوان" فقط.
8. لا تترك أي شريحة بدون عنوان أو بدون نقاط.

نص المحاضرة:
${transcript.substring(0, 30000)}`
        : `You are an expert presentation designer. Create a structured slide deck from this lecture transcript.

Requirements:
- Language: English. Write EVERYTHING in English.
- Output format: Valid JSON only (no markdown, no code blocks).
- Structure: 8-14 slides total.
- First slide: Title slide with lecture topic.
- Last slide: Summary/Key Takeaways.
- Middle slides: Content organized logically.

JSON Format:
{
  "lectureTitle": "Title of the lecture",
  "slides": [
    {
      "title": "Slide title",
      "bullets": ["bullet point 1", "bullet point 2", "..."],
      "notes": "optional speaker notes"
    }
  ]
}

Guidelines:
- Each slide MUST have a clear and descriptive title.
- Each slide should have 3-6 bullet points maximum.
- Bullets should be concise but informative.
- CRITICAL FOR MATH: DO NOT use raw LaTeX (like $...$ or \\sqrt). Convert all mathematical formulas into plain, readable text (e.g. "x squared" or simple unicode like x²). If a formula is too complex, explain its meaning conceptually instead of writing raw code.
- Organize content logically (introduction → main concepts → examples → conclusion).
- Ensure every slide has a meaningful title, never leave titles empty.

Lecture Transcript:
${transcript.substring(0, 30000)}`;

      const aiResponseRaw = await callGeminiWithRetry(genAI, prompt, "gemini-2.5-flash");

      console.log("[API] Raw AI response length:", aiResponseRaw.length);
      console.log("[API] Raw AI response preview:", aiResponseRaw.substring(0, 200));

      // Clean markdown if present
      let cleanedResponse = aiResponseRaw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      // Try to extract JSON if it's embedded in text
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }

      // Try to fix common JSON issues
      // Fix unclosed strings by finding the last complete object
      let fixedResponse = cleanedResponse;
      try {
        // Try to find the last complete slide object
        const slidesMatch = fixedResponse.match(/"slides"\s*:\s*\[([\s\S]*)\]/);
        if (slidesMatch) {
          const slidesContent = slidesMatch[1];
          // Count opening and closing braces to find where JSON might be incomplete
          let braceCount = 0;
          let lastValidPos = 0;
          for (let i = 0; i < slidesContent.length; i++) {
            if (slidesContent[i] === '{') braceCount++;
            if (slidesContent[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                lastValidPos = i + 1;
              }
            }
          }
          // If we have incomplete JSON, try to close it
          if (braceCount > 0) {
            // Find the last complete slide and close the array
            const lastCompleteSlide = slidesContent.lastIndexOf('}');
            if (lastCompleteSlide > 0) {
              fixedResponse = fixedResponse.substring(0, fixedResponse.indexOf('"slides"') + 8) +
                '[' + slidesContent.substring(0, lastCompleteSlide + 1) + ']';
            }
          }
        }
      } catch (fixError) {
        console.warn("[API] Error fixing JSON, will try original:", fixError);
      }

      let parsedResponse: {
        lectureTitle?: string;
        slides?: { title?: string; bullets?: string[]; notes?: string }[];
      };

      try {
        parsedResponse = JSON.parse(fixedResponse);
      } catch (parseError: any) {
        console.warn("[API] Failed to parse slides JSON:", parseError);
        console.warn("[API] Parse error position:", parseError.message);

        // Try to extract partial data using regex
        try {
          const partialSlides: any[] = [];

          // Extract lecture title
          const titleMatch = cleanedResponse.match(/"lectureTitle"\s*:\s*"([^"]+)"/);
          const lectureTitle = titleMatch ? titleMatch[1] : (language === "Arabic" ? "شرائح المحاضرة" : "Lecture Slides");

          // Extract slides - find all slide objects, handling incomplete ones
          // Pattern to match slide objects, even if incomplete
          const slidePattern = /\{\s*"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"bullets"\s*:\s*\[([^\]]*)\]/g;
          let slideMatch;

          while ((slideMatch = slidePattern.exec(cleanedResponse)) !== null) {
            const title = slideMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const bulletsStr = slideMatch[2];

            // Parse bullets - handle both complete and incomplete arrays
            const bullets: string[] = [];
            if (bulletsStr.trim().length > 0) {
              // Try to extract bullet strings
              const bulletPattern = /"((?:[^"\\]|\\.)*)"/g;
              let bulletMatch;
              while ((bulletMatch = bulletPattern.exec(bulletsStr)) !== null) {
                bullets.push(bulletMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
              }
            }

            if (title && title.length > 0) {
              partialSlides.push({
                title,
                bullets: bullets.length > 0 ? bullets : (language === "Arabic" ? ["محتوى الشريحة"] : ["Slide content"]),
                notes: "",
              });
            }
          }

          // If regex didn't work, try a simpler approach - find all titles
          if (partialSlides.length === 0) {
            const titlePattern = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
            let titleMatch;
            while ((titleMatch = titlePattern.exec(cleanedResponse)) !== null) {
              const title = titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              if (title && title.length > 0 && !title.includes('lectureTitle')) {
                partialSlides.push({
                  title,
                  bullets: [language === "Arabic" ? "محتوى الشريحة" : "Slide content"],
                  notes: "",
                });
              }
            }
          }

          if (partialSlides.length > 0) {
            parsedResponse = {
              lectureTitle,
              slides: partialSlides,
            };
            console.log(`[API] Successfully extracted ${partialSlides.length} slides from partial JSON`);
          } else {
            throw new Error("Could not extract any slides from response");
          }
        } catch (extractError: any) {
          console.error("[API] Failed to extract partial data:", extractError);
          return res.status(500).json({
            error: "Failed to parse AI response",
            details: parseError.message,
            rawResponse: cleanedResponse.substring(0, 2000),
            suggestion: "The AI response may be incomplete. Please try again or check your API key limits.",
          });
        }
      }

      if (!parsedResponse.slides || !Array.isArray(parsedResponse.slides)) {
        return res.status(500).json({
          error: "Invalid slides format from AI",
          rawResponse: cleanedResponse.substring(0, 500),
        });
      }

      // Validate and clean slides
      const validatedSlides = parsedResponse.slides
        .map((s, idx) => {
          const title = s.title?.trim() || (language === "Arabic" ? `شريحة ${idx + 1}` : `Slide ${idx + 1}`);
          const bullets = Array.isArray(s.bullets) ? s.bullets.filter(b => b && b.trim().length > 0) : [];

          // Ensure each slide has at least a title
          if (!title || title.length === 0) {
            return {
              title: language === "Arabic" ? `شريحة ${idx + 1}` : `Slide ${idx + 1}`,
              bullets: bullets.length > 0 ? bullets : (language === "Arabic" ? ["محتوى الشريحة"] : ["Slide content"]),
              notes: s.notes || "",
            };
          }

          return {
            title,
            bullets: bullets.length > 0 ? bullets : (language === "Arabic" ? ["محتوى الشريحة"] : ["Slide content"]),
            notes: s.notes || "",
          };
        })
        .filter(s => s.title && s.title.length > 0); // Remove slides without titles

      console.log(`[API] Generated ${validatedSlides.length} slides for ${language} language`);

      return res.json({
        lectureTitle: parsedResponse.lectureTitle || (language === "Arabic" ? "شرائح المحاضرة" : "Lecture Slides"),
        language,
        theme,
        slides: validatedSlides,
      });
    } catch (error: any) {
      console.error("[API] Error generating slides:", error);
      console.error("[API] Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 500),
      });

      // Check if it's a network/API error
      if (error.message?.includes("fetch failed") || error.message?.includes("network")) {
        return res.status(503).json({
          error: "Network error connecting to AI service",
          details: "Please check your internet connection and API key",
        });
      }

      return res.status(500).json({
        error: "Failed to generate slides",
        details: error.message || "Unknown error occurred",
      });
    }
  });

  /**
   * Download slides as PowerPoint (.pptx)
   * POST /api/ai/slides/download
   * Body: { transcript, summary?, theme?, lectureTitle? }
   * Returns: PPTX file download
   */
  app.post("/api/ai/slides/download", async (req: Request, res: Response) => {
    try {
      const { slides: providedSlides, theme = "clean", lectureTitle = "Lecture Slides", customColor } = req.body as {
        slides?: { title: string; content: string[] }[];
        theme?: "clean" | "dark" | "academic" | "modern" | "tech";
        lectureTitle?: string;
        customColor?: string;
      };

      // Use provided slides if available, otherwise return error
      if (!providedSlides || !Array.isArray(providedSlides) || providedSlides.length === 0) {
        return res.status(400).json({ error: "Slides are required" });
      }

      // Detect language from first slide
      const firstSlideText = providedSlides[0]?.title || "";
      const hasArabic = /[\u0600-\u06FF]/.test(firstSlideText);
      const language = hasArabic ? "Arabic" : "English";

      const slides = providedSlides.map((s) => ({
        title: s.title || "Untitled Slide",
        bullets: s.content || [],
        notes: "",
      }));

      // Create PowerPoint
      const pptx = new pptxgen();

      // Validate pptxgen instance
      if (!pptx) {
        throw new Error("Failed to initialize PowerPoint generator");
      }

      // Theme configuration - using site colors with fonts
      // Primary: hsl(250 84% 65%) = #8B5CF6
      // pptxgenjs expects hex colors without # prefix
      const themes = {
        clean: {
          backgroundColor: "FFFFFF",
          titleColor: "8B5CF6", // Purple
          textColor: "0A0A0B", // Site foreground
          accentColor: "7C3AED", // Darker violet
          borderColor: "E4E4E7", // Site border
          font: "Arial",
        },
        dark: {
          backgroundColor: "1F2937",
          titleColor: "10B981", // Green
          textColor: "F9FAFB",
          accentColor: "059669", // Darker green
          borderColor: "374151",
          font: "Roboto",
        },
        academic: {
          backgroundColor: "F5F5F7", // Site background
          titleColor: "2563EB", // Blue
          textColor: "0A0A0B", // Site foreground
          accentColor: "1D4ED8", // Darker blue
          borderColor: "E4E4E7", // Site border
          font: "Times New Roman",
        },
        modern: {
          backgroundColor: "8B5CF6", // Gradient-like primary
          titleColor: "FFFFFF", // White on primary
          textColor: "FFFFFF",
          accentColor: "EC4899", // Pink
          borderColor: "7C3AED",
          font: "Montserrat",
        },
        tech: {
          backgroundColor: "1E1B4B", // Dark purple-blue
          titleColor: "06B6D4", // Cyan
          textColor: "E2E8F0", // Light slate
          accentColor: "0891B2", // Darker cyan
          borderColor: "4C1D95",
          font: "Consolas",
        },
      };

      let selectedTheme = themes[theme] || themes.clean;

      // Apply custom color if provided (convert hex to RGB without #)
      let finalTitleColor = selectedTheme.titleColor;
      let finalAccentColor = selectedTheme.accentColor;
      let finalBackgroundColor = selectedTheme.backgroundColor;

      // Ensure colors don't have # prefix
      finalTitleColor = finalTitleColor.startsWith("#") ? finalTitleColor.substring(1).toUpperCase() : finalTitleColor.toUpperCase();
      finalAccentColor = finalAccentColor.startsWith("#") ? finalAccentColor.substring(1).toUpperCase() : finalAccentColor.toUpperCase();
      finalBackgroundColor = finalBackgroundColor.startsWith("#") ? finalBackgroundColor.substring(1).toUpperCase() : finalBackgroundColor.toUpperCase();

      if (customColor) {
        const hexColor = customColor.replace("#", "").toUpperCase();
        const r = parseInt(hexColor.substring(0, 2), 16);
        const g = parseInt(hexColor.substring(2, 4), 16);
        const b = parseInt(hexColor.substring(4, 6), 16);

        // Calculate darker variant for accent
        const darkerR = Math.max(0, r - 30);
        const darkerG = Math.max(0, g - 30);
        const darkerB = Math.max(0, b - 30);
        const darkerHex = `${darkerR.toString(16).padStart(2, "0")}${darkerG.toString(16).padStart(2, "0")}${darkerB.toString(16).padStart(2, "0")}`.toUpperCase();

        // Override colors with custom color
        finalTitleColor = hexColor;
        finalAccentColor = darkerHex;
      }

      // Normalize all theme colors
      const finalTextColor = selectedTheme.textColor.startsWith("#")
        ? selectedTheme.textColor.substring(1).toUpperCase()
        : selectedTheme.textColor.toUpperCase();
      const finalBorderColor = selectedTheme.borderColor.startsWith("#")
        ? selectedTheme.borderColor.substring(1).toUpperCase()
        : selectedTheme.borderColor.toUpperCase();

      console.log("[PPTX] Theme:", theme, "Custom Color:", customColor);
      console.log("[PPTX] Final Colors - BG:", finalBackgroundColor, "Title:", finalTitleColor, "Accent:", finalAccentColor, "Text:", finalTextColor, "Border:", finalBorderColor);

      // Set slide layout and master slide properties
      pptx.layout = "LAYOUT_WIDE";
      pptx.defineLayout({ name: "CUSTOM", width: 10, height: 7.5 });

      // Add slides with improved design
      slides.forEach((slide: { title: string; bullets: string[] }, idx: number) => {
        const pptxSlide = pptx.addSlide();

        // Background - apply theme background color
        pptxSlide.background = { color: finalBackgroundColor };

        // Add a subtle header bar with primary color
        try {
          pptxSlide.addShape(pptx.ShapeType.rect as any, {
            x: 0,
            y: 0,
            w: 10,
            h: 0.3,
            fill: { color: finalTitleColor },
            line: { color: finalTitleColor, width: 0 },
          });
        } catch (shapeError: any) {
          console.warn("[API] Shape error (continuing):", shapeError.message);
          // Continue without header bar
        }

        // Title with better positioning and styling
        // For Arabic, use fonts that support Arabic (Arial, Times New Roman, etc.)
        const titleFont = language === "Arabic"
          ? (selectedTheme.font === "Consolas" || selectedTheme.font === "Montserrat"
            ? "Arial"
            : selectedTheme.font)
          : selectedTheme.font;

        const titleOptions: any = {
          x: 0.5,
          y: 0.8,
          w: 9,
          h: 0.9,
          fontSize: 36,
          bold: true,
          color: finalTitleColor,
          align: language === "Arabic" ? "right" : "left",
          valign: "top",
          ...(titleFont && { fontFace: titleFont }),
        };

        // Add RTL support for Arabic if available
        if (language === "Arabic") {
          titleOptions.rtlMode = true;
        }

        pptxSlide.addText(slide.title, titleOptions);

        // Add a subtle divider line
        try {
          pptxSlide.addShape(pptx.ShapeType.line as any, {
            x: 0.5,
            y: 1.7,
            w: 9,
            h: 0,
            line: { color: finalBorderColor, width: 2 },
          });
        } catch (lineError: any) {
          console.warn("[API] Line error (continuing):", lineError.message);
          // Continue without divider line
        }

        // Bullets with better spacing and styling
        slide.bullets.forEach((bullet, bulletIdx) => {
          const yPos = 2.0 + bulletIdx * 0.65;

          // Add bullet point indicator (use accent color)
          try {
            pptxSlide.addShape(pptx.ShapeType.roundRect as any, {
              x: language === "Arabic" ? 9.2 : 0.5,
              y: yPos + 0.1,
              w: 0.2,
              h: 0.2,
              fill: { color: finalAccentColor },
              line: { color: finalAccentColor, width: 0 },
            });
          } catch (bulletError: any) {
            console.warn("[API] Bullet shape error (continuing):", bulletError.message);
            // Continue without bullet indicator
          }

          // For Arabic, use fonts that support Arabic
          const bulletFont = language === "Arabic"
            ? (selectedTheme.font === "Consolas" || selectedTheme.font === "Montserrat"
              ? "Arial"
              : selectedTheme.font)
            : selectedTheme.font;

          const bulletOptions: any = {
            x: language === "Arabic" ? 0.5 : 0.8,
            y: yPos,
            w: language === "Arabic" ? 8.5 : 8.7,
            h: 0.5,
            fontSize: 20,
            color: finalTextColor,
            align: language === "Arabic" ? "right" : "left",
            valign: "top",
            lineSpacing: 28,
            ...(bulletFont && { fontFace: bulletFont }),
          };

          // Add RTL support for Arabic if available
          if (language === "Arabic") {
            bulletOptions.rtlMode = true;
          }

          pptxSlide.addText(bullet, bulletOptions);
        });

        // Add footer with copyright on last slide
        if (idx === slides.length - 1) {
          pptxSlide.addText(
            `© 2025 LectureMate. ${language === "Arabic" ? "جميع الحقوق محفوظة" : "All rights reserved"}`,
            {
              x: 0.5,
              y: 6.8,
              w: 9,
              h: 0.3,
              fontSize: 10,
              color: finalTextColor,
              align: "center",
            }
          );
        }
      });

      // Generate buffer
      let buffer: Buffer;
      try {
        const pptxBuffer = await pptx.write({ outputType: "nodebuffer" });
        // Ensure it's a Buffer
        buffer = Buffer.isBuffer(pptxBuffer) ? pptxBuffer : Buffer.from(pptxBuffer as any);
      } catch (writeError: any) {
        console.error("[API] Error writing PPTX buffer:", writeError);
        throw new Error(`Failed to write PowerPoint: ${writeError.message}`);
      }

      if (!buffer || buffer.length === 0) {
        throw new Error("Generated PowerPoint buffer is empty");
      }

      // Support Arabic in filename using RFC 5987 encoding
      const hasArabicInTitle = /[\u0600-\u06FF]/.test(lectureTitle || "");

      // Create safe ASCII filename for basic header
      const asciiFilename = (lectureTitle || "lecture_slides")
        .replace(/[^\x20-\x7E]/g, "") // Remove all non-ASCII characters
        .replace(/[^a-z0-9\s-]/gi, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .substring(0, 100) || "lecture_slides";

      const filename = `${asciiFilename}_slides.pptx`;

      // Use RFC 5987 encoding for Arabic filenames
      let contentDisposition: string;
      if (hasArabicInTitle) {
        // RFC 5987: filename*=UTF-8''encoded-filename
        const encodedFilename = encodeURIComponent(`${lectureTitle}_slides.pptx`);
        contentDisposition = `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`;
      } else {
        contentDisposition = `attachment; filename="${filename}"`;
      }

      console.log("[PPTX] Original title:", lectureTitle);
      console.log("[PPTX] Has Arabic:", hasArabicInTitle);
      console.log("[PPTX] Content-Disposition:", contentDisposition);

      // Send file with properly encoded filename
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", contentDisposition);
      res.send(buffer);
    } catch (error: any) {
      console.error("[API] Error generating PPTX:", error);
      console.error("[API] Error stack:", error.stack);
      return res.status(500).json({
        error: "Failed to generate PowerPoint file",
        details: error.message || "Unknown error occurred",
      });
    }
  });

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  /**
   * General chat endpoint for general questions about the site
   * Uses Gemini API to answer general questions
   */
  app.post("/api/chat/general", async (req: Request, res: Response) => {
    try {
      const { question, language = "english" } = req.body as { question?: string; language?: string };

      if (!question || typeof question !== "string" || question.trim().length === 0) {
        return res.status(400).json({ error: "Question is required" });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (!geminiApiKey) {
        return res.status(500).json({
          error: "Gemini API key not configured",
          details: "Please set GEMINI_API_KEY in environment variables",
        });
      }

      console.log(`[API] General chat question (${language}):`, question.substring(0, 100));

      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);

        const isArabic = language === "arabic" || language === "ar";
        const systemPrompt = isArabic
          ? `أنت مساعد ذكي لموقع LectureMate. LectureMate هو منصة ذكية لتحويل محاضرات YouTube إلى محتوى دراسي منظم (ملخصات، أسئلة، شرائح، وبطاقات تعليمية).

يمكنك مساعدة المستخدمين في:
- شرح كيفية استخدام الموقع
- الإجابة على أسئلة عامة حول الميزات
- تقديم نصائح للاستخدام الأمثل
- الإجابة على استفسارات تقنية عامة

كن مفيداً وودوداً. إذا كان السؤال خارج نطاق الموقع، يمكنك الإجابة بشكل عام.

السؤال: ${question}

أجب بالعربية بشكل واضح ومفيد.`
          : `You are a helpful assistant for LectureMate website. LectureMate is an intelligent platform that converts YouTube lectures into organized study content (summaries, quizzes, slides, and flashcards).

You can help users with:
- Explaining how to use the website
- Answering general questions about features
- Providing tips for optimal usage
- Answering general technical questions

Be helpful and friendly. If the question is outside the website's scope, you can answer generally.

Question: ${question}

Answer in English clearly and helpfully.`;

        const text = await callGeminiWithRetry(genAI, systemPrompt, "gemini-2.5-flash");

        console.log(`[API] General chat response generated (${text.length} characters)`);

        res.json({ response: text });
      } catch (geminiError: any) {
        console.error("[API] Gemini API error in general chat:", geminiError);
        res.status(500).json({
          error: "Failed to generate response",
          details: geminiError.message || "Unknown error",
        });
      }
    } catch (error: any) {
      console.error("[API] Error in general chat endpoint:", error);
      res.status(500).json({ error: "Failed to process chat request" });
    }
  });

  return httpServer;
}

