# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with tsx (not Smithery dev server)
- `npx @smithery/cli dev` - Start Smithery MCP development server on port 8181
- `npx @smithery/cli build` - Build for Smithery deployment

### Code Quality
- `npm run typecheck` - TypeScript type checking (no emit)
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check Prettier formatting
- `npm run build` - Compile TypeScript to dist/

## Architecture Overview

### MCP Server Structure
This is a **stateless MCP server** that exposes Singapore's data.gov.sg APIs through Model Context Protocol tools. The server follows Smithery's convention requiring a default export function with signature `({ config })`.

### API Integration Pattern
The codebase integrates with **5 different API bases**:
- `api-open.data.gov.sg/v2/public/api` - Collections and Datasets APIs
- `api-open.data.gov.sg/api/action` - CKAN Datastore Search API
- `api-open.data.gov.sg/v1/public/api` - Download APIs
- `api-open.data.gov.sg/v2/real-time/api` - Real-time APIs (NEA weather, PSI/PM2.5, UV, lightning, WBGT, flood alerts)
- `tablebuilder.singstat.gov.sg/api/table` - SingStat Table Builder APIs

### Rate Limiting Architecture
`src/rateLimiter.ts` is a sliding-window limiter with a **default budget of 5 requests per 10 seconds per provider** (one instance for data.gov.sg, one for SingStat). This is a conservative default, not a limit published by data.gov.sg; the API's 429 message asks clients to "try again in 10 seconds". Every tool awaits `rateLimiter.waitIfNeeded()` before its `axios` call, so a burst waits at most 10 s for a slot.

### HTTP Interceptors
`src/http.ts` installs one global axios response interceptor (`installRetryOn429()`, called once from `src/index.ts`): on HTTP 429 it waits for the delay the API asks for (`Retry-After` header, else the "try again in N seconds" message, else 10 s, capped at 30 s) and retries the request a single time.

### Multi-Provider Architecture
The codebase supports both **data.gov.sg APIs** and **SingStat Table Builder APIs**. Tools are organized by provider in separate files:
- `src/datagovsg.tools.ts` - Data.gov.sg API tools with `datagovsg_` prefix
- `src/realtime.tools.ts` - Data.gov.sg real-time API tools with `datagovsg_realtime_` prefix (share the data.gov.sg rate limiter)
- `src/singstat.tools.ts` - SingStat API tools with `singstat_` prefix
- `src/rateLimiter.ts` - Shared sliding-window rate limiter (one instance per provider)
- `src/http.ts` - Global axios interceptor: a single retry on HTTP 429
- `src/index.ts` - Main server that imports and registers all tools

### Tool Categories
- **Data.gov.sg Collections**: `datagovsg_list_collections`, `datagovsg_get_collection`
- **Data.gov.sg Datasets**: `datagovsg_list_datasets`, `datagovsg_get_dataset_metadata` 
- **Data.gov.sg CKAN Search**: `datagovsg_search_dataset` (main data querying tool)
- **Data.gov.sg Downloads**: `datagovsg_initiate_download`, `datagovsg_poll_download`
- **Data.gov.sg Real-time**: `datagovsg_realtime_air_quality` (PSI + PM2.5, region filter), `datagovsg_realtime_weather_forecast` (2-hour / 24-hour / 4-day), `datagovsg_realtime_weather_readings` (rainfall, temperature, humidity, wind per station), `datagovsg_realtime_uv`, `datagovsg_realtime_alerts` (lightning, WBGT, flood alerts)
- **SingStat**: `singstat_search_resources`, `singstat_get_metadata`, `singstat_get_table_data`

### Response Format Consistency
All tools return JSON-stringified responses in MCP text content format. Error handling follows consistent pattern with descriptive error messages.

### API Provider Specifics

**Data.gov.sg APIs:**
- No authentication required (public APIs)
- Use the `api-open.data.gov.sg` host. `api-production.data.gov.sg` and `data.gov.sg/api/action` are behind a Cloudflare browser challenge and return HTTP 403 to non-browser clients
- API responses use `code: 0` for success (not `code: 1`)
- Dataset IDs start with `d_` prefix
- Collection IDs are numeric strings
- CKAN datastore uses different response format (`success: true, result: {}`)

**SingStat Table Builder APIs:**
- No authentication required (public APIs)
- API responses use `StatusCode: 200` for success
- Resource IDs are alphanumeric (e.g., M015171)
- Response structure: `{ Data: {}, DataCount: number, StatusCode: number, Message: string }`
- Supports time series, cross-sectional, and multi-dimensional data cubes
- **Search limitations**: `singstat_search_resources` is basic and works best with single keywords rather than complex phrases

## Important Notes

### Smithery Deployment
- Uses `smithery.yaml` with `runtime: typescript`
- Entry point is `src/index.ts` with default export
- Requires `package.json` `module` field pointing to source TypeScript

### Rate Limiting Compliance
Every new upstream call must be preceded by `await rateLimiter.waitIfNeeded()` using the limiter for that provider, so the shared budget stays accurate.

### API Response Validation
Different APIs have different success indicators:
- Collections/Datasets APIs: Check for `data.data` presence
- CKAN Datastore: Check for `data.success && data.result`
- Download APIs: Check for `data.data` presence
- Real-time APIs: Check for `code === 0` and `data.data` presence; rate-limit rejections come back as `code: 24, name: TOO_MANY_REQUESTS` with HTTP 429. Regional readings are `data.items[].readings.<metric>.<region>`; station readings are `data.stations[]` + `data.readings[].data[]`; the `weather?api=` multiplexer and UV use `data.records[]`