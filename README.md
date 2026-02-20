# LectureMate 🎓

<div align="center">

**An intelligent AI-powered platform that transforms YouTube lectures into organized study content**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)

</div>

## 📖 Overview

LectureMate is a comprehensive web application that leverages AI to analyze YouTube lecture videos and automatically generate:
- **Summaries** - Long-form abstractive summaries
- **Quizzes** - Interactive multiple-choice questions
- **Slides** - Professional PowerPoint presentations
- **Flashcards** - Study cards for key concepts

With full support for Arabic and English, LectureMate makes studying more efficient and accessible.

## ✨ Key Features

### 🎯 Core Functionality
- 📹 **YouTube Video Analysis** - Extract transcripts and metadata from any YouTube video
- ⏱️ **Time Range Selection** - Focus on specific segments of long videos
- 🤖 **AI-Powered Content Generation** - Generate summaries, quizzes, slides, and flashcards using advanced AI models
- 🏷️ **Smart Category Classification** - Automatically categorize lectures (Science, Technology, Mathematics, Medicine, History, Art, Language, Business, Education)
- 💬 **Dual Chat Assistants**:
  - **Lecture-Specific Assistant** - Answers questions about the current lecture
  - **General Assistant** - Site-wide help and general inquiries

### 🎨 User Experience
- 🌐 **Full Bilingual Support** - Arabic/English with automatic language detection
- 🔄 **RTL/LTR Layout** - Seamless right-to-left and left-to-right text support
- 🎨 **Customizable Slide Themes** - 5 professional themes (Clean, Dark, Academic, Modern, Tech)
- 📊 **Progress Tracking** - Real-time progress indicators for each processing stage
- 🔔 **Completion Notifications** - Audio and visual notifications when content is ready
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile devices

### 🔧 Technical Features
- 🔐 **Authentication** - Firebase Auth with email/password and Google Sign-in
- 💾 **Cloud Storage** - Firebase Firestore for data persistence
- 🔧 **Dual AI Models**:
  - **LM-Titan (GPU)** - Local Ollama model for faster, high-quality processing
  - **LM-Cloud (API)** - Google Gemini API for cloud-based processing
- 📥 **Export Options** - Download slides as PowerPoint (.pptx) with full Arabic support
- ⚡ **Process Control** - Stop processing at any time with complete backend termination

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Wouter** for routing
- **Framer Motion** for animations
- **Radix UI** components
- **TanStack Query** for data fetching

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **Python** scripts for YouTube transcript extraction

### AI & ML
- **Google Gemini 2.5 Flash** (Cloud API)
- **Ollama** with Qwen2.5 models:
  - `qwen2.5:32b` - Best quality (requires 20GB+ VRAM)
  - `qwen2.5:14b` - Great quality (requires 10GB+ VRAM)
  - `qwen2.5:7b` - Good quality (requires 5GB+ VRAM)

### Database & Services
- **Firebase Firestore** - Data persistence
- **Firebase Auth** - Authentication
- **Firebase Hosting** - Frontend hosting

### Additional Tools
- **pptxgenjs** - PowerPoint generation
- **youtube-transcript-api** - YouTube transcript extraction
- **Whisper** - Audio transcription (for uploaded files)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+
- Firebase account
- (Optional) Ollama installed locally for GPU processing

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MohamedAdelF/newlec.git
   cd lecture-assistantv2-main
   ```

2. **Install dependencies**
   ```bash
   npm install
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Required: Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Optional: Ollama Configuration (for GPU processing)
   OLLAMA_URL=http://localhost:11434
   OLLAMA_MODEL=qwen2.5:32b  # Choose based on your GPU VRAM
   
   # Firebase Configuration (if not using firebase.ts)
   FIREBASE_API_KEY=your_firebase_api_key
   FIREBASE_AUTH_DOMAIN=your_auth_domain
   FIREBASE_PROJECT_ID=your_project_id
   ```

4. **Configure Firebase**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Copy your Firebase config to `client/src/lib/firebase.ts`
   - Enable Authentication (Email/Password and Google)
   - Set up Firestore database
   - Deploy Firestore rules:
     ```bash
     npx firebase deploy --only firestore:rules
     ```

5. **Set up Ollama (Optional - for GPU processing)**
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.com/install.sh | sh
   
   # Pull the Qwen model
   ollama pull qwen2.5:32b
   
   # Or use a smaller model if you have limited VRAM
   ollama pull qwen2.5:14b  # or qwen2.5:7b
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5000`

