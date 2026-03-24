const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Collect console messages
    const consoleMessages = [];
    page.on('console', msg => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    
    try {
        // Navigate to dashboard
        console.log('Navigating to dashboard...');
        await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' });
        
        // Check if page loaded successfully
        const title = await page.title();
        console.log('Page title:', title);
        
        // Check if language selector exists
        const languageSelector = await page.$('.language-selector');
        if (languageSelector) {
            console.log('✓ Language selector found');
        } else {
            console.log('✗ Language selector NOT found');
        }
        
        // Check initial state (should be Turkish)
        const currentLangText = await page.$eval('#currentLangText', el => el.textContent);
        console.log('Initial language:', currentLangText);
        
        // Check a panel title
        const marketTitle = await page.$eval('.panel#panel-market .panel-title span[data-i18n="panel_market"]', el => el.textContent);
        console.log('Panel market title:', marketTitle);
        
        // Click language button and select English
        console.log('\nChanging language to English...');
        await page.click('.language-btn');
        await page.waitForTimeout(300);
        
        // Click English option
        await page.click('.language-option[onclick*="en"]');
        await page.waitForTimeout(500);
        
        // Check if language changed
        const newLangText = await page.$eval('#currentLangText', el => el.textContent);
        console.log('After change:', newLangText);
        
        // Check panel title again
        const newMarketTitle = await page.$eval('.panel#panel-market .panel-title span[data-i18n="panel_market"]', el => el.textContent);
        console.log('New panel market title:', newMarketTitle);
        
        // Test if language actually changed
        if (newLangText === 'English' && newMarketTitle === 'Market Data') {
            console.log('\n✓✓✓ LANGUAGE SWITCHING WORKS! ✓✓✓');
        } else if (newLangText === 'English') {
            console.log('\n✓ Language button changed but panel title did NOT change');
        } else {
            console.log('\n✗ Language switching did NOT work');
        }
        
        // Check for console errors
        console.log('\n--- Console Errors ---');
        const errors = consoleMessages.filter(msg => msg.type === 'error');
        const jsErrors = errors.filter(e => !e.text.includes('CORS') && !e.text.includes('fetch'));
        
        if (jsErrors.length === 0) {
            console.log('✓ No JavaScript errors found');
        } else {
            console.log('✗ JavaScript errors found:');
            jsErrors.forEach(err => console.log('  -', err.text));
        }
        
    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
})();
