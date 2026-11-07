// Entry point. stdio by default (Claude Desktop, Claude Code, Codex, Cursor);
// --http [--port N] serves Streamable HTTP at /mcp for remote clients such as ChatGPT.
import { createServer as createHttpServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, VERSION } from './server.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

if (flag('--version')) {
  console.log(VERSION);
} else if (flag('--http')) {
  const port = Number(value('--port', process.env.PORT ?? 3000));
  const host = value('--host', process.env.HOST ?? '0.0.0.0');
  const MAX_BODY = 1_000_000;

  createHttpServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/health') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, version: VERSION })); return; }
    if (path !== '/mcp') { res.writeHead(404).end('Not found. MCP endpoint is /mcp'); return; }
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return; }

    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) { res.writeHead(413).end('Payload too large'); return; }
      chunks.push(c);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400).end('Invalid JSON'); return; }

    // Stateless: a fresh server + transport per request. Tools are pure functions, so no session state is needed.
    const server = createServer({ allowFileWrites: false });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
      console.error(e);
    }
  }).listen(port, host, () => console.error(`quint-ai MCP ${VERSION} listening on http://${host}:${port}/mcp`));
} else {
  const server = createServer({ allowFileWrites: true });
  await server.connect(new StdioServerTransport());
}
