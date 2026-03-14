# Betterview Terminal

A data-driven terminal-style UI for the **Betterview** brand: dark mode, high-tech risk-monitoring aesthetic with a revolving dome, live-style status bar, and feed panel.

## Run locally

From the `betterview` repo (same folder as the Telegram scraper):

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
npm run preview
```

## Logo

- **Wordmark**: "Betterview" is rendered from the inline SVG in the repo.
- **Icon**: Place your heart-with-eye logo at `public/logo.png`. If the file is missing, a fallback SVG icon is shown.

## Layout

- **Header**: Logo + wordmark, TERMINAL | FEED | MONITOR nav, search, wallet button, active signals and last update.
- **Status bar**: LIVE indicator, incident snippets, global risk level.
- **Main**: Left filter panel (Critical, High, Low, Data Source: Telegram), center revolving abstract dome with data points and labels, right feed with simulated Telegram-style alerts.

Theme uses a dark blue/purple palette, scan-line overlay, and corner data-stream text for a terminal look.
