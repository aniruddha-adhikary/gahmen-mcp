[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/aniruddha-adhikary-gahmen-mcp-badge.png)](https://mseep.ai/app/aniruddha-adhikary-gahmen-mcp)

# Gahmen MCP Server

MCP (Model Context Protocol) server for Singapore's data.gov.sg APIs, providing easy access to government datasets and collections.

## Features

- Access to data.gov.sg collections and datasets
- Search within datasets using CKAN datastore API
- Dataset download functionality with filtering support
- Built-in rate limiting to respect API quotas (5 requests per minute)

## Available Tools

### Collections

- `list_collections` - List all collections on data.gov.sg
- `get_collection` - Get metadata for a specific collection

### Datasets

- `list_datasets` - List all datasets on data.gov.sg
- `get_dataset_metadata` - Get metadata for a specific dataset
- `search_dataset` - Search for data within a dataset using CKAN datastore
- `initiate_download` - Start downloading a dataset with optional filtering
- `poll_download` - Check download status and get download URL

## Installation

```bash
npm install
```

## Development

```bash
npx @smithery/cli dev
```

## Build

```bash
npx @smithery/cli build
```

## Usage Examples

### Search a Dataset

```javascript
// Search population data
search_dataset({
  resource_id: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",
  q: { "year": "2023" },
  limit: 10
})
```

### Get Collection with Datasets

```javascript
// Get collection 522 with all dataset metadata
get_collection({
  collectionId: "522",
  withDatasetMetadata: true
})
```

## API Rate Limits

The server implements automatic rate limiting:
- Maximum 5 requests per minute
- 12-second minimum interval between requests

## No Authentication Required

data.gov.sg APIs are public and don't require authentication.

## License

MIT