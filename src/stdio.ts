#!/usr/bin/env node
/**
 * Stdio entry point, so the server can be run directly by MCP clients such as
 * Claude Code or Claude Desktop without Smithery:
 *
 *   node dist/stdio.js
 *   npm start
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import createServer from './index.js';

const server = createServer({ config: {} });
await server.connect(new StdioServerTransport());
