import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY is not set in .env");
        return;
    }

    console.log("Testing Gemini API Key:", apiKey.substring(0, 5) + "..." + apiKey.substring(apiKey.length - 5));

    const models = ["gemini-2.5-flash"];

    for (const modelName of models) {
        console.log(`\nTesting with model: ${modelName}...`);
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello?");
            const response = await result.response;
            console.log(`SUCCESS: ${modelName} is working! Response:`, response.text().substring(0, 50) + "...");
        } catch (error: any) {
            console.error(`FAILURE: ${modelName} failed!`);
            const msg = error.message || String(error);
            console.error("Error message:", msg.substring(0, 200) + "...");
            if (error.status) console.error("Status:", error.status);
        }
    }
}

testGemini();
