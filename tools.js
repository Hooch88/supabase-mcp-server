const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// This function will now ONLY be used for reading data.
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

// --- Tool Implementations ---
const tools = {
    async get_npc_data({ npc_name }) {
        let sql = `SELECT npc_id, name, description, location, disposition, is_hostile FROM npcs`;
        if (npc_name) {
            const escape = (val) => `'${val.replace(/'/g, "''")}'`;
            sql += ` WHERE name = ${escape(npc_name)}`;
        }
        const data = await runSQL(sql);
        return JSON.stringify(data, null, 2);
    },
    async create_npc({ npc_id, name, description, location }) {
        const npcData = { npc_id, name, description, location, primary_npc: false, status: 'active' };
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/npcs`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(npcData)
        });
        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Supabase API error: ${resp.status} ${err}`);
        }
        return `Successfully created NPC: ${name}`;
    },
    async create_npc_persona({ npc_id, persona_description, mannerisms, desires, fears }) {
        // --- REWRITTEN TO USE DIRECT API CALLS ---
        // 1. Promote the NPC to primary using a PATCH request
        const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/npcs?npc_id=eq.${npc_id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ primary_npc: true })
        });
        if (!updateResp.ok) {
            const err = await updateResp.text();
            throw new Error(`Supabase API error (updating NPC): ${updateResp.status} ${err}`);
        }

        // 2. Insert the detailed persona using a POST request
        const personaData = { npc_id, persona_description, mannerisms, desires, fears };
        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/npc_personas`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(personaData)
        });
        if (!insertResp.ok) {
            const err = await insertResp.text();
            throw new Error(`Supabase API error (inserting persona): ${insertResp.status} ${err}`);
        }
        return `Successfully created persona for ${npc_id} and promoted them to a primary NPC.`;
    },
    async update_npc_data({ npc_id, new_location, new_disposition }) {
        // --- REWRITTEN TO USE A DIRECT API CALL ---
        const updates = {};
        if (new_location) updates.location = new_location;
        if (new_disposition !== undefined) updates.disposition = new_disposition;
        if (Object.keys(updates).length === 0) return "No updates provided.";

        const resp = await fetch(`${SUPABASE_URL}/rest/v1/npcs?npc_id=eq.${npc_id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(updates)
        });
        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Supabase API error: ${resp.status} ${err}`);
        }
        return `NPC ${npc_id}'s data has been successfully updated.`;
    }
};

export { tools };