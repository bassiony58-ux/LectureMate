// Service to extract YouTube video information and transcript

export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  channelName?: string;
}

// Extract video ID from YouTube URL
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Get YouTube video thumbnail
export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Get video info from YouTube using backend API
export async function getYouTubeVideoInfo(
  videoId: string
): Promise<YouTubeVideoInfo | null> {
  try {
    console.log(`[youtubeService] Fetching video info for: ${videoId}`);
    
    // Call backend API endpoint to fetch video info
    const response = await fetch("/api/youtube/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ videoId }),
    });

    const data = await response.json().catch((err) => {
      console.error("[youtubeService] Failed to parse JSON response:", err);
      return null;
    });

    if (!response.ok) {
      console.error("[youtubeService] API error:", data.error);
      // Fallback to basic info if API fails
      return {
        videoId,
        title: `YouTube Video ${videoId}`,
        thumbnailUrl: getYouTubeThumbnail(videoId),
        duration: "0:00",
      };
    }

    console.log(`[youtubeService] Video info received:`, {
      title: data.title,
      channelName: data.channelName
    });

    return {
      videoId: data.videoId || videoId,
      title: data.title || `YouTube Video ${videoId}`,
      thumbnailUrl: data.thumbnailUrl || getYouTubeThumbnail(videoId),
      duration: data.duration || "0:00",
      channelName: data.channelName,
    };
  } catch (error) {
    console.error("[youtubeService] Error fetching YouTube video info:", error);
    // Fallback to basic info on error
    return {
      videoId,
      title: `YouTube Video ${videoId}`,
      thumbnailUrl: getYouTubeThumbnail(videoId),
      duration: "0:00",
    };
  }
}

// Extract transcript from YouTube using backend API endpoint
export async function getYouTubeTranscript(
  videoId: string,
  startTime?: number | null,
  endTime?: number | null
): Promise<string | null> {
  try {
    // Call backend API endpoint to fetch transcript (avoids CORS issues)
    const requestBody: any = { videoId };
    if (startTime !== undefined && startTime !== null) {
      requestBody.startTime = startTime;
    }
    if (endTime !== undefined && endTime !== null) {
      requestBody.endTime = endTime;
    }

    const response = await fetch("/api/youtube/transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json().catch((err) => {
      console.error("[youtubeService] Failed to parse JSON response:", err);
      return {};
    });

    console.log("[youtubeService] Response data:", {
      ok: response.ok,
      status: response.status,
      hasTranscript: !!data.transcript,
      transcriptLength: data.transcript?.length || 0,
      error: data.error
    });

    if (!response.ok) {
      // Use the error message from the server if available
      const errorMessage = data.error || `HTTP error! status: ${response.status}`;
      console.error("[youtubeService] API error:", errorMessage);
      throw new Error(errorMessage);
    }
    
    if (!data.transcript || data.transcript.length === 0) {
      console.error("[youtubeService] Empty transcript received");
      throw new Error(data.error || "No transcript available for this video");
    }
    
    console.log("[youtubeService] Transcript received successfully:", {
      length: data.transcript.length,
      preview: data.transcript.substring(0, 100)
    });
    
    return data.transcript;
  } catch (error: any) {
    console.error("Error fetching transcript:", error);
    
    // Re-throw the error with the message from the server
    throw error;
  }
}

// Transcribe audio file using Faster Whisper
export async function transcribeAudioFile(
  file: File,
  modelSize: string = "large-v3",
  language?: string,
  device: string = "cuda",
  lectureId?: string
): Promise<string | null> {
  try {
    console.log(`[audioService] Transcribing audio file: ${file.name} (${file.size} bytes)`);
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("modelSize", modelSize);
    if (language) {
      formData.append("language", language);
    }
    formData.append("device", device);
    if (lectureId) {
      formData.append("lectureId", lectureId);
    }

    // Call backend API endpoint to transcribe audio
    const response = await fetch("/api/audio/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch((err) => {
      console.error("[audioService] Failed to parse JSON response:", err);
      return {};
    });

    console.log("[audioService] Response data:", {
      ok: response.ok,
      status: response.status,
      hasTranscript: !!data.transcript,
      transcriptLength: data.transcript?.length || 0,
      error: data.error
    });

    if (!response.ok) {
      const errorMessage = data.error || `HTTP error! status: ${response.status}`;
      console.error("[audioService] API error:", errorMessage);
      throw new Error(errorMessage);
    }
    
    if (!data.transcript || data.transcript.length === 0) {
      console.error("[audioService] Empty transcript received");
      throw new Error(data.error || "No transcript generated from audio file");
    }
    
    console.log("[audioService] Transcript received successfully:", {
      length: data.transcript.length,
      preview: data.transcript.substring(0, 100),
      language: data.language
    });
    
    return data.transcript;
  } catch (error: any) {
    console.error("[audioService] Error transcribing audio:", error);
    throw error;
  }
}

// Transcribe YouTube video audio using Whisper (downloads audio first)
export async function transcribeYouTubeWithWhisper(
  videoId: string,
  modelSize: string = "large-v3",
  language?: string,
  device: string = "cuda",
  startTime?: number | null,
  endTime?: number | null,
  userId?: string,
  videoTitle?: string,
  channelName?: string,
  lectureId?: string
): Promise<string | null> {
  try {
    console.log(`[youtubeService] Transcribing YouTube video with Whisper: ${videoId}`);
    
    // Build request body
    const requestBody: any = {
      videoId,
      modelSize,
      device,
    };
    
    if (userId) {
      requestBody.userId = userId;
    }
    if (language) {
      requestBody.language = language;
    }
    if (startTime !== undefined && startTime !== null) {
      requestBody.startTime = startTime;
    }
    if (endTime !== undefined && endTime !== null) {
      requestBody.endTime = endTime;
    }
    // Send video title and channel name for Arabic detection
    if (videoTitle) {
      requestBody.videoTitle = videoTitle;
    }
    if (channelName) {
      requestBody.channelName = channelName;
    }
    if (lectureId) {
      requestBody.lectureId = lectureId;
    }

    // Call backend API endpoint to download and transcribe
    const response = await fetch("/api/youtube/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json().catch((err) => {
      console.error("[youtubeService] Failed to parse JSON response:", err);
      return {};
    });

    console.log("[youtubeService] Response data:", {
      ok: response.ok,
      status: response.status,
      hasTranscript: !!data.transcript,
      transcriptLength: data.transcript?.length || 0,
      error: data.error
    });

    if (!response.ok) {
      const errorMessage = data.error || `HTTP error! status: ${response.status}`;
      console.error("[youtubeService] API error:", errorMessage);
      throw new Error(errorMessage);
    }
    
    if (!data.transcript || data.transcript.length === 0) {
      console.error("[youtubeService] Empty transcript received");
      throw new Error(data.error || "No transcript generated from YouTube audio");
    }
    
    console.log("[youtubeService] Transcript received successfully:", {
      length: data.transcript.length,
      preview: data.transcript.substring(0, 100),
      language: data.language
    });
    
    return data.transcript;
  } catch (error: any) {
    console.error("[youtubeService] Error transcribing YouTube with Whisper:", error);
    throw error;
  }
}

