# Formula Extraction & Dashboard Updates (Feb 20, 2026 - Part 2)

This document compiles the advanced structural and operational enhancements implemented in the `LectureMate` application, focusing on consistency, file upload support, and UI improvements.

## 1. Expanding Formulas to Local File Uploads
**Issue:** When the `extractMathFormulas` logic was first integrated into the application, it was attached solely to the YouTube processing pipeline. When users uploaded local video (`MP4`, `MKV`), audio (`MP3`, `WAV`), or documentary packages (`PDF`, `DOCX`, `PPTX`), the extraction process was completely skipped. This resulted in the "No Formulas Found" message always displaying on local files despite them being rich in mathematics.
**Solution:**
- Added the crucial "Step 5: Extract Formulas" inside the `handleFileUpload` methodology within `client/src/pages/home.tsx`.
- The system now awaits the `extractMathFormulas` generation function alongside `generateSummary`, `generateQuiz` and `generateFlashcards` for all natively uploaded files.
- The MongoDB/Firestore database updater `updateLecture` was modified to correctly receive the parsed formulas payload for locally uploaded files.

## 2. Managing AI Consistency (The Randomness Bug)
**Issue:** The AI model used for extracting formulas (`gemini-2.5-flash`) was displaying an inconsistent quantity of generated formulas per lecture. Processing the same PDF twice could yield 25 formulas the first time, and merely 5 the next time, mixed with useless definitions.
**Solution:**
- Integrated a `temperature` parameter into the central, shared `callGeminiWithRetry` utility function across `server/routes.ts`.
- Sent a strict configuration of `temperature: 0.1` specifically to the `/api/ai/formulas` endpoint. A temperature of 0.1 restricts the AI from attempting "creative" variation (which is ideal for writing poetry but catastrophic for data extraction). It practically limits the AI to only one factual pathway, ensuring maximum accuracy and deterministic results in formulas.

## 3. Advanced Filtering of Definitions vs Formulas
**Issue:** The AI was padding the formulas tab with non-technical, simple semantic definitions (e.g. defining "What is a scalar?").
**Solution:**
- Updated the system prompt for formula extraction within `server/routes.ts` with explicit rules: **"AVOID PURE TEXT DEFINITIONS"**.
- Excluded basic definitions from extraction unless they hold direct structural notation, mathematical properties, variables, or represent a law (like $A \cdot B = 0$ for perpendicular vectors).

## 4. UI: Expanding Formula Card Dimensions 
**Issue:** Large complex formulas inside the detailed modal popup view were cramped because the window was limited to the Tailwind `sm:max-w-2xl` size constrain. Complex laws or heavily descriptive formulas looked squeezed with unnatural text wrapping.
**Solution:**
- Widened the primary modal within `client/src/components/lecture/FormulasView.tsx` from `max-w-2xl` to actively scale up between `max-w-3xl`, `max-w-4xl` up to `max-w-5xl`.
- Ensured a responsive fallback of `max-w-[95vw]` to guarantee that on smaller screens, it will take up exactly 95% of the screen space comfortably, maintaining ample horizontal layout space for reading descriptive mathematical steps.
