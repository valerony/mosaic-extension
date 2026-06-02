// content_proxy.js
// Injects a small script into the page to read globals and posts them back to the extension
(function () {
    // Listen for results from the page (window.postMessage)
    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'MOSAIC_GLOBALS') return;
        const payload = event.data.payload || {};

        // Save config so popup/background can use it — prefer session storage to avoid cross-site persistence
        try {
            if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.set) {
                chrome.storage.session.set({ mosaicConfig: payload }, () => {
                    console.log('[content_proxy] mosaicConfig saved to session storage', payload);
                    chrome.runtime.sendMessage({ action: 'mosaicGlobalsAvailable', config: payload }, () => {});
                });
            } else {
                // Fallback: keep in-memory for this content script run and notify extension
                try {
                    window.__mosaicConfig = payload;
                } catch (e) {}
                console.log('[content_proxy] session storage unavailable, saved to in-memory', payload);
                chrome.runtime.sendMessage({ action: 'mosaicGlobalsAvailable', config: payload }, () => {});
            }
        } catch (e) {
            console.warn('[content_proxy] storage/save failed', e && e.message ? e.message : e);
        }
    });

    // Handle request from popup to re-request globals from page
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.action === 'requestGlobals') {
            // Ask injected page script to post globals again
            window.postMessage({
                type: 'MOSAIC_REQUEST'
            }, '*');
            sendResponse({
                requested: true
            });
        }
    });

    // Inject a script into the page context to read page globals (accessible only in page context)
    // Inlined version removed — using `injected_page.js` (web_accessible_resources) instead
    const script = document.createElement('script');
    // Use external script (web_accessible_resources) to avoid CSP blocking of inline scripts
    script.src = chrome.runtime.getURL('injected_page.js');
    script.onload = function() { 
        // Ask the injected page to post globals once it has loaded
        window.postMessage({ type: 'MOSAIC_REQUEST' }, '*');
        // Retry a couple times in case of timing issues
        setTimeout(() => window.postMessage({ type: 'MOSAIC_REQUEST' }, '*'), 250);
        setTimeout(() => window.postMessage({ type: 'MOSAIC_REQUEST' }, '*'), 750);
        this.remove(); 
    };

    (document.head || document.documentElement).appendChild(script);

    // Also send an immediate request in case the injected script is already available
    try {
        window.postMessage({ type: 'MOSAIC_REQUEST' }, '*');
    } catch (e) {}
})();