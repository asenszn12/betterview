/**
 * Extract globe points from Telegram messages by detecting **countries mentioned in the message content** (text).
 * Each message can contribute to multiple countries if it mentions them.
 */

export type TelegramMessageRow = {
  id: string;
  channel_username: string | null;
  channel_title: string | null;
  text: string;
  text_translated: string | null;
};

export type GlobePoint = {
  id: string;
  latitude: number;
  longitude: number;
  country_name: string;
  message_count: number;
  text_snippet?: string;
};

/** Country name → approximate centroid [lat, lon] for the globe. */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  'United Kingdom': [54.0, -2.5],
  UK: [54.0, -2.5],
  Ukraine: [49.0, 32.0],
  'United States': [39.0, -98.0],
  USA: [39.0, -98.0],
  Russia: [60.0, 100.0],
  Belarus: [53.5, 28.0],
  'Saudi Arabia': [25.0, 45.0],
  Israel: [31.5, 34.75],
  Iraq: [33.0, 44.0],
  Iran: [32.0, 53.0],
  Turkey: [39.0, 35.0],
  China: [35.0, 105.0],
  Germany: [51.0, 10.0],
  France: [46.0, 2.0],
  Poland: [52.0, 20.0],
  Syria: [35.0, 38.0],
  Yemen: [15.5, 48.0],
  Libya: [27.0, 17.0],
  Egypt: [27.0, 30.0],
  Afghanistan: [33.0, 65.0],
  Pakistan: [30.0, 70.0],
  India: [22.0, 77.0],
  'South Korea': [36.0, 128.0],
  'North Korea': [40.0, 127.0],
  Taiwan: [24.0, 121.0],
  Gaza: [31.5, 34.5],
  Palestine: [31.9, 35.2],
  Lebanon: [33.8, 35.8],
  Jordan: [31.0, 36.0],
  Qatar: [25.3, 51.5],
  UAE: [24.0, 54.0],
  Kuwait: [29.5, 47.8],
  Kazakhstan: [48.0, 68.0],
  Georgia: [42.0, 43.5],
  Armenia: [40.0, 45.0],
  Azerbaijan: [40.5, 47.5],
  Sudan: [15.0, 30.0],
  Ethiopia: [9.0, 40.0],
  Nigeria: [10.0, 8.0],
  Somalia: [6.0, 46.0],
  Venezuela: [8.0, -66.0],
  Mexico: [23.0, -102.0],
  Brazil: [14.0, -51.0],
  Unknown: [20.0, 0.0],
};

