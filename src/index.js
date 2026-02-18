const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        // Navigate to Top Deals
        await page.goto('https://enjoy365.ch/top-deals/', { waitUntil: 'networkidle2', timeout: 60000 });

        const deal = await page.evaluate(() => {
            // Find the deal container (usually the first product card with a countdown or just the first one)
            // The structure observed: .card-body containing the deal info
            const container = document.querySelector('.card-body');

            if (!container) return null;

            // Title & Manufacturer
            const manufacturer = container.querySelector('.swic-cms-product-manufacturer-deal')?.innerText.trim() || '';
            const productName = container.querySelector('.swic-cms-product-manufacturer-deal-name')?.innerText.trim() || '';
            const title = manufacturer ? `${manufacturer} ${productName}` : productName;

            // Prices
            const price = container.querySelector('.swic-price-deal')?.innerText.trim().replace(/\n/g, '') || 'N/A';
            const oldPriceText = container.querySelector('.swic-discount-price-deal')?.innerText.trim().replace(/\n/g, ' ') || '';
            // Extract number from "Marktpreis 198.00"
            const oldPriceMatch = oldPriceText.match(/[\d.]+/);
            const oldPrice = oldPriceMatch ? oldPriceMatch[0] : oldPriceText;

            // Discount
            const discount = container.querySelector('.discount-circle-default .circle-content')?.innerText.trim() || '';

            // Image
            // The image might be lazy loaded, so we look for data-src or src
            const imgEl = document.querySelector('.product-image-wrapper img');
            const image = imgEl ? (imgEl.getAttribute('data-src') || imgEl.src) : null;

            // Link
            const linkEl = container.querySelector('a') || document.querySelector('.product-image-wrapper a');
            const link = linkEl ? linkEl.href : null;

            // Availability / Status
            const countdown = document.querySelector('.swic-deal-countdown');
            const isLive = !!countdown;
            
            // Check availability text
            const availText = container.querySelector('.swic-deal-percent-text')?.innerText.trim() || '';

            return {
                title,
                price,
                oldPrice,
                discount,
                image,
                link,
                isLive,
                availText
            };
        });

        if (!deal) {
            console.log('Kein Tagesdeal gefunden.');
            return;
        }

        // Output format for OpenClaw
        console.log(`🔥 **Tagesdeal: ${deal.title}**\n`);
        console.log(`💰 **CHF ${deal.price}** (statt CHF ${deal.oldPrice})`);
        if (deal.discount) console.log(`📉 Rabatt: ${deal.discount}`);
        if (deal.availText) console.log(`📊 Status: ${deal.availText}`);
        console.log('\n');
        if (deal.image) console.log(`[Bild](${deal.image})`);
        if (deal.link) console.log(`\n👉 [Zum Deal](${deal.link})`);

    } catch (error) {
        console.error('Fehler beim Abrufen des Deals:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