## 📚 Detailed Features

### Time Range Selection
Select specific time ranges from YouTube videos to extract transcripts. Perfect for:
- Focusing on specific lecture segments
- Extracting content from long videos
- Creating summaries for specific topics

### Model Selection
Choose between two AI processing modes:
- **LM-Titan (GPU)**: Local Ollama model running on your GPU
  - Faster processing
  - No API costs
  - Requires local GPU setup
- **LM-Cloud (API)**: Google Gemini API
  - No local setup required
  - Works on any device
  - Uses API quota

### Slide Themes
Five professional themes available:
- **Clean**: Minimalist design with purple accents
- **Dark**: Modern dark theme with green highlights
- **Academic**: Traditional academic style with blue tones
- **Modern**: Vibrant purple gradient design
- **Tech**: Tech-focused dark theme with cyan accents

Each theme includes:
- Unique font family
- Suggested color palette
- Fully customizable colors

### Smart Category Classification
Automatically categorizes lectures into:
- 🔬 Science
- 💻 Technology
- 📐 Mathematics
- ⚕️ Medicine
- 📜 History
- 🎨 Art
- 📚 Language
- 💼 Business
- 🎓 Education
- 📄 Other

Uses AI-powered classification with keyword fallback for accuracy.

### Language Support
Full bilingual support:
- Automatic language detection from content
- RTL/LTR layout switching
- Proper text alignment
- Arabic font support in PowerPoint exports
- UI available in both languages

## 🏗️ Project Structure

```
.
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── auth/         # Authentication components
│   │   │   ├── dashboard/    # Dashboard components
│   │   │   ├── general/      # General components
│   │   │   ├── home/         # Home page components
│   │   │   ├── layout/       # Layout components
│   │   │   ├── lecture/      # Lecture view components
│   │   │   └── ui/           # UI components (Radix UI)
│   │   ├── contexts/         # React contexts
│   │   ├── hooks/            # Custom hooks
│   │   ├── lib/              # Utility libraries
│   │   │   ├── aiService.ts      # AI service functions
│   │   │   ├── categoryClassifier.ts  # Category classification
│   │   │   ├── firebase.ts         # Firebase configuration
│   │   │   ├── lectureService.ts   # Firestore operations
│   │   │   └── youtubeService.ts   # YouTube API calls
│   │   ├── pages/            # Page components
│   │   │   ├── auth/         # Sign in/up pages
│   │   │   ├── dashboard.tsx # Dashboard page
│   │   │   ├── history.tsx   # History page
│   │   │   ├── home.tsx      # Home page
│   │   │   └── lecture-view.tsx  # Lecture detail page
│   │   └── styles/           # Global styles
├── server/                    # Express backend
│   ├── routes.ts             # API routes
│   ├── index.ts              # Server entry point
│   └── scripts/              # Python scripts
│       ├── download_youtube_audio.py
│       ├── get_transcript.py
│       ├── get_video_info.py
│       └── transcribe_audio.py
├── script/                   # Build scripts
│   └── build.ts              # Production build script
├── dist/                     # Production build output
├── requirements.txt          # Python dependencies
└── package.json             # Node.js dependencies
```

## 🔌 API Endpoints

### YouTube
- `POST /api/youtube/info` - Get YouTube video metadata
- `POST /api/youtube/transcribe` - Extract video transcript (supports time range selection)

