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
        
        // Check if language button exists
        const languageBtn = await page.$('.language-btn');
        if (languageBtn) {
            console.log('✓ Language button found');
        } else {
            console.log('✗ Language button NOT found');
        }
        
        // Check if dropdown exists
        const dropdown = await page.$('.language-dropdown');
        if (dropdown) {
            console.log('✓ Language dropdown found');
        } else {
            console.log('✗ Language dropdown NOT found');
        }
        
        // Test clicking the language button
        console.log('Testing language selector click...');
        await languageBtn.click();
        await page.waitForTimeout(500);
        
        // Check if dropdown becomes active
        const dropdownActive = await page.$('.language-dropdown.active');
        if (dropdownActive) {
            console.log('✓ Dropdown opens correctly');
        } else {
            console.log('✗ Dropdown does NOT open');
        }
        
        // Check for console errors
        console.log('\n--- Console Messages ---');
        const errors = consoleMessages.filter(msg => msg.type === 'error');
        if (errors.length === 0) {
            console.log('✓ No console errors found');
        } else {
            console.log('✗ Console errors found:');
            errors.forEach(err => console.log('  -', err.text));
        }
        
        console.log('\n--- Test Complete ---');
        
    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
})();
