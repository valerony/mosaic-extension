// background.js (Service Worker)

import {
    generateUUID
} from './utils.js';

import {
    handleCreateMosaicItem
} from './requestHandler.js';

import {
    saveMosaicConfigToSession,
    getMosaicConfigFromSession

} from './storage.js';



// Очищать кэш и открывать popup при клике на иконку расширения
if (chrome && chrome.action && chrome.action.onClicked) {
	chrome.action.onClicked.addListener((tab) => {
		console.log('[background] Кэш полностью очищен по клику на иконку');
		// Очистить весь кэш
		/*
		if (chrome.storage && chrome.storage.session && chrome.storage.session.get) {
			chrome.storage.session.get(null, (items) => {
				const allKeys = Object.keys(items || {});
				chrome.storage.session.remove(allKeys, () => {
					console.log('[background] Кэш полностью очищен по клику на иконку');
					// Открыть popup (имитируем клик, если popup не откроется автоматически)
					// Обычно default_popup открывается сам, но на всякий случай:
					if (tab && tab.id) {
						chrome.scripting.executeScript({
							target: { tabId: tab.id },
							func: () => {
								window.open(chrome.runtime.getURL('popup.html'), '_blank');
							}
						});
					}
				});
			});
		}
		*/
	});
}

// Helper: clear all mosaicCache_ keys from session storage (or in-memory fallback)
function clearAllMosaicCacheSession(cb) {
	try {
		if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.get) {
			chrome.storage.session.get(null, (items) => {
				const allKeys = Object.keys(items || {});
				const toRemove = allKeys.filter(k => k.startsWith('mosaicCache_'));
				if (toRemove.length === 0) {
					console.log('[background] clearAllMosaicCacheSession: nothing to remove');
					// still remove mosaicConfig if present
					chrome.storage.session.remove('mosaicConfig', () => {
						console.log('[background] clearAllMosaicCacheSession: mosaicConfig removed (if existed)');
						_sessionMosaicConfig = null;
						if (cb) cb(0);
					});
					return;
				}
				chrome.storage.session.remove(toRemove, () => {
					console.log('[background] clearAllMosaicCacheSession removed keys:', toRemove);
					// remove mosaicConfig as well to avoid cross-site reuse
					chrome.storage.session.remove('mosaicConfig', () => {
						console.log('[background] clearAllMosaicCacheSession: mosaicConfig removed (if existed)');
						_sessionMosaicConfig = null;
						if (cb) cb(toRemove.length);
					});
				});
			});
		} else {
			// in-memory fallback
			try {
				const allKeys = Object.keys(_sessionMosaicConfig || {});
				const toRemove = allKeys.filter(k => k.startsWith('mosaicCache_'));
				toRemove.forEach(k => delete _sessionMosaicConfig[k]);
				console.log('[background] clearAllMosaicCacheSession removed keys from memory:', toRemove);
				// clear mosaicConfig stored in-memory as well
				_sessionMosaicConfig = null;
				if (cb) cb(toRemove.length);
			} catch (e) {
				console.warn('[background] clearAllMosaicCacheSession failed (memory):', e && e.message ? e.message : e);
				if (cb) cb(0);
			}
		}
	} catch (e) {
		console.warn('[background] clearAllMosaicCacheSession error:', e && e.message ? e.message : e);
		if (cb) cb(0);
	}
}



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'fetchMosaicList') {
		// Ensure mosaic cache is cleared when fetch is requested
		const handleFetchRequest = () => {
			const proceedWithConfig = (cfg) => {
			console.log('[background] proceedWithConfig called, cfg present?', !!cfg);

			// Требуем необходимые поля из конфигурации (удалён хардкод)
			if (!cfg || !cfg.site_root_url || !cfg.VER_ID || !cfg.access) {
				console.error('[background] Missing required config fields: site_root_url, VER_ID, access', cfg);
				sendResponse({ error: 'Missing required config fields: site_root_url, VER_ID, access' });
				return;
			}
			const site_root_url = cfg.site_root_url.replace(/\/$/, '');
			const VER_ID = String(cfg.VER_ID);
			const extractedAccessValue = String(cfg.access);
			const baseUrl = `${site_root_url}/-/x-api/v1/protected/`;
			const newRequestId = generateUUID();

			const cacheKey = `mosaicCache_${VER_ID}_${extractedAccessValue}`;

			const buildAndFetch = () => {
				// Формируем параметры запроса
				const queryParams = new URLSearchParams({
					method: 'mosaic/collection/list',
					ver_id: VER_ID,
					access: extractedAccessValue,
					'param[add_item_count]': true,
					request_id: newRequestId,
				});

				const requestUrl = `${baseUrl}?${queryParams.toString()}`;
				console.log('[background] request URL:', requestUrl);

				const headers = {
					'Accept': '*/*',
					'Accept-Encoding': 'gzip, deflate',
					'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,uz;q=0.6',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
					'Content-Type': 'application/json',
					'DNT': '1',
					'Pragma': 'no-cache',
					'User-Agent': (navigator && navigator.userAgent ? navigator.userAgent : ''),
					'X-Requested-With': 'XMLHttpRequest',
				};

				console.log('[background] starting fetch with headers', {
					userAgent: headers['User-Agent']
				});

				fetch(requestUrl, {
					method: 'GET',
					headers: headers,
					credentials: 'include'
				})
				.then(async response => {
					console.log('[background] fetch returned status', response.status);
					if (!response.ok) {
						throw new Error(`HTTP error! Status: ${response.status}`);
					}
					const data = await response.json();
					console.log('[background] full response data:', data);
				
					
				if (data && data.result) {
					const payload = {
						result: data.result,
						cachedAt: Date.now()
					};
					// Сохраняем в кэш (session storage)
					const toSave = {};
					toSave[cacheKey] = payload;
					if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.set) {
						chrome.storage.session.set(toSave, () => {
							console.log('[background] Cached response saved under', cacheKey);
							sendResponse(payload);
						});
					} else {
						// Fallback: use in-memory cache
						try {
							_sessionMosaicConfig = _sessionMosaicConfig || {};
							_sessionMosaicConfig[cacheKey] = payload;
						} catch (e) {}
						console.log('[background] Cached response saved in-memory under', cacheKey);
						sendResponse(payload);
					}
				} else {
					console.warn('[background] Unexpected response format', data);
					sendResponse({ error: 'Unexpected response format: missing result' });
					}
				})
				.catch(error => {
					console.error('[background] Ошибка при выполнении запроса в Service Worker:', error);
					sendResponse({ error: error.message });
				});
			};

			// Если не принудительное обновление — пытаемся вернуть из кэша
			if (!cfg || !cfg.force) {
				if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.get) {
					console.log('[background] checking cache in session storage for', cacheKey);
					chrome.storage.session.get(cacheKey, (items) => {
						if (items && items[cacheKey]) {
							console.log('[background] Returning cached data for', cacheKey, '(from session)');
							// Отправляем кэшированное содержание
							sendResponse(Object.assign({}, items[cacheKey], { fromCache: true }));
						} else {
							console.log('[background] No cached data in session for', cacheKey);
							// Кэша нет — делаем реальный запрос
							buildAndFetch();
						}
					});
				} else {
					// Fallback: check in-memory
					try {
						if (_sessionMosaicConfig && _sessionMosaicConfig[cacheKey]) {
							console.log('[background] Returning cached data from memory for', cacheKey, '(in-memory)');
							sendResponse(Object.assign({}, _sessionMosaicConfig[cacheKey], { fromCache: true }));
						} else {
							buildAndFetch();
						}
					} catch (e) {
						buildAndFetch();
					}
				}
			} else {
				// Принудительное обновление — делаем реальный запрос
				console.log('[background] Force refresh requested, fetching new data');
				buildAndFetch();
			}
		};

			// If config came with the message, save it to session and use it. Otherwise read from session.
			if (request.config) {
				console.log('[background] received config in message — saving to session storage');
				saveMosaicConfigToSession(request.config);
				proceedWithConfig(request.config);
			} else {
				getMosaicConfigFromSession((cfg) => {
					proceedWithConfig(cfg);
				});
			}
		};

		console.log('[background] fetchMosaicList invoked — clearing mosaic cache before proceeding');
		clearAllMosaicCacheSession(() => {
			handleFetchRequest();
		});

		// Важно: вернуть true, чтобы sendResponse работал асинхронно
		return true;
	} else if (request.action === 'createMosaicItem') {
		return handleCreateMosaicItem(request, sendResponse);
	} else if (request.action === 'clearMosaicCache') {
		const keys = request.keys || {};
		const VER_ID = keys.VER_ID && String(keys.VER_ID).trim();
		const access = keys.access && String(keys.access).trim();

		// Если передали точный VER_ID и access — удаляем конкретный ключ
			if (VER_ID && access) {
			const cacheKey = `mosaicCache_${VER_ID}_${access}`;
			if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.get) {
				chrome.storage.session.get(cacheKey, (items) => {
					const existed = items && items[cacheKey] ? 1 : 0;
					chrome.storage.session.remove(cacheKey, () => {
						console.log('[background] clearMosaicCache removed', cacheKey, 'existed=', existed);
						sendResponse({ cleared: existed });
					});
				});
			} else {
				try {
					const existed = (_sessionMosaicConfig && _sessionMosaicConfig[cacheKey]) ? 1 : 0;
					if (_sessionMosaicConfig) delete _sessionMosaicConfig[cacheKey];
					console.log('[background] clearMosaicCache removed from memory', cacheKey, 'existed=', existed);
					sendResponse({ cleared: existed });
				} catch (e) {
					sendResponse({ cleared: 0 });
				}
			}
			return true;
		}

		// Иначе — получаем все ключи и фильтруем по префиксу
		if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.get) {
			chrome.storage.session.get(null, (items) => {
				const allKeys = Object.keys(items || {});
				let toRemove = allKeys.filter(k => k.startsWith('mosaicCache_'));
				if (VER_ID) toRemove = toRemove.filter(k => k.startsWith(`mosaicCache_${VER_ID}_`));
				if (access) toRemove = toRemove.filter(k => k.endsWith(`_${access}`));

				if (toRemove.length === 0) {
					console.log('[background] clearMosaicCache nothing to remove');
					sendResponse({ cleared: 0 });
					return;
				}

				chrome.storage.session.remove(toRemove, () => {
					console.log('[background] clearMosaicCache removed keys:', toRemove);
					sendResponse({ cleared: toRemove.length });
				});
			});
		} else {
			// Fallback: clean in-memory
			try {
				const allKeys = Object.keys(_sessionMosaicConfig || {});
				let toRemove = allKeys.filter(k => k.startsWith('mosaicCache_'));
				if (VER_ID) toRemove = toRemove.filter(k => k.startsWith(`mosaicCache_${VER_ID}_`));
				if (access) toRemove = toRemove.filter(k => k.endsWith(`_${access}`));

				toRemove.forEach(k => delete _sessionMosaicConfig[k]);
				console.log('[background] clearMosaicCache removed keys from memory:', toRemove);
				sendResponse({ cleared: toRemove.length });
			} catch (e) {
				sendResponse({ cleared: 0 });
			}
		}

		return true;
	}
});
