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

Dieser Skill ruft den aktuellen "Top Deal" (Tagesdeal) von der Schweizer Plattform [enjoy365.ch](https://enjoy365.ch/top-deals/) ab.

## Features

- **Automatisierte Extraktion:** Holt Produktname, aktueller Preis, Marktpreis und Rabatt.
- **Visualisierung:** Extrahiert das Produktbild und stellt einen direkten Link zum Deal bereit.
- **Status-Check:** Prüft die Verfügbarkeit des Deals.

## Installation

Der Skill benötigt Node.js und Puppeteer.

```bash
cd skills/enjoy365
npm install
```

## Nutzung

Der Skill kann direkt über Node.js ausgeführt werden:

```bash
node src/index.js
```

In OpenClaw kann der Skill durch das Aufrufen des Tools oder die entsprechende Anfrage an den Agenten genutzt werden.

## Lizenz

Dieser Skill ist unter der [MIT License](LICENSE) veröffentlicht.
