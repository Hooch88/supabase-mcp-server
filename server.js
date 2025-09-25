import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { model } from './config.js';
import { tools } from './tools.js';

dotenv.config(); // Load environment variables from .env file

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 10000;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET; // A new secret for signing tokens

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing Supabase environment variables");
    process.exit(1);
}
if (!ACCESS_PASSWORD || !JWT_SECRET) {
    console.error("❌ Missing ACCESS_PASSWORD or JWT_SECRET environment variables");
    process.exit(1);
}

// --- NEW: Login Endpoint ---
app.post("/login", (req, res) => {
    const { password } = req.body;
    if (password === ACCESS_PASSWORD) {
        // Passwords match. Create a token that expires in 8 hours.
        const token = jwt.sign({ user: 'authed_user' }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Incorrect password' });
    }
});

// --- NEW: Authentication Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // No token

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Invalid token
        req.user = user;
        next();
    });
};

const conversationHistory = [];

// --- PROTECTED Chat Endpoint ---
app.post("/chat", authenticateToken, async (req, res) => {
    // The rest of your chat logic is unchanged
    try {
        const { message } = req.body;
        conversationHistory.push({ role: "user", parts: [{ text: message }] });

        const chat = model.startChat({ history: conversationHistory });
        const result = await chat.sendMessage(message);
        const response = result.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
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