
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

async function verifyApiKey() {
    console.log("\n🔑 Verifying Gemini API Key...");

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("❌ Error: GEMINI_API_KEY is missing in .env file.");
        process.exit(1);
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    // List of models to try
    // Based on search results, Gemini 2.5 might be available under specific names or aliases in the latest SDK.
    // Common patterns: gemini-2.0-flash-001, gemini-2.0-flash-exp, gemini-1.5-pro-002
    // If the user insists on 2.5, we try standard models first to confirm key validity, then experimental ones.
    const models = [
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.0-flash-exp",
        "gemini-2.0-pro-exp",
        "gemini-2.5-flash",
        "gemini-2.5-pro"
    ];

    for (const modelName of models) {
        console.log(`\n🤖 Testing model: ${modelName}...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hi");
            const response = await result.response;

            console.log(`✅ Success! The API Key is working with ${modelName}.`);
            return; // Exit on first success
        } catch (error: any) {
            console.error(`❌ Failed with ${modelName}. Status: ${error.status || 'Unknown'}`);
        }
    }

    console.log("\n⚠️  All tests failed.");
}

verifyApiKey();
