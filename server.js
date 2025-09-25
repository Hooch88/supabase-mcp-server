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
    systemInstruction: `
---
# ROLE & GOAL
You are the Game Master for the narrative RPG ToRiches.
Your job: deliver cinematic, immersive, NC-17-capable storytelling and maintain perfect state continuity.

The complete rules, lore, and canon for the game are stored in the 'game_lore' database table.
You MUST use your tools to query this table for the relevant document before proceeding with a scene.
For example, to understand the narrative style, run the SQL query:
"SELECT content FROM game_lore WHERE title = 'to_riches_game_engine_v3.md'"

---
# CANON PRIORITY & KNOWLEDGE BASE
Your knowledge comes from the documents in the 'game_lore' table. The priority is:
1. to_riches_game_engine_v3.md
2. to_riches_voice_guide_v3.md
3. to_riches_world_instructions_v3.md
4. to_riches_events_system_v3.md
5. to_riches_v3_readme.md (for context + sanity checks)

You must also use your tools to query the npcs, player, and romance tables to get the current game state.

---
# CRITICAL NARRATIVE RULES
* NC-17 is default — never fade-to-black unless dramatically motivated.
* Use realistic, cinematic language.
* Fire events automatically on meaningful beats; use your tools to write them to the database.
* Enforce voiceguide cooldowns, which you can find in 'to_riches_voice_guide_v3.md'.
* Maintain cross-file hygiene: IDs, scene_refs, etc., must resolve.

---
# NPC PERSONA & VOICE
* Primary NPCs (Tara, Sasha, Brielle, Elena) have detailed persona data. All others are secondary.
* Persona is Law: Adhere to the description, mannerisms, desires, fears, and surprise_hooks.
* CRITICAL FOR GROUP SCENES: You MUST cross-reference the 'pair_edges' for each character present. Their interactions MUST be colored by these defined relationships.
* Imitate Dialogue Examples: The examples are your guide for a character's speech patterns.
* Voice Guide for Rules: The 'to_riches_voice_guide_v3.md' file contains global rules for all NPCs.

---
# STATE MANAGEMENT
You have specialized tools like 'create_npc' and 'get_table_data' to read and write to the database. You MUST use these tools to keep the game state updated. Do not try to write raw SQL.

---
# GOLDEN RULES
1. Never lose progress — use your tools to save state changes.
2. Use your tools to load all relevant character and world state at the start of a scene.
3. Maintain canon: The player's lottery win was $1 Trillion.
4. NPC voices must be distinct and in character.
5. You must update the game state consistently so future events can escalate naturally based on prior actions.
`,
    tools: {
        functionDeclarations: [
            {
                name: "get_table_data",
                description: "Fetch rows from a table to get current game state information. Use this for reading data.",
                parameters: { type: "object", properties: { table: { type: "string" }, query: { type: "string", description: "A SQL WHERE clause to filter the results, e.g., \"name = 'Tara'\"" } }, required: ["table"] }
            },
            {
                name: "create_npc",
                description: "Creates a new non-player character in the database.",
                parameters: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "The character's name." },
                        description: { type: "string", description: "A brief description of the character." },
                        disposition: { type: "integer", description: "A number from -100 (hostile) to 100 (friendly)." },
                        location: { type: "string", description: "The current location of the character." },
                        is_hostile: { type: "boolean", description: "Whether the character is immediately hostile." }
                    },
                    required: ["name", "description", "disposition", "location", "is_hostile"]
                }
            },
            {
                name: "update_npc_data",
                description: "Updates data for an existing NPC.",
                parameters: {
                    type: "object",
                    properties: {
                        npc_name: { type: "string", description: "The name of the NPC to update." },
                        new_location: { type: "string" },
                        new_description: { type: "string" },
                        new_disposition: { type: "integer" }
                    },
                    required: ["npc_name"]
                }
            }
        ]
    }
});

// --- In-memory chat history ---
const conversationHistory = [];

// --- Supabase Helper ---
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
    // A more powerful data getter
    async get_table_data({ table, query }) {
        let sql = `SELECT * FROM ${table}`; // Corrected: Removed quotes around table for safety with Supabase RPC
        if (query) {
            sql += ` WHERE ${query}`;
        }
        sql += ';';
        const data = await runSQL(sql);
        return JSON.stringify(data, null, 2);
    },
    // Safe tool for creating NPCs
    async create_npc({ name, description, disposition, location, is_hostile }) {
        const escape = (val) => (typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val);
        // --- THIS LINE IS THE FIX ---
        const query = `INSERT INTO npcs (name, description, disposition, location, is_hostile) VALUES (${escape(name)}, ${escape(description)}, ${disposition}, ${escape(location)}, ${is_hostile});`;
        await runSQL(query);
        return `Successfully created NPC: ${name}`;
    },
    // Safe tool for updating NPCs
    async update_npc_data({ npc_name, new_location, new_description, new_disposition }) {
        const updates = [];
        const escape = (val) => (typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val);

        if (new_location) updates.push(`location = ${escape(new_location)}`);
        if (new_description) updates.push(`description = ${escape(new_description)}`);
        if (new_disposition !== undefined) updates.push(`disposition = ${new_disposition}`);

        if (updates.length === 0) return "No updates provided.";

        // --- THIS LINE IS THE FIX ---
        const query = `UPDATE npcs SET ${updates.join(', ')} WHERE name = ${escape(npc_name)};`;
        await runSQL(query);
        return `${npc_name}'s data has been updated.`;
    }
};

// --- The main chat endpoint for your web app (unchanged logic) ---
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
            conversationHistory.push({
                role: "function",
                parts: [{ functionResponse: { name: call.name, response: { name: call.name, content: toolResult } } }],
            });

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

app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 RPG server running on port ${PORT}`);
});