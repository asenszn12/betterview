import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { supabase } from '../lib/supabase';
import './Thunderdome.css';

// ---------------------------------------------------------------------------
// Types (Supabase messages table)
// ---------------------------------------------------------------------------

export type MessageSeverity = 'critical' | 'high' | 'low';

export interface ThunderdomeMessage {
  id: string;
  latitude: number;
  longitude: number;
  message_text: string;
  severity: MessageSeverity;
  telegram_url?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Colourful globe texture */
const GLOBE_IMAGE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';

const SEVERITY_COLORS: Record<MessageSeverity, string> = {
  critical: '#ff4444',
  high: '#ffd000',
  low: '#44aaff',
};

/** Ring gradient: inner bright, outer fade – more visible flicker */
const SEVERITY_RING_GRADIENTS: Record<MessageSeverity, [string, string]> = {
  critical: ['rgba(255, 70, 70, 0.95)', 'rgba(255, 120, 120, 0.35)'],
  high: ['rgba(255, 220, 0, 0.9)', 'rgba(255, 240, 100, 0.4)'],
  low: ['rgba(80, 160, 255, 0.9)', 'rgba(120, 190, 255, 0.4)'],
};

/** Faster pulse = more urgent. critical flickers fastest. */
const SEVERITY_RING_PERIOD_MS: Record<MessageSeverity, number> = {
  critical: 500,
  high: 800,
  low: 1200,
};

const SEVERITY_RING_MAX_RADIUS: Record<MessageSeverity, number> = {
  critical: 2,
  high: 1.6,
  low: 1.3,
};

/** Epsilon in degrees to treat two coords as "same location" for clumping */
const CLUSTER_EPS = 0.015;
/** Jitter range for clustered messages (degrees): ±0.01 to ±0.05 */
const JITTER_MIN = 0.01;
const JITTER_MAX = 0.05;

/**
 * Deterministic seeded RNG (0..1). Same seed => same sequence.
 */
function seededRng(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

/**
 * Anti-clumping: jitter coordinates so messages at the same/similar location
 * are spread by a small offset. Deterministic per message id so the globe
 * doesn’t jump on re-renders.
 */
function jitterMessageCoords(
  messages: ThunderdomeMessage[],
  clusterEps: number = CLUSTER_EPS,
  jitterMin: number = JITTER_MIN,
  jitterMax: number = JITTER_MAX
): ThunderdomeMessage[] {
  const key = (lat: number, lng: number) =>
    `${Math.round(lat / clusterEps)}_${Math.round(lng / clusterEps)}`;
  const groups = new Map<string, ThunderdomeMessage[]>();
  for (const m of messages) {
    const k = key(m.latitude, m.longitude);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }

  return messages.map((m) => {
    const k = key(m.latitude, m.longitude);
    const group = groups.get(k)!;
    const isClustered = group.length > 1;
    const rng = seededRng(
      m.id.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0) >>> 0
    );
    const range = isClustered ? jitterMax - jitterMin : 0;
    const offset = isClustered ? jitterMin + rng() * range : 0;
    const latOff = (rng() * 2 - 1) * offset;
    const lngOff = (rng() * 2 - 1) * offset;
    return {
      ...m,
      latitude: m.latitude + latOff,
      longitude: m.longitude + lngOff,
    };
  });
}

/** Country labels: name + approximate center (lat, lng) for the globe */
const COUNTRY_LABELS: { name: string; lat: number; lng: number }[] = [
  { name: 'United States', lat: 39, lng: -98 },
  { name: 'Canada', lat: 56, lng: -106 },
  { name: 'Mexico', lat: 23, lng: -102 },
  { name: 'Brazil', lat: 14, lng: -51 },
  { name: 'Argentina', lat: -34, lng: -64 },
  { name: 'United Kingdom', lat: 54, lng: -2 },
  { name: 'France', lat: 46, lng: 2 },
  { name: 'Germany', lat: 51, lng: 10 },
  { name: 'Spain', lat: 40, lng: -4 },
  { name: 'Italy', lat: 42.8, lng: 12.5 },
  { name: 'Poland', lat: 52, lng: 20 },
  { name: 'Ukraine', lat: 49, lng: 32 },
  { name: 'Russia', lat: 60, lng: 100 },
  { name: 'Turkey', lat: 39, lng: 35 },
  { name: 'Saudi Arabia', lat: 25, lng: 45 },
  { name: 'Iran', lat: 32, lng: 53 },
  { name: 'Iraq', lat: 33, lng: 44 },
  { name: 'Israel', lat: 31.5, lng: 34.75 },
  { name: 'Egypt', lat: 27, lng: 30 },
  { name: 'South Africa', lat: -29, lng: 24 },
  { name: 'Nigeria', lat: 10, lng: 8 },
  { name: 'India', lat: 22, lng: 77 },
  { name: 'China', lat: 35, lng: 105 },
  { name: 'Japan', lat: 36, lng: 138 },
  { name: 'Australia', lat: -25, lng: 133 },
  { name: 'Indonesia', lat: -5, lng: 120 },
  { name: 'Pakistan', lat: 30, lng: 70 },
  { name: 'Kazakhstan', lat: 48, lng: 68 },
  { name: 'Thailand', lat: 15, lng: 101 },
  { name: 'Vietnam', lat: 16, lng: 108 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Thunderdome() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [messages, setMessages] = useState<ThunderdomeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredMessage, setHoveredMessage] = useState<ThunderdomeMessage | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  /** Dispersed messages for points + rings (anti-clumping); stable for same input */
  const dispersedMessages = useMemo(
    () => jitterMessageCoords(messages),
    [messages]
  );

  // Responsive: resize globe to fit container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 800, height: 600 };
      setDimensions({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(el);
    setDimensions({ width: el.clientWidth || 800, height: el.clientHeight || 600 });
    return () => observer.disconnect();
  }, []);

  // Initial fetch + real-time subscription to messages table
  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    const fetchMessages = async () => {
      const { data, error } = await client
        .from('messages')
        .select('id, latitude, longitude, message_text, severity, telegram_url')
        .limit(500);

      if (!error && data?.length) {
        setMessages(
          data.map((row) => ({
            id: row.id,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            message_text: row.message_text ?? '',
            severity: (row.severity ?? 'low') as MessageSeverity,
            telegram_url: row.telegram_url ?? null,
          }))
        );
      }
      setLoading(false);
    };

    fetchMessages();

    const channel = client
      .channel('thunderdome-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  const msg = (d: object) => d as ThunderdomeMessage;

  const pointColor = useCallback((d: object) => SEVERITY_COLORS[msg(d).severity], []);
  const ringColor = useCallback((d: object) => SEVERITY_RING_GRADIENTS[msg(d).severity], []);
  const ringRepeatPeriod = useCallback((d: object) => SEVERITY_RING_PERIOD_MS[msg(d).severity], []);
  const ringMaxRadius = useCallback((d: object) => SEVERITY_RING_MAX_RADIUS[msg(d).severity], []);

  const handlePointHover = useCallback((point: object | null) => {
    setHoveredMessage(point ? (point as ThunderdomeMessage) : null);
    setTooltipPos((_) => ({ x: lastMouseRef.current.x, y: lastMouseRef.current.y }));
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      ref={containerRef}
      className="thunderdome-wrap"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredMessage(null)}
    >
      <Globe
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl={GLOBE_IMAGE_URL}
        showAtmosphere
        atmosphereColor="lightskyblue"
        atmosphereAltitude={0.12}
        backgroundColor="rgba(0,0,0,0)"
        showGraticules={false}
        // Points: markers at dispersed message locations (hover shows tooltip)
        pointsData={dispersedMessages}
        pointLat={(d) => msg(d).latitude}
        pointLng={(d) => msg(d).longitude}
        pointColor={pointColor}
        pointAltitude={0.1}
        pointRadius={0.5}
        pointResolution={12}
        pointLabel={(d) => msg(d).message_text}
        pointsMerge={false}
        onPointHover={handlePointHover}
        // Pulsating rings: same dispersed coords; severity = ringColor, ringMaxRadius, ringRepeatPeriod
        ringsData={dispersedMessages}
        ringLat={(d) => msg(d).latitude}
        ringLng={(d) => msg(d).longitude}
        ringColor={ringColor}
        ringAltitude={0.004}
        ringMaxRadius={ringMaxRadius}
        ringPropagationSpeed={3}
        ringRepeatPeriod={ringRepeatPeriod}
        ringResolution={48}
        // Country labels: centered on each country, medium size
        labelsData={COUNTRY_LABELS}
        labelLat={(d) => (d as { name: string; lat: number; lng: number }).lat}
        labelLng={(d) => (d as { name: string; lat: number; lng: number }).lng}
        labelText={(d) => (d as { name: string; lat: number; lng: number }).name}
        labelSize={1.1}
        labelColor={() => 'rgba(255, 255, 255, 0.92)'}
        labelAltitude={0.001}
        labelResolution={2}
        labelIncludeDot={false}
      />
      {/* Thunderdome overlay: Live Feed / Scanning label */}
      <div className="thunderdome-overlay" aria-hidden>
        <span className="thunderdome-overlay-dot" />
        <span className="thunderdome-overlay-text">
          {loading ? 'Scanning...' : 'Live Feed'}
        </span>
      </div>
      {/* HTML tooltip on hover over a signal (point/ring area) */}
      {hoveredMessage && (
        <div
          className="thunderdome-signal-tooltip"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 12,
          }}
          role="tooltip"
        >
          <div className="thunderdome-signal-tooltip-severity">{hoveredMessage.severity}</div>
          {hoveredMessage.telegram_url && (
            <a
              className="thunderdome-signal-tooltip-link"
              href={hoveredMessage.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Telegram
            </a>
          )}
          <div className="thunderdome-signal-tooltip-text">{hoveredMessage.message_text}</div>
        </div>
      )}
    </div>
  );
}
