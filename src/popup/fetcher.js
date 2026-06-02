// fetcher.js — send fetch and create requests via background
export function sendFetch(cfg, isTest, onResult, setStatus) {
    if (setStatus) setStatus(isTest ? 'Отправляю тестовый запрос...' : 'Отправляю запрос...');

    chrome.runtime.sendMessage({ action: 'fetchMosaicList', config: cfg }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[popup] runtime error', chrome.runtime.lastError.message);
            if (setStatus) setStatus('Ошибка: ' + chrome.runtime.lastError.message);
            if (onResult) onResult({ error: chrome.runtime.lastError.message });
            return;
        }

        if (response && response.error) {
            if (setStatus) setStatus('Ошибка: ' + response.error);
            if (onResult) onResult(response);
        } else {
            if (setStatus) setStatus((response && response.fromCache) ? 'Данные из кэша' : 'Успешно — смотрите консоль и результат ниже');
            if (onResult) onResult(response);
            if (response && response.cOrder) console.log('[popup] cOrder:', response.cOrder);
        }
    });
}

export function createMosaicItem(cfg, collectionId, itemData, callback, setStatus) {
    if (setStatus) setStatus('Создаю запись в коллекции...');
    chrome.runtime.sendMessage({ action: 'createMosaicItem', config: cfg, collectionId, itemData }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[popup] create item runtime error', chrome.runtime.lastError.message);
            if (setStatus) setStatus('Ошибка: ' + chrome.runtime.lastError.message);
            if (callback) callback({ error: chrome.runtime.lastError.message });
            return;
        }
        if (callback) callback(response);
    });
}

export function clearMosaicCache(callback, setStatus) {
    if (setStatus) setStatus('Очищаю кэш...');
    chrome.runtime.sendMessage({ action: 'clearMosaicCache', keys: {} }, (resp) => {
        if (chrome.runtime.lastError) {
            console.warn('[popup] clear cache runtime error', chrome.runtime.lastError.message);
            if (setStatus) setStatus('Ошибка: ' + chrome.runtime.lastError.message);
            if (callback) callback({ error: chrome.runtime.lastError.message });
            return;
        }
        if (setStatus) setStatus('Кэш очищен: ' + (resp && resp.cleared ? resp.cleared : 0));
        if (callback) callback(resp);
    });
}
