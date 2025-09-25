const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// --- Tool Implementations ---
const tools = {
    async get_table_data({ table, query }) {
        let sql = `SELECT * FROM ${table}`;
        if (query) { sql += ` WHERE ${query}`; }
        sql += ';';
        const data = await runSQL(sql);
        return JSON.stringify(data, null, 2);
    },
    async create_npc({ npc_id, name, description, disposition, location, is_hostile }) {
        const npcData = {
            npc_id: npc_id,
            name: name,
            description: description,
            disposition: disposition,
            location: location,
            is_hostile: is_hostile,
            primary_npc: true,
            status: 'active'
        };
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/npcs`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(npcData)
        });
        if (!resp.ok) {
            const err = await resp.text();
            console.error("Supabase API error:", err);
            throw new Error(`Supabase API error: ${resp.status} ${err}`);
        }
        return `Successfully created NPC: ${name}`;
    },
};

export { tools };