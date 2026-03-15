/**
 * Monitor view: embedded YouTube live stream for a selected country.
 * Autoplays when opened; top bar links to the actual YouTube page.
 */
import './MonitorView.css';

export const MONITOR_COUNTRIES = ['iran', 'israel', 'ukraine'] as const;
export type MonitorCountry = (typeof MONITOR_COUNTRIES)[number];

const COUNTRY_LINKS: Record<MonitorCountry, { label: string; url: string; videoId: string }> = {
  iran: {
    label: 'Iran',
    url: 'https://www.youtube.com/watch?v=-zGuR1qVKrU',
    videoId: '-zGuR1qVKrU',
  },
  israel: {
    label: 'Israel',
    url: 'https://www.youtube.com/watch?v=gmtlJ_m2r5A',
    videoId: 'gmtlJ_m2r5A',
  },
  ukraine: {
    label: 'Ukraine',
    url: 'https://www.youtube.com/watch?v=e2gC37ILQmk',
    videoId: 'e2gC37ILQmk',
  },
};

interface MonitorViewProps {
  country: MonitorCountry;
}

export function MonitorView({ country }: MonitorViewProps) {
  const { label, url, videoId } = COUNTRY_LINKS[country];
  const embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1`;

  return (
    <div className="monitor-view">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="monitor-view-top-link"
        aria-label={`Watch ${label} live on YouTube`}
      >
        <span className="monitor-view-top-link-text">Watch on YouTube · {label}</span>
        <span className="monitor-view-top-link-icon" aria-hidden>↗</span>
      </a>
      <div className="monitor-view-embed-wrap">
        <iframe
          className="monitor-view-iframe"
          src={embedSrc}
          title={`${label} live`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
}
