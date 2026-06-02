// request.js — request globals from active tab
export function requestGlobalsFromTab(timeout = 5000) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) return reject(new Error('Нет активной вкладке'));
            const tabId = tabs[0].id;
            let timer = null;
            const onMessage = (msg) => {
                if (msg && msg.action === 'mosaicGlobalsAvailable' && msg.config) {
                    chrome.runtime.onMessage.removeListener(onMessage);
                    clearTimeout(timer);
                    resolve(msg.config);
                }
            };
            chrome.runtime.onMessage.addListener(onMessage);

            timer = setTimeout(() => {
                chrome.runtime.onMessage.removeListener(onMessage);
                resolve(null);
            }, timeout);

            chrome.tabs.sendMessage(tabId, { action: 'requestGlobals' }, (resp) => {
                if (chrome.runtime.lastError) {
                    chrome.runtime.onMessage.removeListener(onMessage);
                    clearTimeout(timer);
                    reject(new Error(chrome.runtime.lastError.message));
                }
            });
        });
    });
}

/**
 * Request globals from active tab with retries
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} timeout - Timeout for each attempt in ms
 * @returns {Promise}
 */
export function requestGlobalsFromTabWithRetries(maxRetries = 3, timeout = 5000) {
    return new Promise(async (resolve) => {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await requestGlobalsFromTab(timeout);
                if (result) {
                    resolve(result);
                    return;
                }
            } catch (e) {
                console.warn(`Attempt ${i + 1} failed:`, e.message);
            }
            // Wait before retrying
            if (i < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
        resolve(null);
    });
}