/** One label per country for the globe (name + [lat, lon]); skip aliases like UK. */
export const GLOBE_COUNTRY_LABELS: { name: string; latitude: number; longitude: number }[] = [
  { name: 'United Kingdom', latitude: 54.0, longitude: -2.5 },
  { name: 'Ukraine', latitude: 49.0, longitude: 32.0 },
  { name: 'United States', latitude: 39.0, longitude: -98.0 },
  { name: 'Russia', latitude: 60.0, longitude: 100.0 },
  { name: 'Belarus', latitude: 53.5, longitude: 28.0 },
  { name: 'Saudi Arabia', latitude: 25.0, longitude: 45.0 },
  { name: 'Israel', latitude: 31.5, longitude: 34.75 },
  { name: 'Iraq', latitude: 33.0, longitude: 44.0 },
  { name: 'Iran', latitude: 32.0, longitude: 53.0 },
  { name: 'Turkey', latitude: 39.0, longitude: 35.0 },
  { name: 'China', latitude: 35.0, longitude: 105.0 },
  { name: 'Germany', latitude: 51.0, longitude: 10.0 },
  { name: 'France', latitude: 46.0, longitude: 2.0 },
  { name: 'Poland', latitude: 52.0, longitude: 20.0 },
  { name: 'Syria', latitude: 35.0, longitude: 38.0 },
  { name: 'Yemen', latitude: 15.5, longitude: 48.0 },
  { name: 'Libya', latitude: 27.0, longitude: 17.0 },
  { name: 'Egypt', latitude: 27.0, longitude: 30.0 },
  { name: 'Afghanistan', latitude: 33.0, longitude: 65.0 },
  { name: 'Pakistan', latitude: 30.0, longitude: 70.0 },
  { name: 'India', latitude: 22.0, longitude: 77.0 },
  { name: 'South Korea', latitude: 36.0, longitude: 128.0 },
  { name: 'North Korea', latitude: 40.0, longitude: 127.0 },
  { name: 'Taiwan', latitude: 24.0, longitude: 121.0 },
  { name: 'Gaza', latitude: 31.5, longitude: 34.5 },
  { name: 'Palestine', latitude: 31.9, longitude: 35.2 },
  { name: 'Lebanon', latitude: 33.8, longitude: 35.8 },
  { name: 'Jordan', latitude: 31.0, longitude: 36.0 },
  { name: 'Qatar', latitude: 25.3, longitude: 51.5 },
  { name: 'UAE', latitude: 24.0, longitude: 54.0 },
  { name: 'Kuwait', latitude: 29.5, longitude: 47.8 },
  { name: 'Kazakhstan', latitude: 48.0, longitude: 68.0 },
  { name: 'Georgia', latitude: 42.0, longitude: 43.5 },
  { name: 'Armenia', latitude: 40.0, longitude: 45.0 },
  { name: 'Azerbaijan', latitude: 40.5, longitude: 47.5 },
  { name: 'Sudan', latitude: 15.0, longitude: 30.0 },
  { name: 'Ethiopia', latitude: 9.0, longitude: 40.0 },
  { name: 'Nigeria', latitude: 10.0, longitude: 8.0 },
  { name: 'Somalia', latitude: 6.0, longitude: 46.0 },
  { name: 'Venezuela', latitude: 8.0, longitude: -66.0 },
  { name: 'Mexico', latitude: 23.0, longitude: -102.0 },
  { name: 'Brazil', latitude: 14.0, longitude: -51.0 },
  { name: 'Spain', latitude: 40.0, longitude: -4.0 },
  { name: 'Italy', latitude: 42.8, longitude: 12.5 },
  { name: 'Canada', latitude: 56.0, longitude: -106.0 },
  { name: 'Australia', latitude: -25.0, longitude: 133.0 },
  { name: 'Japan', latitude: 36.0, longitude: 138.0 },
  { name: 'Indonesia', latitude: -5.0, longitude: 120.0 },
  { name: 'Norway', latitude: 62.0, longitude: 10.0 },
  { name: 'Sweden', latitude: 62.0, longitude: 15.0 },
  { name: 'Finland', latitude: 64.0, longitude: 26.0 },
  { name: 'Algeria', latitude: 28.0, longitude: 3.0 },
  { name: 'South Africa', latitude: -29.0, longitude: 24.0 },
  { name: 'Argentina', latitude: -34.0, longitude: -64.0 },
];

/**
 * For each country/region, keywords to look for in message content (lowercase).
 * Order by specificity (e.g. "south korea" before "korea") so we don't double-count.
 */
