import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// Environment variables (set in Render)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

// MCP metadata
const serverInfo = {
    name: "Supabase MCP Server",
    version: "1.0.0",
    description: "MCP server for Supabase RPG database integration",
    endpoints: {
        health: "/health",
        sse: "/sse (GET for connection, POST for MCP)",
        mcp: "/mcp (POST for HTTP MCP)",
        root: "/ (this endpoint)",
    },
    protocol: "MCP 2024-11-05",
    transports: ["http", "sse"],
};

// Health endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), transports: ["http", "sse"] });
});

// Root metadata
app.get("/", (req, res) => res.json(serverInfo));

// Helper: run SQL via Supabase REST API
async function runSQL(query) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ sql: query })
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Supabase SQL error: ${resp.status} ${text}`);
    }
    return resp.json();
}


// --- MCP HANDLER ---
app.post("/mcp", async (req, res) => {
    const { id, method, params } = req.body;

    try {
        if (method === "initialize") {
            return res.json({
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: { tools: {}, resources: {}, prompts: {} },
                    serverInfo,
                },
            });
        }

        if (method === "tools/list") {
            return res.json({
                jsonrpc: "2.0",
                id,
                result: {
                    tools: [
                        { name: "list_tables", description: "List tables in public schema" },
                        { name: "list_columns", description: "List columns for a given table" },
                        { name: "select_all", description: "Fetch rows from a table (with limit)" },
                        { name: "execute_sql", description: "Run custom SQL query" },
                    ],
                },
            });
        }

        if (method === "tools/call") {
            const { name, arguments: args } = params;

            // --- TOOL: list_tables ---
            if (name === "list_tables") {
                const data = await runSQL(`
          select table_name
          from information_schema.tables
          where table_schema='public'
          order by table_name;
        `);
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }

            // --- TOOL: list_columns ---
            if (name === "list_columns") {
                const { table } = args;
                const data = await runSQL(`
          select column_name, data_type
          from information_schema.columns
          where table_schema='public' and table_name='${table}'
          order by ordinal_position;
        `);
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }

            // --- TOOL: select_all ---
            if (name === "select_all") {
                const { table, limit = 10 } = args;
                const data = await runSQL(`select * from ${table} limit ${limit};`);
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }

            // --- TOOL: execute_sql ---
            if (name === "execute_sql") {
                const { query } = args;
                const data = await runSQL(query);
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }

            throw new Error(`Unknown tool: ${name}`);
        }

        // Fallback
        res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
    } catch (err) {
        console.error(err);
        res.json({ jsonrpc: "2.0", id, error: { code: -32000, message: err.message } });
    }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Supabase MCP Server running on port ${PORT}`);
});
