import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

// --- Helper: run SQL via exec_sql ---
async function runSQL(query) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: query }),
    });

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Supabase SQL error: ${resp.status} ${err}`);
    }
    return resp.json();
}

// --- MCP protocol handlers ---
app.post("/mcp", async (req, res) => {
    const { id, method, params } = req.body;

    try {
        if (method === "initialize") {
            return res.json({
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: { tools: {} },
                    serverInfo: { name: "supabase-mcp-server", version: "1.0.0" },
                },
            });
        }

        if (method === "tools/list") {
            return res.json({
                jsonrpc: "2.0",
                id,
                result: {
                    tools: [
                        { name: "list_tables", description: "List all public tables" },
                        { name: "list_columns", description: "List columns for a table", inputSchema: { type: "object", properties: { table: { type: "string" } }, required: ["table"] } },
                        { name: "execute_sql", description: "Run an arbitrary SQL query", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
                        { name: "get_table_data", description: "Fetch rows from a table", inputSchema: { type: "object", properties: { table: { type: "string" }, limit: { type: "integer" } }, required: ["table"] } }
                    ],
                },
            });
        }

        if (method === "tools/call") {
            const { name, arguments: args } = params;

            if (name === "list_tables") {
                const data = await runSQL(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
                );
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }

            if (name === "list_columns") {
                const data = await runSQL(
                    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${args.table}' ORDER BY ordinal_position`
                );
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }

            if (name === "execute_sql") {
                const data = await runSQL(args.query);
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }

            if (name === "get_table_data") {
                const limit = args.limit || 10;
                const data = await runSQL(`SELECT * FROM ${args.table} LIMIT ${limit}`);
                return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
            }
        }

        return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
    } catch (err) {
        return res.json({ jsonrpc: "2.0", id, error: { code: -32000, message: err.message } });
    }
});

// --- Health check ---
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), port: PORT, transports: ["http"] });
});

// --- Root metadata ---
app.get("/", (req, res) => {
    res.json({
        name: "Supabase MCP Server",
        version: "1.0.0",
        description: "MCP server for Supabase database integration",
        endpoints: { health: "/health", mcp: "/mcp", root: "/" },
        protocol: "MCP 2024-11-05",
        transports: ["http"],
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Supabase MCP server running on port ${PORT}`);
});
