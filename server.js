import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { model } from './config.js'; // Import the model
import { tools } from './tools.js';   // Import the tools

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 10000;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing Supabase environment variables");
    process.exit(1);
}

const conversationHistory = [];

app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;
        conversationHistory.push({ role: "user", parts: [{ text: message }] });

        const chat = model.startChat({ history: conversationHistory });
        const result = await chat.sendMessage(message);
        const response = result.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            console.log(`🤖 Request to call tool: ${call.name} with args: ${JSON.stringify(call.args)}`);
            const toolResult = await tools[call.name](call.args);
            const result2 = await chat.sendMessage([{ functionResponse: { name: call.name, response: { content: toolResult } } }]);
            conversationHistory.push(response.candidates[0].content);
            conversationHistory.push({ role: "function", parts: [{ functionResponse: { name: call.name, response: { name: call.name, content: toolResult } } }] });
            const finalResponse = result2.response.text();
            conversationHistory.push({ role: "model", parts: [{ text: finalResponse }] });
            res.json({ message: finalResponse });
        } else {
            const text = response.text();
            conversationHistory.push({ role: "model", parts: [{ text }] });
            res.json({ message: text });
        }
    } catch (error) {
        console.error("Chat endpoint error:", error);
        res.status(500).json({ error: "An error occurred." });
    }
});

app.get("/health", (req, res) => { res.json({ status: "ok" }); });

app.listen(PORT, () => {
    console.log(`🚀 RPG server running on port ${PORT}`);
});