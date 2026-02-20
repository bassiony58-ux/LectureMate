import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

// Load env explicitly
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

console.log("Testing Gemini API Key...");
const key = process.env.GEMINI_API_KEY;

if (!key) {
    console.error("No GEMINI_API_KEY found in environment!");
    process.exit(1);
}

console.log(`Key found: ${key.substring(0, 10)}...`);

async function testKey() {
    try {
        const genAI = new GoogleGenerativeAI(key as string);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        console.log("Attempting simple generation...");
        const result = await model.generateContent("Say 'Hello, API is working!'");
        const response = await result.response;
        console.log("Success!");
        console.log("Response:", response.text());
    } catch (error: any) {
        console.error("\n❌ API Key Check Failed!");
        console.error("Error Message:", error.message);

        if (error.message.includes("leaked") || error.message.includes("403")) {
            console.error("\nThis confirms the key has been blocked by Google because it was detected publicly on the internet (GitHub, etc).");
            console.error("You MUST generate a new key at https://aistudio.google.com/app/apikey");
        }
    }
}

testKey();
