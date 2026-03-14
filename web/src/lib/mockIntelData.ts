export type IntelPoint = {
  id: string;
  latitude: number;
  longitude: number;
  country_name: string;
  message_count: number;
  text_snippet?: string;
};

export const MOCK_INTEL_MESSAGES: IntelPoint[] = [
  { id: '1', latitude: 50.45, longitude: 30.52, country_name: 'Ukraine', message_count: 42 },
  { id: '2', latitude: 55.75, longitude: 37.62, country_name: 'Russia', message_count: 89 },
  { id: '3', latitude: 31.77, longitude: 35.21, country_name: 'Israel', message_count: 56 },
  { id: '4', latitude: 33.31, longitude: 44.36, country_name: 'Iraq', message_count: 23 },
  { id: '5', latitude: 25.28, longitude: 51.52, country_name: 'Qatar', message_count: 12 },
  { id: '6', latitude: 24.47, longitude: 54.37, country_name: 'UAE', message_count: 18 },
  { id: '7', latitude: 35.68, longitude: 51.42, country_name: 'Iran', message_count: 67 },
  { id: '8', latitude: 39.9, longitude: 116.41, country_name: 'China', message_count: 34 },
  { id: '9', latitude: 37.57, longitude: 126.98, country_name: 'South Korea', message_count: 28 },
  { id: '10', latitude: 41.01, longitude: 28.95, country_name: 'Turkey', message_count: 45 },
  { id: '11', latitude: 52.52, longitude: 13.4, country_name: 'Germany', message_count: 31 },
  { id: '12', latitude: 48.86, longitude: 2.35, country_name: 'France', message_count: 22 },
  { id: '13', latitude: 51.51, longitude: -0.13, country_name: 'United Kingdom', message_count: 38 },
  { id: '14', latitude: 40.42, longitude: -3.7, country_name: 'Spain', message_count: 15 },
  { id: '15', latitude: 25.04, longitude: 55.22, country_name: 'Saudi Arabia', message_count: 29 },
];
