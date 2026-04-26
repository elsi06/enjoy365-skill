---
name: enjoy365
description: Fetches deals and tracks all products from enjoy365.ch. Supports daily deal, watchlist, full shop scraping, and product change detection.
metadata:
  openclaw:
    emoji: "🛍️"
    requires:
      bins: ["node", "npm"]
---

# enjoy365 Skill

Schweizer Plattform [enjoy365.ch](https://enjoy365.ch) — Deals und Produkt-Tracking.

## Scripts

| Script | Zweck |
|--------|-------|
| `src/index.js` | Holt den aktuellen Top-Deal (Tagesdeal) |
| `src/watch.js` | Watchlist-Suche (gezielte Queries aus `watchlist.json`) |
| `src/scrape-all.js` | Voll-Scraper: Alle Produkte erfassen, Diff gegen `products.json`, Änderungen melden |

## Produkt-DB (`products.json`)

- Enthält alle jemals erfassten Produkte mit Preis, altem Preis, Rabatt, Link, Bild
- Jeder Lauf von `scrape-all.js` vergleicht gegen die DB und meldet:
  - 🆕 Neue Produkte
  - 💰 Preisänderungen
  - ❌ Entfernte Produkte
- `firstSeen` / `lastSeen` Datums-Timestamps pro Produkt

## Cron-Job

Täglicher Diff-Lauf:
```bash
node src/scrape-all.js
```

Wird über OpenClaw Cron oder Heartbeat getriggert. Bei Änderungen → Telegram-Benachrichtigung.

## Installation

```bash
cd skills/enjoy365-skill
npm install
```

## Nutzung

```bash
# Tagesdeal
node src/index.js

# Watchlist-Check
node src/watch.js

# Voll-Scraper (initial + täglich)
node src/scrape-all.js
```