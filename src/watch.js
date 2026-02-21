const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const WATCHLIST_PATH = path.join(__dirname, '..', 'watchlist.json');

function loadQueries() {
  try {
    const raw = fs.readFileSync(WATCHLIST_PATH, 'utf8');
    const json = JSON.parse(raw);
    return Array.isArray(json.queries)
      ? json.queries.map(q => String(q).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function normalizePrice(raw) {
  if (!raw) return null;
  const m = String(raw).replace(/\s+/g, ' ').match(/([0-9]{1,4}(?:[.,][0-9]{1,2})?)/);
  return m ? m[1].replace(',', '.') : null;
}

(async () => {
  const queries = loadQueries();
  if (!queries.length) {
    console.log('Keine Watchlist-Queries gefunden (watchlist.json).');
    process.exit(0);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    const allResults = [];

    for (const query of queries) {
      const url = `https://enjoy365.ch/search?search=${encodeURIComponent(query)}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      const items = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.product-box'));

        return cards.map(card => {
          const titleEl =
            card.querySelector('.swic-cms-product-manufacturer-deal-name') ||
            card.querySelector('.product-name') ||
            card.querySelector('a[title]') ||
            card.querySelector('a');

          const manufacturerEl = card.querySelector('.swic-cms-product-manufacturer-deal');
          const manufacturer = manufacturerEl ? manufacturerEl.textContent.trim() : '';
          const title = titleEl ? titleEl.textContent.trim() : '';
          const fullTitle = manufacturer ? `${manufacturer} ${title}`.trim() : title;

          const priceEl =
            card.querySelector('.swic-price-deal') ||
            card.querySelector('.price') ||
            card.querySelector('[class*="price"]');

          const oldPriceEl =
            card.querySelector('.swic-discount-price-deal') ||
            card.querySelector('[class*="discount-price"]');

          const discountEl =
            card.querySelector('.discount-circle-default .circle-content') ||
            card.querySelector('[class*="discount"]');

          const imgEl = card.querySelector('img');
          const linkEl = card.querySelector('a[href*="/A"]') || card.querySelector('a');

          return {
            title: fullTitle || null,
            priceRaw: priceEl ? priceEl.textContent.trim() : null,
            oldPriceRaw: oldPriceEl ? oldPriceEl.textContent.trim() : null,
            discount: discountEl ? discountEl.textContent.trim() : null,
            image: imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null,
            link: linkEl ? linkEl.href : null
          };
        }).filter(x => x.title && x.link);
      });

      allResults.push({ query, url, items });
    }

    const found = allResults.filter(r => r.items.length > 0);
    const notFound = allResults.filter(r => r.items.length === 0).map(r => r.query);

    if (!found.length) {
      console.log(`Keine Treffer für Watchlist: ${queries.join(', ')}`);
      return;
    }

    console.log('🔎 Enjoy365 Watchlist Treffer:\n');

    for (const result of found) {
      console.log(`• Query: ${result.query}`);
      const top = result.items.slice(0, 5);
      for (const item of top) {
        const price = normalizePrice(item.priceRaw) || 'N/A';
        const oldPrice = normalizePrice(item.oldPriceRaw);
        const priceText = oldPrice ? `CHF ${price} (statt CHF ${oldPrice})` : `CHF ${price}`;

        console.log(`  - ${item.title}`);
        console.log(`    Preis: ${priceText}`);
        if (item.discount) console.log(`    Rabatt: ${item.discount}`);
        console.log(`    Link: ${item.link}`);
        if (item.image) console.log(`    Bild: ${item.image}`);
      }
      if (result.items.length > 5) {
        console.log(`    … +${result.items.length - 5} weitere Treffer`);
      }
      console.log('');
    }

    if (notFound.length) {
      console.log(`Keine Treffer für: ${notFound.join(', ')}`);
    }
  } catch (error) {
    console.error('Fehler beim Watchlist-Check:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