const CONTENT_COUNTRY_KEYWORDS: { country: string; keywords: string[] }[] = [
  { country: 'North Korea', keywords: ['north korea', 'dprk', 'pyongyang'] },
  { country: 'South Korea', keywords: ['south korea', 'seoul', 'rok'] },
  { country: 'United Kingdom', keywords: ['united kingdom', 'uk ', ' u.k.', 'britain', 'british', 'london', 'england', 'scotland', 'wales'] },
  { country: 'United States', keywords: ['united states', 'usa', 'u.s.', 'us ', 'america', 'american', 'washington', 'pentagon', 'nato'] },
  { country: 'Saudi Arabia', keywords: ['saudi', 'riyadh', 'saudi arabia'] },
  { country: 'Ukraine', keywords: ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'donbas', 'donbass', 'kharkiv', 'odesa', 'luhansk', 'donetsk'] },
  { country: 'Russia', keywords: ['russia', 'russian', 'moscow', 'kremlin', 'putin', 'russian forces', 'rf ', 'belgorod', 'voronezh'] },
  { country: 'Israel', keywords: ['israel', 'israeli', 'tel aviv', 'idf', 'gaza', 'hezbollah'] },
  { country: 'Gaza', keywords: ['gaza', 'gaza strip'] },
  { country: 'Palestine', keywords: ['palestine', 'palestinian', 'west bank'] },
  { country: 'Iran', keywords: ['iran', 'iranian', 'tehran', 'irgc'] },
  { country: 'Iraq', keywords: ['iraq', 'iraqi', 'baghdad', 'mosul'] },
  { country: 'Syria', keywords: ['syria', 'syrian', 'damascus', 'aleppo', 'idlib'] },
  { country: 'Turkey', keywords: ['turkey', 'turkish', 'ankara', 'istanbul', 'erdogan'] },
  { country: 'Yemen', keywords: ['yemen', 'yemeni', 'houthi', 'sanaa'] },
  { country: 'Lebanon', keywords: ['lebanon', 'lebanese', 'beirut'] },
  { country: 'Jordan', keywords: ['jordan', 'jordanian', 'amman'] },
  { country: 'Egypt', keywords: ['egypt', 'egyptian', 'cairo'] },
  { country: 'Libya', keywords: ['libya', 'libyan', 'tripoli'] },
  { country: 'Qatar', keywords: ['qatar', 'doha'] },
  { country: 'UAE', keywords: ['uae', 'emirates', 'dubai', 'abu dhabi'] },
  { country: 'Kuwait', keywords: ['kuwait', 'kuwaiti'] },
  { country: 'Afghanistan', keywords: ['afghanistan', 'afghan', 'kabul', 'taliban'] },
  { country: 'Pakistan', keywords: ['pakistan', 'pakistani', 'islamabad'] },
  { country: 'India', keywords: ['india', 'indian', 'new delhi', 'modi'] },
  { country: 'China', keywords: ['china', 'chinese', 'beijing', 'xi jinping', 'taiwan'] },
  { country: 'Taiwan', keywords: ['taiwan', 'taipei'] },
  { country: 'Belarus', keywords: ['belarus', 'belarusian', 'lukashenko', 'minsk'] },
  { country: 'Georgia', keywords: ['georgia', 'georgian', 'tbilisi'] },
  { country: 'Armenia', keywords: ['armenia', 'armenian', 'yerevan'] },
  { country: 'Azerbaijan', keywords: ['azerbaijan', 'azerbaijani', 'baku'] },
  { country: 'Kazakhstan', keywords: ['kazakhstan', 'kazakh', 'nur-sultan'] },
  { country: 'Poland', keywords: ['poland', 'polish', 'warsaw'] },
  { country: 'Germany', keywords: ['germany', 'german', 'berlin'] },
  { country: 'France', keywords: ['france', 'french', 'paris'] },
  { country: 'Sudan', keywords: ['sudan', 'sudanese', 'khartoum'] },
  { country: 'Ethiopia', keywords: ['ethiopia', 'ethiopian', 'addis ababa'] },
  { country: 'Nigeria', keywords: ['nigeria', 'nigerian', 'lagos', 'abuja'] },
  { country: 'Somalia', keywords: ['somalia', 'somali', 'mogadishu'] },
  { country: 'Venezuela', keywords: ['venezuela', 'venezuelan', 'caracas'] },
  { country: 'Mexico', keywords: ['mexico', 'mexican'] },
  { country: 'Brazil', keywords: ['brazil', 'brazilian', 'brasilia'] },
];

/** Normalize for matching: lowercase, collapse spaces. */
function normalizeForMatch(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Find all countries mentioned in a single message (content-based).
 * Returns a set of country names that appear in the message text.
 */
function countriesMentionedInText(text: string): Set<string> {
  const normalized = normalizeForMatch(text);
  if (!normalized) return new Set();
  const found = new Set<string>();
  for (const { country, keywords } of CONTENT_COUNTRY_KEYWORDS) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        found.add(country);
        break;
      }
    }
  }
  return found;
}

/**
 * Aggregate Telegram messages by **countries mentioned in the message content**.
 * Each message can add to multiple countries. Heat/pins = number of messages that mention that country.
 */
export function aggregateTelegramToGlobePoints(rows: TelegramMessageRow[]): GlobePoint[] {
  const byCountry = new Map<string, { count: number; lastText: string }>();

  for (const r of rows) {
    const content = r.text_translated || r.text || '';
    const snippet = content.slice(0, 160);
    const countries = countriesMentionedInText(content);

    if (countries.size === 0) continue;

    for (const country of countries) {
      const cur = byCountry.get(country);
      if (!cur) {
        byCountry.set(country, { count: 1, lastText: snippet });
      } else {
        cur.count += 1;
        if (snippet) cur.lastText = snippet;
      }
    }
  }

  const coords = COUNTRY_COORDS;
  return Array.from(byCountry.entries()).map(([country, { count, lastText }], i) => {
    const [lat, lon] = coords[country] ?? coords['Unknown'];
    return {
      id: `tg-${country}-${i}`,
      latitude: lat,
      longitude: lon,
      country_name: country,
      message_count: count,
      text_snippet: lastText || undefined,
    };
  });
}
