const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'products.json');
const GONE_THRESHOLD = 3; // Mark as truly gone after this many consecutive misses

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { products: {}, lastScrape: null };
  }
}

function saveDB(db) {
  db.lastScrape = new Date().toISOString();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function normalizePrice(raw) {
  if (!raw) return null;
  const m = String(raw).replace(/\s+/g, ' ').match(/([0-9]{1,4}(?:[.,][0-9]{1,2})?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

/**
 * Extract a stable product ID from the URL.
 * enjoy365 URLs look like: /product-name/A103144001-5395 or /product-name/A103144001
 * We use the slug+ID portion (everything after the last /) as the key.
 */
function makeProductKey(link) {
  if (!link) return null;
  try {
    const url = new URL(link, 'https://enjoy365.ch');
    const parts = url.pathname.replace(/\/$/, '').split('/');
    const slug = parts[parts.length - 1]; // e.g. "A103144001-5395" or "balance-board-ergo-active-A103144001-5395"
    // Extract the product code (starts with A followed by digits)
    const codeMatch = slug.match(/(A\d{6,}(?:-\d+)?)/);
    if (codeMatch) return codeMatch[1];
    // Fallback: use the whole slug as key
    return slug;
  } catch {
    return link.split('?')[0].split('/').pop();
  }
}

// Scrape sources: top-deals page + paginated search (covers all products across categories)
const SCRAPE_SOURCES = [
  { url: 'https://enjoy365.ch/top-deals/', paginated: false },
  { url: 'https://enjoy365.ch/search?search=*&p={page}', paginated: true },
];

async function dismissCookies(page) {
  try {
    await page.evaluate(() => {
      // Try common cookie consent buttons
      const selectors = [
        '.cookie-permission-accept',
        '.cookie-permission-decline',
        '[class*="cookie"] button',
        'button[title*="Cookie"]',
        'button[title*="cookie"]',
        '#cookie-accept',
        '.cc-btn',
        '.cc-dismiss',
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn) { btn.click(); return; }
      }
    });
    await new Promise(r => setTimeout(r, 500));
  } catch {}
}

async function scrapePage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await dismissCookies(page);
  } catch (e) {
    console.error(`  ⚠️ Failed to load ${url}: ${e.message}`);
    return [];
  }

  return await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.product-box'));
    if (!cards.length) return [];

    return cards.map(card => {
      const titleEl =
        card.querySelector('.swic-cms-product-manufacturer-deal-name') ||
        card.querySelector('.product-name') ||
        card.querySelector('a[title]');
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
      const linkEl = card.querySelector('a[href*="/A"]') || card.querySelector('a[href]');

      const isZusatzversichert = !!card.querySelector('[class*="zusatz"], [class*="insurance"]') ||
        card.textContent.includes('ZUSATZVERSICHERTE');

      return {
        title: fullTitle || null,
        priceRaw: priceEl ? priceEl.textContent.trim() : null,
        oldPriceRaw: oldPriceEl ? oldPriceEl.textContent.trim() : null,
        discount: discountEl ? discountEl.textContent.trim() : null,
        image: imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null,
        link: linkEl ? linkEl.href : null,
        isZusatzversichert
      };
    }).filter(x => x.title && x.link);
  });
}

