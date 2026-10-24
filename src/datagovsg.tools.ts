import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { dataGovSgRateLimiter as rateLimiter } from './rateLimiter.js';

// API Base URLs for data.gov.sg
const COLLECTION_API_BASE = 'https://api-open.data.gov.sg/v2/public/api';
const DATASET_API_BASE = 'https://api-open.data.gov.sg/v2/public/api';
const DATASTORE_API_BASE = 'https://api-open.data.gov.sg/api/action';
const DOWNLOAD_API_BASE = 'https://api-open.data.gov.sg/v1/public/api';

export function registerDataGovSgTools(server: McpServer) {
  // List all collections
  server.tool(
    'datagovsg_list_collections',
    'List all collections on data.gov.sg',
    {
      page: z.number().min(1).optional().describe('Page number (optional)'),
    },
    async ({ page }) => {
      try {
        const url = `${COLLECTION_API_BASE}/collections`;
        const params = page ? { page } : {};

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, { params });
        const data = response.data;

        if (data.data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(data.errorMsg || 'Failed to fetch collections');
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching collections: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Get collection metadata
  server.tool(
    'datagovsg_get_collection',
    'Get metadata for a specific data.gov.sg collection',
    {
      collectionId: z
        .string()
        .describe('The unique identifier of the collection'),
      withDatasetMetadata: z
        .boolean()
        .optional()
        .describe('Include dataset metadata (default: false)'),
    },
    async ({ collectionId, withDatasetMetadata }) => {
      try {
        const url = `${COLLECTION_API_BASE}/collections/${collectionId}/metadata`;
        const params = withDatasetMetadata ? { withDatasetMetadata: true } : {};

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, { params });
        const data = response.data;

        if (data.data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(
            data.errorMsg || 'Failed to fetch collection metadata'
          );
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // List all datasets
  server.tool(
    'datagovsg_list_datasets',
    'List all datasets on data.gov.sg',
    {
      page: z.number().min(1).optional().describe('Page number (optional)'),
    },
    async ({ page }) => {
      try {
        const url = `${DATASET_API_BASE}/datasets`;
        const params = page ? { page } : {};

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, { params });
        const data = response.data;

        if (data.data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(data.errorMsg || 'Failed to fetch datasets');
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching datasets: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Get dataset metadata
  server.tool(
    'datagovsg_get_dataset_metadata',
    'Get metadata for a specific data.gov.sg dataset',
    {
      datasetId: z.string().describe('The unique identifier of the dataset'),
    },
    async ({ datasetId }) => {
      try {
        const url = `${DATASET_API_BASE}/datasets/${datasetId}/metadata`;

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url);
        const data = response.data;

        if (data.data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(data.errorMsg || 'Failed to fetch dataset metadata');
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching dataset metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Search dataset rows
  server.tool(
    'datagovsg_search_dataset',
    'Search for data within a data.gov.sg dataset',
    {
      resource_id: z.string().describe('Dataset ID (starts with d_)'),
      limit: z
        .number()
        .optional()
        .describe('Maximum rows to return (default: 100)'),
      offset: z.number().optional().describe('Number of rows to skip'),
      fields: z
        .string()
        .optional()
        .describe('Comma-separated fields to return'),
      filters: z
        .record(z.any())
        .optional()
        .describe('Dictionary of matching conditions'),
      q: z
        .union([z.string(), z.record(z.string())])
        .optional()
        .describe('Full text query'),
      sort: z
        .string()
        .optional()
        .describe('Comma-separated fields with ordering'),
    },
    async ({ resource_id, limit, offset, fields, filters, q, sort }) => {
      try {
        const url = `${DATASTORE_API_BASE}/datastore_search`;
        const params: any = { resource_id };

        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        if (fields) params.fields = fields;
        if (filters) params.filters = JSON.stringify(filters);
        if (q) params.q = typeof q === 'string' ? q : JSON.stringify(q);
        if (sort) params.sort = sort;

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, { params });
        const data = response.data;

        if (data.success && data.result) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.result, null, 2),
              },
            ],
          };
        } else {
          throw new Error('Failed to search dataset');
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error searching dataset: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Initiate dataset download
  server.tool(
    'datagovsg_initiate_download',
    'Initiate download of a data.gov.sg dataset with optional filtering',
    {
      datasetId: z.string().describe('ID of the dataset'),
      columnNames: z
        .array(z.string())
        .optional()
        .describe('List of columns to include'),
      filters: z
        .array(
          z.object({
            columnName: z.string(),
            type: z.enum(['EQ', 'LIKE', 'ILIKE']),
            value: z.any(),
          })
        )
        .optional()
        .describe('Filters to apply to the dataset'),
    },
    async ({ datasetId, columnNames, filters }) => {
      try {
        const url = `${DOWNLOAD_API_BASE}/datasets/${datasetId}/initiate-download`;
        const body: any = {};

        if (columnNames) body.columnNames = columnNames;
        if (filters) body.filters = filters;

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, {
          headers: { 'Content-Type': 'application/json' },
          data: body,
        });

        const data = response.data;

        if (data.data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(data.errorMsg || 'Failed to initiate download');
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error initiating download: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Poll download status
  server.tool(
    'datagovsg_poll_download',
    'Check data.gov.sg download status and get download URL',
    {
      datasetId: z.string().describe('ID of the dataset'),
      columnNames: z
        .array(z.string())
        .optional()
        .describe('List of columns (must match initiate_download)'),
      filters: z
        .array(
          z.object({
            columnName: z.string(),
            type: z.enum(['EQ', 'LIKE', 'ILIKE']),
            value: z.any(),
          })
        )
        .optional()
        .describe('Filters (must match initiate_download)'),
    },
    async ({ datasetId, columnNames, filters }) => {
      try {
        const url = `${DOWNLOAD_API_BASE}/datasets/${datasetId}/poll-download`;
        const body: any = {};

        if (columnNames) body.columnNames = columnNames;
        if (filters) body.filters = filters;

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, {
          headers: { 'Content-Type': 'application/json' },
          data: body,
        });

        const data = response.data;

        if (data.data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(data.errorMsg || 'Failed to poll download');
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error polling download: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );
}
