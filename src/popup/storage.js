// storage.js — chrome.storage.session helpers
export let _popupSessionMosaicConfig = null;

export function saveMosaicConfigToSession(cfg, cb) {
    try {
        if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.set) {
                // Сначала удаляем все ключи
                chrome.storage.session.get(null, (items) => {
                    const allKeys = Object.keys(items || {});
                    chrome.storage.session.remove(allKeys, () => {
                        chrome.storage.session.set({ mosaicConfig: cfg }, () => {
                            _popupSessionMosaicConfig = cfg;
                            if (cb) cb();
                        });
                    });
                });
        } else {
            _popupSessionMosaicConfig = cfg;
            if (cb) cb();
        }
    } catch (e) {
        _popupSessionMosaicConfig = cfg;
        if (cb) cb();
    }
}

export function getMosaicConfigFromSession(cb) {
    try {
        if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.get) {
            chrome.storage.session.get('mosaicConfig', (items) => {
                if (items && items.mosaicConfig) {
                    cb(items.mosaicConfig);
                } else {
                    cb(null);
                }
            });
        } else {
            cb(_popupSessionMosaicConfig || window.__mosaicConfig || null);
        }
    } catch (e) {
        cb(_popupSessionMosaicConfig || window.__mosaicConfig || null);
    }
}

export function saveImportedItemsToSession(items, cb) {
    try {
        if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.set) {
            chrome.storage.session.set({ mosaicImportedItems: items }, () => {
                if (cb) cb();
            });
        } else {
            window._popupImportedItems = items;
            if (cb) cb();
        }
    } catch (e) {
        window._popupImportedItems = items;
        if (cb) cb();
    }
}

export function getImportedItemsFromSession(collback) {
    try {
        if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.get) {
            chrome.storage.session.get('mosaicImportedItems', (items) => {
                if (items && items.mosaicImportedItems) collback(items.mosaicImportedItems); else collback(null);
            });
        } else {
            collback(window._popupImportedItems || null);
        }
    } catch (e) {
        collback(window._popupImportedItems || null);
    }
}
