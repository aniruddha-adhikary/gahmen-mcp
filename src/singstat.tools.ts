import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { singStatRateLimiter as rateLimiter } from './rateLimiter.js';

// API Base URL for SingStat
const SINGSTAT_API_BASE = 'https://tablebuilder.singstat.gov.sg/api/table';

export function registerSingStatTools(server: McpServer) {
  // Search for tables by keyword
  server.tool(
    'singstat_search_resources',
    'Search for SingStat tables by keyword (works best with single words)',
    {
      keyword: z
        .string()
        .describe(
          'Single keyword to search for (e.g., "population", "retail", "GDP")'
        ),
      searchOption: z
        .enum(['all', 'title', 'variable'])
        .describe('Search within "all", "title", or "variable"'),
    },
    async ({ keyword, searchOption }) => {
      try {
        const url = `${SINGSTAT_API_BASE}/resourceid`;
        const params = { keyword, searchOption };

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, { params });
        const data = response.data;

        if (data.StatusCode === 200 && data.Data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.Data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(
            data.Message || 'Failed to search SingStat resources'
          );
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error searching SingStat resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Get table metadata
  server.tool(
    'singstat_get_metadata',
    'Get metadata for a specific SingStat table',
    {
      resourceId: z
        .string()
        .describe('Resource ID of the table (e.g., M015171)'),
    },
    async ({ resourceId }) => {
      try {
        const url = `${SINGSTAT_API_BASE}/metadata/${resourceId}`;

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url);
        const data = response.data;

        if (data.StatusCode === 200 && data.Data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.Data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(
            data.Message || 'Failed to fetch SingStat table metadata'
          );
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching SingStat metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );

  // Get table data
  server.tool(
    'singstat_get_table_data',
    'Get data from a specific SingStat table with optional filtering',
    {
      resourceId: z.string().describe('Resource ID of the table'),
      seriesNoORrowNo: z
        .string()
        .optional()
        .describe(
          'Series number for time series or row number for cross-sectional tables'
        ),
      offset: z.number().optional().describe('Number of records to skip'),
      limit: z
        .number()
        .max(5000)
        .optional()
        .describe('Maximum number of records to return (max 5000)'),
      sortBy: z
        .enum([
          'key asc',
          'key desc',
          'value asc',
          'value desc',
          'seriesno asc',
          'seriesno desc',
          'rowno asc',
          'rowno desc',
          'rowtext asc',
          'rowtext desc',
        ])
        .optional()
        .describe('Sort order (not applicable for cross-sectional tables)'),
      timeFilter: z
        .string()
        .optional()
        .describe(
          'Filter by time periods (e.g., "2017,2018" for annual, "2018 Mar" for monthly)'
        ),
      between: z
        .string()
        .optional()
        .describe('Range filter for data values (e.g., "100,200")'),
      search: z.string().optional().describe('Search within the data'),
    },
    async ({
      resourceId,
      seriesNoORrowNo,
      offset,
      limit,
      sortBy,
      timeFilter,
      between,
      search,
    }) => {
      try {
        const url = `${SINGSTAT_API_BASE}/tabledata/${resourceId}`;
        const params: any = {};

        if (seriesNoORrowNo !== undefined)
          params.seriesNoORrowNo = seriesNoORrowNo;
        if (offset !== undefined) params.offset = offset;
        if (limit !== undefined) params.limit = limit;
        if (sortBy) params.sortBy = sortBy;
        if (timeFilter) params.timeFilter = timeFilter;
        if (between) params.between = between;
        if (search) params.search = search;

        await rateLimiter.waitIfNeeded();
        const response = await axios.get(url, { params });
        const data = response.data;

        if (data.StatusCode === 200 && data.Data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data.Data, null, 2),
              },
            ],
          };
        } else {
          throw new Error(
            data.Message || 'Failed to fetch SingStat table data'
          );
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching SingStat table data: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }
  );
}