### Audio Processing
- `POST /api/audio/transcribe` - Transcribe uploaded audio files

### AI Services
- `POST /api/ai/summary` - Generate AI summary (supports Arabic/English)
- `POST /api/ai/quiz` - Generate quiz questions
- `POST /api/ai/slides` - Generate slide deck from transcript
- `POST /api/ai/flashcards` - Generate flashcards
- `POST /api/ai/category` - Classify lecture category

### Chat
- `POST /api/chat/lecture` - Lecture-specific chat assistant
- `POST /api/chat/general` - General site-wide chat assistant

### Processing Control
- `POST /api/lecture/:lectureId/stop` - Stop processing for a lecture

### Export
- `POST /api/ai/slides/download` - Download slides as PowerPoint (.pptx)

## 🧪 Development

```bash
# Run development server (frontend + backend)
npm run dev

# Run only client development server
npm run dev:client

# Type checking
npm run check

# Build for production
npm run build

# Start production server
npm start
```

## 🚢 Deployment

### Firebase Hosting (Frontend)

```bash
# Build and deploy to Firebase Hosting
npm run deploy:hosting
```

### Backend Deployment

The backend API can be deployed to:
- **Firebase Functions** - Serverless functions
- **Cloud Run** - Containerized deployment
- **Railway/Render** - Platform-as-a-Service
- **VPS/Server** - Traditional server deployment

See deployment guides:
- `RUNPOD_SETUP.md` - For RunPod GPU deployment
- `GPU_SETUP.md` - For local GPU setup
- `FIREBASE_STORAGE_SETUP.md` - For Firebase configuration

## 🐛 Troubleshooting

### YouTube Transcript Issues
- Ensure the video has captions enabled (CC)
- Some videos may only have auto-generated captions
- Time range selection requires valid start/end times
- Check if the video allows transcript extraction

### AI Model Errors
- **Gemini API**: 
  - Check your API key and quota limits
  - Verify the key is set in `.env` file
  - Check API status at [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Ollama**: 
  - Ensure Ollama is running locally on port 11434
  - Verify the model is pulled: `ollama list`
  - Check GPU availability: `nvidia-smi` (for NVIDIA GPUs)
- **Model Fallback**: The app automatically falls back to available models

### PowerPoint Download Issues
- Ensure filenames don't contain invalid characters
- Arabic filenames are automatically sanitized
- Check browser download permissions
- Verify sufficient disk space

### RTL/LTR Layout Issues
- Language is automatically detected from content
- Manual override available in language settings
- Ensure proper font support for Arabic text
- Clear browser cache if layout issues persist

### Processing Not Stopping
- The stop endpoint should terminate all backend processes
- Check browser console for errors
- Verify the lecture ID is correct
- Restart the server if processes persist

## 📝 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for cloud processing |
| `OLLAMA_URL` | No | Ollama server URL (default: http://localhost:11434) |
| `OLLAMA_MODEL` | No | Ollama model name (default: qwen2.5:32b) |
| `FIREBASE_API_KEY` | Yes* | Firebase API key (*if not in firebase.ts) |
| `FIREBASE_AUTH_DOMAIN` | Yes* | Firebase auth domain |
| `FIREBASE_PROJECT_ID` | Yes* | Firebase project ID |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Google Gemini](https://ai.google.dev/) - AI API
- [Ollama](https://ollama.ai/) - Local LLM runtime
- [Firebase](https://firebase.google.com/) - Backend services
- [Radix UI](https://www.radix-ui.com/) - UI components
- [pptxgenjs](https://github.com/gitbrent/pptxgenjs) - PowerPoint generation

## 📧 Contact

For questions, issues, or suggestions, please open an issue on GitHub.

---

<div align="center">

**Made with ❤️ for students and educators**

⭐ Star this repo if you find it helpful!

</div>
