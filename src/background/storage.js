// Конфигурация будет предоставлена content-скриптом и сохранена в сессионном хранилище
// (`chrome.storage.session`) под ключом 'mosaicConfig'. background.js будет считывать её при необходимости.
let _sessionMosaicConfig = null;
/**
 * Сохраняет конфигурацию Mosaic в session storage
 * @param {object} cfg - Конфигурация
 * @param {function} callback - Функция обратного вызова
 */
export function saveMosaicConfigToSession(cfg, callback) {
	if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session && chrome.storage.session.set) {
		// Сначала удаляем все ключи
		chrome.storage.session.get(null, (items) => {
			const allKeys = Object.keys(items || {});
			chrome.storage.session.remove(allKeys, () => {
				const obj = { mosaicConfig: cfg };
				console.log('[background] saving mosaicConfig to session storage (after clearing all keys)');
				chrome.storage.session.set(obj, () => {
					console.log('[background] mosaicConfig saved to session');
					if (callback) callback();
				});
			});
		});
	} else {
		console.log('[background] session storage unavailable — clearing all in-memory keys');
		if (_sessionMosaicConfig && typeof _sessionMosaicConfig === 'object') {
			Object.keys(_sessionMosaicConfig).forEach(k => delete _sessionMosaicConfig[k]);
		}
		_sessionMosaicConfig = cfg;
		if (callback) callback();
	}
}


/**
 * Получает конфигурацию Mosaic из session storage
 * @param {function} callback - Функция обратного вызова с конфигурацией
 */
export function getMosaicConfigFromSession(callback) {
	if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session && chrome.storage.session.get) {
		console.log('[background] reading mosaicConfig from session storage');
		chrome.storage.session.get('mosaicConfig', (items) => {
			if (items && items.mosaicConfig) {
				console.log('[background] mosaicConfig found in session');
				callback(items.mosaicConfig);
			} else {
				console.log('[background] no mosaicConfig in session');
				callback(null);
			}
		});
	} else {
		console.log('[background] session storage unavailable — reading mosaicConfig from memory');
		callback(_sessionMosaicConfig);
	}
}