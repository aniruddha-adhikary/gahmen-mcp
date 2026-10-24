import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { dataGovSgRateLimiter as rateLimiter } from './rateLimiter.js';

/**
 * data.gov.sg real-time APIs (NEA weather, air quality, UV, alerts).
 *
 * All endpoints live under one host, need no authentication, and return
 * `{ code: 0, data: {...}, errorMsg: '' }`. Most accept an optional `date`
 * query (YYYY-MM-DD or ISO 8601 datetime, Singapore time) to fetch readings
 * for that day/moment instead of the latest.
 */
const REALTIME_API_BASE = 'https://api-open.data.gov.sg/v2/real-time/api';

const REGIONS = ['north', 'south', 'east', 'west', 'central'] as const;
type Region = (typeof REGIONS)[number];

const DATE_DESCRIPTION =
  'Optional date (YYYY-MM-DD) or ISO 8601 datetime (e.g. 2026-10-24T13:00:00) in Singapore time. Omit for the latest reading.';

interface RealtimeEnvelope<T> {
  code: number;
  data: T | null;
  errorMsg?: string;
}

interface RegionMetadata {
  name: string;
  labelLocation: { latitude: number; longitude: number };
}

interface RegionalReadingsItem {
  date: string;
  updatedTimestamp: string;
  timestamp: string;
  readings: Record<string, Record<Region, number>>;
}

interface RegionalReadingsData {
  regionMetadata: RegionMetadata[];
  items: RegionalReadingsItem[];
  paginationToken?: string;
}

interface TwoHourForecastData {
  area_metadata: {
    name: string;
    label_location: { latitude: number; longitude: number };
  }[];
  items: {
    update_timestamp: string;
    timestamp: string;
    valid_period: { start: string; end: string; text: string };
    forecasts: { area: string; forecast: string }[];
  }[];
  paginationToken?: string;
}

interface TwentyFourHourForecastData {
  records: {
    date: string;
    timestamp: string;
    updatedTimestamp: string;
    general: unknown;
    periods: {
      timePeriod: { text: string; start: string; end: string };
      regions: Record<Region, { code: string; text: string }>;
    }[];
  }[];
  paginationToken?: string;
}

interface Station {
  id: string;
  deviceId: string;
  name: string;
  location: { latitude: number; longitude: number };
}

interface StationReadingsData {
  stations: Station[];
  readings: {
    timestamp: string;
    data: { stationId: string; value: number }[];
  }[];
  readingType: string;
  readingUnit: string;
  paginationToken?: string;
}

interface WeatherAlertData {
  records: {
    datetime: string;
    updatedTimestamp: string;
    item: {
      type: string;
      isStationData: boolean;
      readings: Record<string, unknown>[];
    };
  }[];
  paginationToken?: string;
}

async function fetchRealtime<T>(
  path: string,
  params: Record<string, string | undefined> = {}
): Promise<T> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query[key] = value;
  }

  await rateLimiter.waitIfNeeded();
  const response = await axios.get<RealtimeEnvelope<T>>(
    `${REALTIME_API_BASE}/${path}`,
    { params: query }
  );
  const body = response.data;

  if (body.code !== 0 || !body.data) {
    throw new Error(body.errorMsg || `Failed to fetch ${path}`);
  }
  return body.data;
}

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(what: string, error: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error fetching ${what}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    ],
  };
}

/** Case-insensitive match on a station's id or (part of) its name. */
function matchesStation(
  needle: string,
  station: { id?: string; name?: string }
): boolean {
  const q = needle.trim().toLowerCase();
  return (
    station.id?.toLowerCase() === q ||
    (station.name?.toLowerCase().includes(q) ?? false)
  );
}

function sliceRegionalItems(items: RegionalReadingsItem[], region?: Region) {
  return items.map(({ date, updatedTimestamp, timestamp, readings }) => ({
    date,
    updatedTimestamp,
    timestamp,
    readings: region
      ? Object.fromEntries(
          Object.entries(readings).map(([metric, byRegion]) => [
            metric,
            byRegion[region],
          ])
        )
      : readings,
  }));
}

