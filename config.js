import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("❌ Missing GEMINI_API_KEY");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: `You are the Game Master... [USE YOUR FULL INSTRUCTIONS HERE]`, // Paste your full instructions
    tools: {
        functionDeclarations: [
            // Tool schemas remain here
            {
                name: "get_table_data",
                description: "Fetch rows from a table.",
                parameters: { type: "object", properties: { table: { type: "string" }, query: { type: "string" } }, required: ["table"] }
            },
            {
                name: "create_npc",
                description: "Creates a new non-player character.",
                parameters: {
                    type: "object",
                    properties: {
                        npc_id: { type: "string", description: "A unique, lowercase, snake_case ID for the new NPC, e.g., 'npc_barty_bumble'." },
                        name: { type: "string" },
                        description: { type: "string" },
                        disposition: { type: "integer" },
                        location: { type: "string" },
                        is_hostile: { type: "boolean" }
                    },
                    required: ["npc_id", "name", "description", "disposition", "location", "is_hostile"]
                }
            }
        ]
    }
});

export { model };