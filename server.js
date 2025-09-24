import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(bodyParser.json());
app.use(cors()); // Enable CORS for all routes
app.use(express.static('public')); // Serve static files from 'public' folder

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Your new API Key

// --- Validation for environment variables ---
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}
if (!GEMINI_API_KEY) {
    console.error("❌ Missing GEMINI_API_KEY");
    process.exit(1);
}

// --- Initialize Gemini ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    // --- Define the Supabase tools for Gemini ---
    tools: {
        functionDeclarations: [
            {
                name: "list_tables",
                description: "List all public tables in the database.",
            },
            {
                name: "list_columns",
                description: "List all columns and their data types for a specific table.",
                parameters: {
                    type: "object",
                    properties: {
                        table: { type: "string", description: "The name of the table." }
                    },
                    required: ["table"]
                }
            },
            {
                name: "get_table_data",
                description: "Fetch a specified number of rows from a table.",
                parameters: {
                    type: "object",
                    properties: {
                        table: { type: "string", description: "The name of the table to fetch data from." },
                        limit: { type: "integer", description: "The maximum number of rows to return. Defaults to 10." }
                    },
                    required: ["table"]
                }
            },
            {
                name: "execute_sql",
                description: "Execute a raw, arbitrary SQL query against the database. Use for complex queries, joins, or data manipulation.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The SQL query to execute." }
                    },
                    required: ["query"]
                }
            }
        ]
    }
});

// --- In-memory chat history (for simplicity) ---
// Note: This will reset if the server restarts. A more advanced version would save this to the database.
const conversationHistory = [];

// --- Supabase Helper: The same one you had before ---
async function runSQL(query) {
    // Using native fetch, as you are on Node 18+
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ sql: query }),
    });

    if (!resp.ok) {
        const err = await resp.text();
        console.error("Supabase SQL error:", err);
        throw new Error(`Supabase SQL error: ${resp.status} ${err}`);
    }
    return resp.json();
}

// --- Tool implementation functions ---
const tools = {
    async list_tables() {
        const data = await runSQL("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
        return JSON.stringify(data, null, 2);
    },
    async list_columns({ table }) {
        const data = await runSQL(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`);
        return JSON.stringify(data, null, 2);
    },
    async get_table_data({ table, limit = 10 }) {
        const data = await runSQL(`SELECT * FROM "${table}" LIMIT ${limit}`);
        return JSON.stringify(data, null, 2);
    },
    async execute_sql({ query }) {
        const data = await runSQL(query);
        return JSON.stringify(data, null, 2);
    }
};

// --- NEW: The main chat endpoint for your web app ---
app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;

        // Add user message to history
        conversationHistory.push({ role: "user", parts: [{ text: message }] });

        const chat = model.startChat({ history: conversationHistory });
        const result = await chat.sendMessage(message);
        const response = result.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
            // --- Handle Tool/Function Calling ---
            const call = functionCalls[0]; // Handle one call at a time for simplicity
            console.log(`🤖 Request to call tool: ${call.name}`);

            // Call the corresponding tool function
            const toolResult = await tools[call.name](call.args);

            // Send the result back to Gemini
            const result2 = await chat.sendMessage([
                { functionResponse: { name: call.name, response: { content: toolResult } } }
            ]);

            // --- IMPORTANT: Add the history correctly ---
            // 1. Add the model's request to use a tool
            conversationHistory.push(response.candidates[0].content);

            // 2. Add the actual result of the tool execution
            conversationHistory.push({
                role: "function", // This is the correct role for a tool's output
                parts: [{
                    functionResponse: {
                        name: call.name,
                        response: {
                            name: call.name,
                            content: toolResult,
                        },
                    },
                }],
            });

            // Get the final text response from the model now that it has the tool result
            const finalResponse = result2.response.text();
            conversationHistory.push({ role: "model", parts: [{ text: finalResponse }] });
            res.json({ message: finalResponse });

        } else {
            // --- Handle a regular text response ---
            const text = response.text();
            conversationHistory.push({ role: "model", parts: [{ text }] });
            res.json({ message: text });
        }

    } catch (error) {
        console.error("Chat endpoint error:", error);
        res.status(500).json({ error: "An error occurred." });
    }
});


// --- Health Check and Root endpoints (unchanged) ---
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 RPG server running on port ${PORT}`);
});