export function registerRealtimeTools(server: McpServer) {
  // Air quality: PSI + PM2.5 by region
  server.tool(
    'datagovsg_realtime_air_quality',
    'Get the latest (or a given date\'s) air quality readings for Singapore from NEA: 24-hour PSI and its pollutant sub-indices (psi_twenty_four_hourly, pm25_sub_index, pm10, so2, no2, co, o3) plus the 1-hour PM2.5 concentration (pm25_one_hourly, µg/m³), per region. Use this for "what is the PSI / haze / PM2.5 in the south right now". Note NEA publishes PSI as a 24-hour index and PM2.5 as a 1-hour reading; there is no 1-hour PSI.',
    {
      region: z
        .enum(REGIONS)
        .optional()
        .describe(
          'Return only this region (north, south, east, west, central). Omit for all five regions.'
        ),
      metrics: z
        .enum(['all', 'psi', 'pm25'])
        .optional()
        .describe(
          "Which API to query: 'psi' (24-hour PSI and sub-indices), 'pm25' (1-hour PM2.5), or 'all' (default: both, two upstream requests)."
        ),
      date: z.string().optional().describe(DATE_DESCRIPTION),
    },
    async ({ region, metrics = 'all', date }) => {
      try {
        const result: Record<string, unknown> = {};
        if (region) result.region = region;

        if (metrics === 'all' || metrics === 'psi') {
          const psi = await fetchRealtime<RegionalReadingsData>('psi', {
            date,
          });
          if (!region) result.regionMetadata = psi.regionMetadata;
          result.psi = sliceRegionalItems(psi.items, region);
        }
        if (metrics === 'all' || metrics === 'pm25') {
          const pm25 = await fetchRealtime<RegionalReadingsData>('pm25', {
            date,
          });
          if (!region && !result.regionMetadata) {
            result.regionMetadata = pm25.regionMetadata;
          }
          result.pm25 = sliceRegionalItems(pm25.items, region);
        }

        return textResult(result);
      } catch (error) {
        return errorResult('air quality', error);
      }
    }
  );

  // Weather forecasts: 2-hour by area, 24-hour by region, 4-day outlook
  server.tool(
    'datagovsg_realtime_weather_forecast',
    "Get NEA weather forecasts for Singapore: 'two-hour' nowcast per town/area (e.g. Ang Mo Kio, Bedok, City, Jurong West), 'twenty-four-hour' general forecast with 6-hour periods per region, or the 'four-day' outlook.",
    {
      horizon: z
        .enum(['two-hour', 'twenty-four-hour', 'four-day'])
        .describe('Which forecast product to fetch.'),
      area: z
        .string()
        .optional()
        .describe(
          "two-hour only: return just the areas whose name contains this text (case-insensitive), e.g. 'Bedok'."
        ),
      region: z
        .enum(REGIONS)
        .optional()
        .describe(
          'twenty-four-hour only: return only this region in each 6-hour period.'
        ),
      date: z.string().optional().describe(DATE_DESCRIPTION),
    },
    async ({ horizon, area, region, date }) => {
      try {
        if (horizon === 'two-hour') {
          const data = await fetchRealtime<TwoHourForecastData>(
            'two-hr-forecast',
            { date }
          );
          const q = area?.trim().toLowerCase();
          const items = data.items.map((item) => ({
            ...item,
            forecasts: q
              ? item.forecasts.filter((f) => f.area.toLowerCase().includes(q))
              : item.forecasts,
          }));
          return textResult({
            ...(area ? { area } : {}),
            items,
            ...(q ? {} : { areas: data.area_metadata.map((a) => a.name) }),
            ...(data.paginationToken
              ? { paginationToken: data.paginationToken }
              : {}),
          });
        }

        if (horizon === 'twenty-four-hour') {
          const data = await fetchRealtime<TwentyFourHourForecastData>(
            'twenty-four-hr-forecast',
            { date }
          );
          const records = data.records.map((record) => ({
            ...record,
            periods: record.periods.map((period) => ({
              timePeriod: period.timePeriod,
              regions: region
                ? { [region]: period.regions[region] }
                : period.regions,
            })),
          }));
          return textResult({
            ...(region ? { region } : {}),
            records,
            ...(data.paginationToken
              ? { paginationToken: data.paginationToken }
              : {}),
          });
        }

        const data = await fetchRealtime<Record<string, unknown>>(
          'four-day-outlook',
          { date }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(`${horizon} weather forecast`, error);
      }
    }
  );

  // Station readings: rainfall, temperature, humidity, wind
  server.tool(
    'datagovsg_realtime_weather_readings',
    "Get the latest (or a given date's) readings from NEA weather stations across Singapore: rainfall (mm, 5-minute total), air-temperature (°C), relative-humidity (%), wind-direction (degrees) or wind-speed (knots). Returns the station list (id, name, coordinates) and readings per station.",
    {
      type: z
        .enum([
          'rainfall',
          'air-temperature',
          'relative-humidity',
          'wind-direction',
          'wind-speed',
        ])
        .describe('Which measurement to fetch.'),
      station: z
        .string()
        .optional()
        .describe(
          "Return only stations whose id matches or whose name contains this text (case-insensitive), e.g. 'S24' or 'Changi'."
        ),
      date: z.string().optional().describe(DATE_DESCRIPTION),
    },
    async ({ type, station, date }) => {
      try {
        const data = await fetchRealtime<StationReadingsData>(type, { date });

        let stations = data.stations;
        let readings = data.readings;
        if (station) {
          stations = data.stations.filter((s) => matchesStation(station, s));
          const ids = new Set(stations.map((s) => s.id));
          readings = data.readings.map((r) => ({
            timestamp: r.timestamp,
            data: r.data.filter((d) => ids.has(d.stationId)),
          }));
        }

        return textResult({
          type,
          readingType: data.readingType,
          readingUnit: data.readingUnit,
          ...(station ? { station } : {}),
          stations,
          readings,
          ...(data.paginationToken
            ? { paginationToken: data.paginationToken }
            : {}),
        });
      } catch (error) {
        return errorResult(`${type} readings`, error);
      }
    }
  );

  // UV index
  server.tool(
    'datagovsg_realtime_uv',
    'Get the UV index for Singapore from NEA: hourly values for the current day (or a given date), most recent hour first. 0-2 low, 3-5 moderate, 6-7 high, 8-10 very high, 11+ extreme.',
    {
      date: z.string().optional().describe(DATE_DESCRIPTION),
    },
    async ({ date }) => {
      try {
        const data = await fetchRealtime<Record<string, unknown>>('uv', {
          date,
        });
        return textResult(data);
      } catch (error) {
        return errorResult('UV index', error);
      }
    }
  );

  // Hazard observations: lightning, heat stress (WBGT), flood alerts
  server.tool(
    'datagovsg_realtime_alerts',
    "Get NEA hazard observations for Singapore: 'lightning' strikes (empty readings means none observed), 'wbgt' wet-bulb globe temperature and heat-stress level per station, or 'flood-alerts' from PUB (empty readings means no active alerts).",
    {
      type: z
        .enum(['lightning', 'wbgt', 'flood-alerts'])
        .describe('Which observation to fetch.'),
      station: z
        .string()
        .optional()
        .describe(
          "wbgt only: return only stations whose id matches or whose name contains this text (case-insensitive), e.g. 'Bishan'."
        ),
      date: z.string().optional().describe(DATE_DESCRIPTION),
    },
    async ({ type, station, date }) => {
      try {
        const data = await fetchRealtime<WeatherAlertData>('weather', {
          api: type,
          date,
        });

        const records = data.records.map((record) => {
          if (!station || !record.item.isStationData) return record;
          const readings = record.item.readings.filter((reading) => {
            const s = reading.station as { id?: string; name?: string };
            return s ? matchesStation(station, s) : false;
          });
          return { ...record, item: { ...record.item, readings } };
        });

        return textResult({
          type,
          ...(station ? { station } : {}),
          records,
          ...(data.paginationToken
            ? { paginationToken: data.paginationToken }
            : {}),
        });
      } catch (error) {
        return errorResult(`${type} observations`, error);
      }
    }
  );
}
