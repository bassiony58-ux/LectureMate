
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config();

async function check() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("NO_API_KEY");
        return;
    }

    console.log("CHECKING_KEY_PREFIX: " + apiKey.substring(0, 5));

    const genAI = new GoogleGenerativeAI(apiKey);
    const models = ["gemini-2.5-flash"];

    for (const modelName of models) {
        try {
            console.log(`TESTING: ${modelName}...`);
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello?");
            const response = await result.response;
            console.log(`CHECK_RESULT: ${modelName} = OK`);
        } catch (e: any) {
            console.log(`CHECK_RESULT: ${modelName} = FAIL (${e.status || e.message})`);
        }
    }
}

check();