async function scrapeAllPages(page, urlTemplate) {
  let allItems = [];
  let pageNum = 1;

  while (true) {
    const url = urlTemplate.replace('{page}', pageNum);
    console.error(`  Scraping ${url}...`);
    const items = await scrapePage(page, url);

    if (!items.length) {
      console.error(`  No products found, stopping pagination.`);
      break;
    }

    allItems = allItems.concat(items);
    console.error(`  Found ${items.length} products (total: ${allItems.length})`);

    if (items.length < 12) break; // very few results = likely last page
    pageNum++;
    await new Promise(r => setTimeout(r, 800));
  }

  return allItems;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    // Scrape all sources, deduplicate by product key
    const seen = new Set();
    const allProducts = [];

    for (const source of SCRAPE_SOURCES) {
      console.error(`📂 Scraping source: ${source.url}`);
      let items;

      if (source.paginated) {
        items = await scrapeAllPages(page, source.url);
      } else {
        items = await scrapePage(page, source.url.replace('{page}', '1'));
      }

      let newCount = 0;
      for (const item of items) {
        const key = makeProductKey(item.link);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        allProducts.push(item);
        newCount++;
      }
      console.error(`  → ${newCount} new unique products from this source`);
    }

    console.error(`\nTotal unique products scraped: ${allProducts.length}`);

    // Load existing DB and compute diff
    const db = loadDB();
    const newProducts = [];
    const priceChanges = [];
    const foundKeys = new Set();

    for (const item of allProducts) {
      const key = makeProductKey(item.link);
      if (!key) continue;
      foundKeys.add(key);

      const price = normalizePrice(item.priceRaw);
      const oldPrice = normalizePrice(item.oldPriceRaw);
      const existing = db.products[key];

      if (!existing) {
        // New product
        newProducts.push({
          key,
          title: item.title,
          price,
          oldPrice,
          discount: item.discount,
          image: item.image,
          link: item.link,
          isZusatzversichert: item.isZusatzversichert,
          firstSeen: new Date().toISOString()
        });

        db.products[key] = {
          title: item.title,
          price,
          oldPrice,
          discount: item.discount,
          image: item.image,
          link: item.link,
          isZusatzversichert: item.isZusatzversichert,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          missedCount: 0
        };
      } else {
        // Existing product — check for changes
        existing.lastSeen = new Date().toISOString();
        existing.missedCount = 0; // found again
        existing.removed = false; // no longer removed

        // Track URL changes (category moves)
        if (item.link !== existing.link) {
          existing.link = item.link;
        }

        if (existing.price !== price) {
          priceChanges.push({
            key,
            title: item.title,
            oldPrice: existing.price,
            newPrice: price,
            link: item.link
          });
        }

        existing.price = price;
        existing.oldPrice = oldPrice;
        existing.discount = item.discount;
        if (item.image) existing.image = item.image;
      }
    }

    // Mark products not found in this scrape
    let goneCount = 0;
    let trulyRemovedCount = 0;
    for (const key of Object.keys(db.products)) {
      if (foundKeys.has(key)) continue;

      const prod = db.products[key];
      prod.missedCount = (prod.missedCount || 0) + 1;

      if (prod.missedCount >= GONE_THRESHOLD && !prod.removed) {
        prod.removed = true;
        prod.removedDate = new Date().toISOString();
        trulyRemovedCount++;
      }
      goneCount++;
    }

    saveDB(db);

    // Output for OpenClaw
    if (newProducts.length === 0 && priceChanges.length === 0 && trulyRemovedCount === 0 && goneCount === 0) {
      console.log('✅ Enjoy365: Keine Änderungen. Alle ' + allProducts.length + ' Produkte aktuell.');
    } else {
      if (newProducts.length > 0) {
        console.log(`🆕 **${newProducts.length} neue Produkte auf enjoy365.ch:**\n`);
        for (const p of newProducts) {
          const priceText = p.oldPrice ? `CHF ${p.price} (statt CHF ${p.oldPrice})` : `CHF ${p.price}`;
          console.log(`• **${p.title}**`);
          console.log(`  ${priceText}`);
          if (p.discount) console.log(`  Rabatt: ${p.discount}`);
          console.log(`  👉 ${p.link}`);
          if (p.image) console.log(`  [Bild](${p.image})`);
          console.log('');
        }
      }

      if (priceChanges.length > 0) {
        console.log(`💰 **${priceChanges.length} Preisänderungen:**\n`);
        for (const p of priceChanges) {
          const direction = p.newPrice < p.oldPrice ? '📉' : '📈';
          console.log(`• ${direction} **${p.title}**`);
          console.log(`  CHF ${p.oldPrice} → CHF ${p.newPrice}`);
          console.log(`  👉 ${p.link}`);
          console.log('');
        }
      }

      if (trulyRemovedCount > 0) {
        console.log(`❌ ${trulyRemovedCount} Produkt(e) endgültig entfernt (nach ${GONE_THRESHOLD} Scapes nicht gefunden).`);
      }

      // Info about temporarily missing products
      const tempMissing = goneCount - trulyRemovedCount;
      if (tempMissing > 0) {
        console.log(`⏳ ${tempMissing} Produkt(e) temporär nicht gefunden (werden weiter beobachtet).`);
      }
    }

    console.log(`\n📊 DB: ${Object.keys(db.products).length} Produkte gesamt | ${allProducts.length} im Shop gefunden`);

  } catch (error) {
    console.error('Fehler beim Scraping:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();