import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Validation for environment variables ---
if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
    console.error("❌ Missing one or more environment variables");
    process.exit(1);
}

// --- Supabase Helper for READ-ONLY queries ---
async function runSQL(query) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Accept": "application/json" },
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
    async get_table_data({ table, query }) {
        let sql = `SELECT * FROM ${table}`;
        if (query) { sql += ` WHERE ${query}`; }
        sql += ';';
        const data = await runSQL(sql);
        return JSON.stringify(data, null, 2);
    },

    // --- NEW, MORE ROBUST METHOD FOR WRITING DATA ---
    async create_npc({ name, description, disposition, location, is_hostile }) {
        const npcData = {
            name: name,
            description: description,
            disposition: disposition,
            location: location,
            is_hostile: is_hostile
        };

        console.log(`[INFO] Sending new NPC data to Supabase API:`, npcData);

        const resp = await fetch(`${SUPABASE_URL}/rest/v1/npcs`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(npcData)
        });

        if (!resp.ok) {
            const err = await resp.text();
            console.error("Supabase API error:", err);
            throw new Error(`Supabase API error: ${resp.status} ${err}`);
        }

        return `Successfully created NPC: ${name}`;
    },
    // update_npc_data would be rewritten in a similar way, but let's fix one thing at a time.
};

// --- Initialize Gemini (abbreviated for clarity, use your full version) ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: `You are the Game Master... [USE YOUR FULL INSTRUCTIONS HERE]`,
    tools: { functionDeclarations: [{ name: "get_table_data", description: "Fetch rows from a table.", parameters: { type: "object", properties: { table: { type: "string" }, query: { type: "string" } }, required: ["table"] } }, { name: "create_npc", description: "Creates a new non-player character.", parameters: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, disposition: { type: "integer" }, location: { type: "string" }, is_hostile: { type: "boolean" } }, required: ["name", "description", "disposition", "location", "is_hostile"] } }] }
});

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
app.listen(PORT, () => { console.log(`🚀 RPG server running on port ${PORT}`); });