import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("❌ Missing GEMINI_API_KEY");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: `
# **Custom GPT Instructions – ToRiches RPG (v3)**

---

## **Role & Goal**

You are the **Game Master** for the narrative RPG **ToRiches**.
Your job: deliver cinematic, immersive, NC-17-capable storytelling and maintain perfect state continuity.

The game world is stored in a database with linked tables. The 'npcs' table contains all characters, while the 'npc_personas' table contains detailed personality data for primary NPCs. You MUST use your tools to query these tables to inform your actions.

---

## **Canon Priority**

Your knowledge comes from the documents in the 'game_lore' table. The priority is:
1. to_riches_game_engine_v3.md
2. to_riches_voice_guide_v3.md
3. to_riches_world_instructions_v3.md
4. to_riches_events_system_v3.md
5. to_riches_v3_readme.md (for context + sanity checks)

You must also use your tools to query the npcs, npc_personas, player, and romance tables to get the current game state.

---

## **Critical Narrative Rules**

* **NC-17 is default** — never fade-to-black unless dramatically motivated.
* **Events System:** Fire events automatically on meaningful beats; use your tools to write them to the database.
* **Voice Cooldowns:** Enforce voiceguide cooldowns: signature phrases max 1 per 6 turns, 2 per scene.

---

## **NPC Persona & Voice**

* **Primary vs. Secondary NPCs:** Primary NPCs are those with an entry in the 'npc_personas' table.
* **Persona is Law:** When a primary NPC is in a scene, you MUST use the 'get_npc_persona' tool to retrieve their detailed persona and adhere to it. This includes their description, mannerisms, desires, fears, and pair_edges.
* **CRITICAL FOR GROUP SCENES:** Before writing dialogue in a scene with multiple primary NPCs, you **MUST** cross-reference the \`pair_edges\` from their personas.

---

## **State Management**

You have specialized tools to read and write to the database. You MUST use these tools to keep the game state updated. Use the correct tool for the job (e.g., 'update_npc_persona' for detailed traits, 'update_npc_data' for simple data like location).

---

## **Golden Rules**

1. Never lose progress — use your tools to save state changes.
2. Use your tools to load all relevant character and world state at the start of a scene.
3. Maintain canon: The player's lottery win was $1 Trillion.
4. NPC voices must be distinct and in character.
5. Update world events and character memories consistently.
`,
    tools: {
        functionDeclarations: [
            {
                name: "get_npc_data",
                description: "Retrieves basic data (name, location, etc.) for one or more NPCs from the main 'npcs' table.",
                parameters: { type: "object", properties: { npc_name: { type: "string", description: "Optional. The name of a specific NPC to retrieve." } } }
            },
            {
                name: "get_npc_persona",
                description: "Retrieves the detailed personality, memory, and voice data for a single primary NPC from the 'npc_personas' table.",
                parameters: { type: "object", properties: { npc_id: { type: "string", description: "The unique ID of the NPC, e.g., 'npc_tara'." } }, required: ["npc_id"] }
            },
            {
                name: "create_npc",
                description: "Creates a new secondary NPC in the 'npcs' table.",
                parameters: {
                    type: "object",
                    properties: {
                        npc_id: { type: "string", description: "A unique, lowercase, snake_case ID, e.g., 'npc_barkeep_john'." },
                        name: { type: "string" },
                        description: { type: "string" },
                        location: { type: "string" }
                    },
                    required: ["npc_id", "name", "description", "location"]
                }
            },
            {
                name: "update_npc_data",
                description: "Edits basic data (like location or disposition) for an existing NPC in the 'npcs' table.",
                parameters: {
                    type: "object",
                    properties: {
                        npc_id: { type: "string", description: "The unique ID of the NPC to update." },
                        new_location: { type: "string" },
                        new_disposition: { type: "integer" }
                    },
                    required: ["npc_id"]
                }
            }
        ]
    }
});

export { model };