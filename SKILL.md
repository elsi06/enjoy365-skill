---
name: enjoy365
description: Fetches the current daily deal (Tagesdeal) from enjoy365.ch with price, discount, image, and link.
metadata:
  {
    "openclaw":
      {
        "emoji": "🛍️",
        "requires":
          {
            "bins": ["node", "npm"],
          },
      },
  }
---

# enjoy365 Daily Deal Skill

Holt den aktuellen Tagesdeal von enjoy365.ch.

## Features

- Extrahieren des Produktnamens, Preises, Rabatts und der Verfügbarkeit.
- Zeigt das Produktbild und den Link zum Shop an.

## Usage

```bash
# Run manually
node src/index.js
```

## Requirements

- Node.js
- Puppeteer (installiert via `npm install`)
