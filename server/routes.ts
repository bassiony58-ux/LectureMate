import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { exec, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, unlinkSync, mkdirSync, readFileSync } from "fs";
import { createRequire } from "module";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import pptxgen from "pptxgenjs";
import multer from "multer";
import os from "os";
import { uploadAudioToFirebase, checkAudioExists, downloadAudioFromFirebase } from "./firebaseStorage";
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

  // Helper for Gemini requests with retry logic and model fallback
  const callGeminiWithRetry = async (genAI: any, prompt: string, preferredModel = "gemini-2.5-flash", retries = 3) => {
    // Models to try in order of preference (fallback strategy)
    const modelsToTry = ["gemini-2.5-flash"];
    let lastError: any;

    for (let i = 0; i < retries; i++) {
      // Rotate through models if retry occurs (in this case only one model)
      const modelName = modelsToTry[0];
      try {
        console.log(`[API] Attempting with model: ${modelName} (Attempt ${i + 1}/${retries})`);
        const model = genAI.getGenerativeModel({ model: modelName });
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
        console.log(`[API] Retrying with same model...`);
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

        // Step 1: Download audio from YouTube (if not found in Firebase)
        if (!downloadedFilePath) {
          const downloadScript = path.join(__dirname, "scripts", "download_youtube_audio.py");

          const downloadArgs = [downloadScript, videoId];
          if (startTimeSeconds !== null) {
            downloadArgs.push(startTimeSeconds.toString());
          } else {
            downloadArgs.push("None");
          }
          if (endTimeSeconds !== null) {
            downloadArgs.push(endTimeSeconds.toString());
          } else {
            downloadArgs.push("None");
          }

          console.log(`[API] Downloading audio from YouTube...`);

          // Use spawn to track the process
          downloadProcess = spawn(pythonCmd, downloadArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
          });

          // Track process if lectureId is provided
          if (lectureId) {
            if (!activeProcesses.has(lectureId)) {
              activeProcesses.set(lectureId, []);
            }
            activeProcesses.get(lectureId)!.push({
              process: downloadProcess,
              type: "download",
              startTime: new Date()
            });
          }

          let downloadStdout = '';
          let downloadStderr = '';

          downloadProcess.stdout?.on('data', (data) => {
            downloadStdout += data.toString();
          });

          downloadProcess.stderr?.on('data', (data) => {
            downloadStderr += data.toString();
          });

          // Wait for download to complete
          await new Promise<void>((resolve, reject) => {
            downloadProcess!.on('close', (code) => {
              if (code !== 0) {
                reject(new Error(`Download process exited with code ${code}. ${downloadStderr}`));
              } else {
                resolve();
              }
            });

            downloadProcess!.on('error', (error) => {
              reject(error);
            });
          });

          if (downloadStderr) {
            console.error(`[API] Python stderr (download):`, downloadStderr);
          }

          const downloadResult = JSON.parse(downloadStdout.trim());

          // Remove download process from tracking
          if (lectureId && downloadProcess) {
            const processes = activeProcesses.get(lectureId);
            if (processes) {
              const index = processes.findIndex(p => p.process === downloadProcess);
              if (index !== -1) {
                processes.splice(index, 1);
              }
            }
          }

          if (!downloadResult.success) {
            return res.status(500).json({
              error: downloadResult.error || "Failed to download audio from YouTube",
              details: downloadResult.details || "Could not download audio file.",
            });
          }

          downloadedFilePath = downloadResult.filePath;
          console.log(`[API] Audio downloaded successfully: ${downloadedFilePath} (${(downloadResult.fileSize / 1024 / 1024).toFixed(2)} MB)`);

          // Upload to Firebase Storage (only if no time range specified)
          if (startTimeSeconds === null && endTimeSeconds === null && userId !== "anonymous" && downloadedFilePath && typeof downloadedFilePath === "string") {
            try {
              audioUrl = await uploadAudioToFirebase(downloadedFilePath, userId as string, videoId as string);
              console.log(`[API] Audio uploaded to Firebase Storage: ${audioUrl}`);
            } catch (uploadError) {
              console.warn(`[API] Could not upload to Firebase Storage:`, uploadError);
              // Continue even if upload fails
            }
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
    let childProcess: ChildProcess | null = null;
    const lectureId = req.body.lectureId as string | undefined;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file uploaded" });
      }

      uploadedFilePath = req.file.path;

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

      console.log(`[API] Processing file: ${req.file.originalname} (${req.file.size} bytes)`);

      const fileExt = path.extname(req.file.originalname).toLowerCase();
      let transcript = "";

      // Handle Document Files
      if (fileExt === ".pdf") {
        const dataBuffer = readFileSync(uploadedFilePath);
        const data = await pdf(dataBuffer);
        transcript = data.text;
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

          // Helper to extract text recursively from officeparser output
          const extractText = (obj: any): string => {
            if (!obj) return "";
            if (typeof obj === "string") return obj;
            if (Array.isArray(obj)) return obj.map(extractText).join("\n");

            let text = "";
            if (obj.text) text += obj.text + "\n";

            // Check children or content arrays
            if (obj.children) text += extractText(obj.children);
            if (obj.content) text += extractText(obj.content);
            if (obj.data) text += extractText(obj.data);

            return text;
          };

          transcript = typeof data === 'string' ? data : extractText(data);

          // Clean up the transcript (remove extra newlines and JSON artifacts)
          transcript = transcript
            .replace(/\\n/g, "\n")
            .replace(/\s+/g, " ")
            .trim();

        } catch (err) {
          console.error("[API] Error parsing PPTX:", err);
          transcript = "";
        }
      }

      if (transcript && typeof transcript === 'string' && transcript.length > 0) {
        console.log(`[API] Successfully extracted text from document: ${req.file.originalname} (${transcript.length} chars)`);
        return res.json({
          transcript,
          wordCount: transcript.split(/\s+/).length,
          characterCount: transcript.length,
          language: "auto",
        });
      } else if (transcript) {
        // Fallback for non-empty string but weird content
        console.log(`[API] Extracted data from document: ${req.file.originalname}`);
        return res.json({
          transcript: String(transcript),
          wordCount: 0,
          characterCount: 0,
          language: "auto",
        });
      }

      // If not a document, proceed with audio transcription (Whisper)
      console.log(`[API] Proceeding with Whisper transcription for: ${req.file.originalname}`);

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
      });

    } catch (error: any) {
      // Check if we should try visual extraction for video files
      // This happens if Whisper failed OR if we catch an error
      const isVideo = req.file?.mimetype?.startsWith("video/") || req.file?.originalname.match(/\.(mp4|webm|ogg|mov)$/i);

      if (isVideo && process.env.GEMINI_API_KEY) {
        console.log(`[API] Audio transcription failed or irrelevant. Attempting Visual Extraction via Gemini...`);
        try {
          // Use the file we already have (uploadedFilePath)
          const mimeType = req.file?.mimetype || "video/mp4";

          if (!uploadedFilePath || !existsSync(uploadedFilePath)) {
            throw new Error("File not found for visual extraction");
          }

          const fileRecord = await uploadToGemini(uploadedFilePath, mimeType);

          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

          const prompt = `You are an expert transcriber. The audio in this video might be silent, missing, or unclear. 
          Your task:
          1. Extract all VISIBLE text from the slides, whiteboard, or screen.
          2. Describe any meaningful diagrams, charts, or visual actions that explain the concepts.
          3. If there is any audible speech, include that as well.
          4. Combine everything into a comprehensive, coherent lecture transcript.
          5. Do NOT confuse this with a summary. I need the raw content/information acting as a transcript.
          `;

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
            method: "visual_extraction"
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

          const aiResponseRaw = await callGeminiWithRetry(genAI, unifiedPrompt, "gemini-2.5-flash");

          let parsed;
          try {
            const cleaned = aiResponseRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            parsed = JSON.parse(cleaned);
          } catch (e) {
            console.warn("[API] Failed to parse unified summary JSON, using raw text as fallback");
            return res.json({ summary: aiResponseRaw });
          }

          const combinedSummary = `### ${headingIntro}\n${parsed.introduction}\n\n### ${headingSummary}\n${parsed.summary}\n\n### ${headingPoints}\n${parsed.keypoints.map((p: string) => `- ${p}`).join("\n")}`;

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
      console.log(`[API] Category endpoint hit with mode: ${mode}`);

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

      console.log(`[API] Classifying lecture category (${content.length} characters)`);

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

          const prompt = `You are an expert content classifier. Analyze the following lecture content and classify it into ONE of these categories:

Categories:
${categories
              .map(
                (cat) =>
                  `- ${cat}: ${categoryDescriptions[cat]}`,
              )
              .join("\n")}

CRITICAL REQUIREMENTS:
- The content is in ${language}. Respond in ${language} if needed, but the category name must be in English (one of: ${categories.join(", ")}).
- Analyze the MAIN TOPIC and PRIMARY FOCUS of the content, not just keywords that appear.
- Be precise: Only classify as "technology" if the content is primarily about computer science, programming, or technical IT topics.
- If the content mentions technology but is about another subject (e.g., "How AI is used in medicine" → medicine, not technology), classify by the MAIN subject.
- Return ONLY the category name (one word) in lowercase, nothing else. No explanations, no additional text.
- Examples:
  - "Introduction to Quantum Mechanics" → science
  - "Python Programming Tutorial" → technology
  - "Calculus Basics" → mathematics
  - "History of Ancient Rome" → history
  - "How AI is Transforming Healthcare" → medicine (not technology)
  - "Business Strategy for Startups" → business
  - "Learning Spanish Grammar" → language

Content to classify:
Title: ${title || "N/A"}
Summary: ${typeof summary === "string" ? summary.substring(0, 500) : Array.isArray(summary) ? (summary as string[]).join(" ").substring(0, 500) : "N/A"}
Transcript (first 2000 chars): ${transcript?.substring(0, 2000) || "N/A"}

Category:`;

          const categoryPrompt = `You are an expert content classifier. Analyze the following and classify it into ONE of: ${categories.join(", ")}.
          Return ONLY the single word for the category in lowercase.
          Title: ${title || "N/A"}
          Content: ${transcript?.substring(0, 5000) || "N/A"}
          Category:`;

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
              const regex = new RegExp(`\\b${cat}\\b`, "i");
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
          console.log(`[API] Using Ollama model for category classification: ${ollamaModel}`);

          const prompt = `You are an expert content classifier. Analyze the following lecture content and classify it into ONE of these categories:

Categories:
${categories
              .map(
                (cat) =>
                  `- ${cat}: ${categoryDescriptions[cat]}`,
              )
              .join("\n")}

Analyze the content and return ONLY the category name (one word) in lowercase.

Content:
Title: ${title || "N/A"}
Summary: ${typeof summary === "string" ? summary.substring(0, 500) : Array.isArray(summary) ? (summary as string[]).join(" ").substring(0, 500) : "N/A"}
Transcript: ${transcript?.substring(0, 2000) || "N/A"}

Category:`;

          const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
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

            console.log(`[API] Ollama classified as: ${category}`);
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

      console.log(`[API] Generating quiz (${mode}) for transcript (${transcript?.length || 0} chars). Title: ${title}`);

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
         - 70-80% of questions MUST be directly from the transcript (Source: "uploaded_content").
         - 20-30% of questions MUST be based on general knowledge related to the topic "${title}", testing broader understanding beyond the specific video content (Source: "related_topic").
         - For 'expert' mode, increase general knowledge questions to 40-50%.
      2. Question Count: Generate exactly 20 questions (to ensure high quality and complete response).
      3. Distribution:
         - 10 Multiple Choice Questions
         - 7 True/False Questions
         - 3 Open-Ended/Essay Questions
      4. Content Logic:
         - If the topic involves Mathematics, Engineering, or Physics:
           * Essay questions MUST be numerical problems/exercises.
           * Multiple Choice questions MUST include numerical problems.
           * Purely theoretical questions in Multiple Choice should be minimized.
         - For other topics, focus on key concepts and understanding.
      5. Ordering & Variety:
         - SHUFFLE the questions in the final JSON array.
         - Do NOT group questions by type (e.g. do NOT put all MCQs first).
         - Do NOT group by source (e.g. do NOT put all video questions first).
         - Mix Easy, Medium, and Hard questions randomly (adhering to the difficulty mode).
      6. Essay Questions:
         - Must include "expected_keywords" (array of strings) that would appear in a correct answer.
      6. Language: Detect and respond in the SAME language as the transcript (${language}).
      7. References: For EACH question, you MUST provide a "reference" object:
         - "concept": The specific concept being tested (e.g., "Polymorphism").
         - "location": 
            * If "source_type" is "uploaded_content": Provide the approximate timestamp (e.g., "05:20").
            * If "source_type" is "related_topic": You MUST provide a specific, real-world citation. Example: "Book: 'Clean Code' by Robert C. Martin, Ch. 2" or "Website: 'MDN Web Docs - Array Methods'". Do NOT use generic terms like "General Knowledge".
         - "source_type": Use "uploaded_content" if the info is present in the transcript. Use "related_topic" if you used outside knowledge.

      Format: Return ONLY valid JSON with this EXACT structure (pay attention to "type" field):
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
      IMPORTANT: Ensure "true_false" questions have type "true_false" and options ["True", "False"] (or Arabic equivalents).
      Transcript: ${(transcript || "").substring(0, 20000)}`;

      // Enable retries (3) to allow fallback to other models
      const aiResponse = await callGeminiWithRetry(genAI, quizPrompt, "gemini-2.5-flash", 3);

      let parsedResponse;
      try {
        const cleanedResponse = aiResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
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
          Transcript: ${transcript.substring(0, 20000)}`;
          const aiResponse = await callGeminiWithRetry(genAI, flashcardPrompt, "gemini-2.5-flash");

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
      try {
        const cleanedResponse = aiResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsedResponse = JSON.parse(cleanedResponse);
      } catch (e) {
        // Simple extraction fallback
        parsedResponse = {
          introduction: "Failed to parse detailed structure",
          summary: aiResponse,
          keyPoints: []
        };
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
{"lectureTitle":"عنوان","slides":[{"title":"عنوان 1","bullets":["نقطة 1","نقطة 2","نقطة 3"]},{"title":"عنوان 2","bullets":["نقطة 1","نقطة 2"]}]}

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
4. Organization: Introduction → Concepts → Details → Examples → Applications → Conclusion
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
                .replace(/```json/gi, "")
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
5. استخدم لغة تعليمية واضحة ومفهومة.
6. نظم المحتوى منطقياً: مقدمة → المفاهيم الرئيسية → تفاصيل → أمثلة → تطبيقات → خاتمة.
7. تأكد من أن كل شريحة لها عنوان واضح وليس "شريحة 1" أو "عنوان" فقط.
8. استخدم عناوين وصفية مثل "مقدمة في الموضوع" أو "المفاهيم الأساسية" أو "التطبيقات العملية".
9. لا تترك أي شريحة بدون عنوان أو بدون نقاط.

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
- Use clear, educational language.
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

