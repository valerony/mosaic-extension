// ui.js — wire DOM, events and glue modules
import { getMosaicConfigFromSession, saveMosaicConfigToSession, getImportedItemsFromSession, saveImportedItemsToSession } from './storage.js';
import { requestGlobalsFromTab, requestGlobalsFromTabWithRetries } from './request.js';
import { sendFetch, createMosaicItem, clearMosaicCache } from './fetcher.js';
import { renderPayload } from './render.js';

// Mapping of websites to webhooks
const WEBHOOK_MAPPING = {
    'advokit.ru': 'https://chaj.app.n8n.cloud/webhook/a6e0e815-a269-482d-a1cb-58d60a1d52ba',
    'domika.site': 'https://chaj.app.n8n.cloud/webhook/aa5b3fb6-ec71-4d82-8a79-c15ade0bbea2',
    'tourkit.site': 'https://chaj.app.n8n.cloud/webhook/fdd8d3c4-986b-48cc-a7d9-654599a55e21',
    'blagoweb.ru': 'https://chaj.app.n8n.cloud/webhook/6b2d2668-b3e9-4f64-b09b-8f46ec58f28a',
    'krasi.io': 'https://chaj.app.n8n.cloud/webhook/6fffff89-e680-4a5a-a55f-2f1e99d3bd6c',
    'dentasite.ru': 'https://chaj.app.n8n.cloud/webhook/2baa8ebf-326e-45fe-8833-be80c96dee1f',
    'remonta.site': 'https://chaj.app.n8n.cloud/webhook/b524941c-a7b0-4d01-b4d3-4b9a9d7f293e',
    'karkasweb.ru': 'https://chaj.app.n8n.cloud/webhook/58cb50b0-ea5f-496c-8678-dda959081fc3',
    'repetitors.site': 'https://chaj.app.n8n.cloud/webhook/33e34a91-ea08-403b-a1b2-47a530331c32',
    'debetweb.ru': 'https://chaj.app.n8n.cloud/webhook/214ec550-37a7-43a0-9c7b-8681dc39f773',
    'uborki.site': 'https://chaj.app.n8n.cloud/webhook/3dd3432f-544d-4279-8ab9-e52e45689ae0',
    'lovable.ru': 'https://chaj.app.n8n.cloud/webhook/a1b493e3-cacc-452a-bcbf-df435f6ba885',
    'hotelsite.pro': 'https://chaj.app.n8n.cloud/webhook/6175f639-2602-4120-8f20-6fd2a163831e'
};

/**
 * Get the webhook URL for the current tab
 * @param {Function} callback - Callback function that receives the webhook URL or null
 */
function getWebhookForCurrentTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
            callback(null);
            return;
        }
        
        const currentTabUrl = tabs[0].url;
        if (!currentTabUrl) {
            callback(null);
            return;
        }

        try {
            const url = new URL(currentTabUrl);
            const hostname = url.hostname;
            
            // Try exact match first
            if (WEBHOOK_MAPPING[hostname]) {
                callback(WEBHOOK_MAPPING[hostname]);
                return;
            }
            
            // Try without www prefix if present
            const hostnameWithoutWww = hostname.replace(/^www\./, '');
            if (WEBHOOK_MAPPING[hostnameWithoutWww]) {
                callback(WEBHOOK_MAPPING[hostnameWithoutWww]);
                return;
            }
            
            callback(null);
        } catch (e) {
            console.error('Error parsing URL:', e);
            callback(null);
        }
    });
}

export function initPopup() {
    const fetchBtn = document.getElementById('fetchBtn');
    const status = document.getElementById('status');
    const resultPre = document.getElementById('result');
    const createItemBtn = document.getElementById('createItemBtn');
    const configInfo = document.getElementById('configInfo');
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    const container = document.getElementById('data-container');
    const webhookGoBtn = document.getElementById('webhookGoBtn');
    const webhookInput = document.getElementById('webhookInput');
    const siteStatus = document.getElementById('siteStatus');
    const siteStatusIcon = document.getElementById('siteStatusIcon');
    const siteStatusText = document.getElementById('siteStatusText');
    const siteStatusWebhook = document.getElementById('siteStatusWebhook');
    const loadingIndicator = document.getElementById('loadingIndicator');

    function setStatus(text) { if (status) status.textContent = text; }

    // Auto-fill webhook input based on current tab's website and show status
    getWebhookForCurrentTab((webhookUrl) => {
        if (webhookUrl && webhookInput) {
            webhookInput.value = webhookUrl;
        }
    });

    // Try to auto-fetch data for any Mosaic site
    setTimeout(() => {
        performAutoFetchWithStatusHandling();
    }, 300);

    function showLoading(show) {
        if (loadingIndicator) {
            loadingIndicator.style.display = show ? 'block' : 'none';
        }
    }

    function hideLoading() {
        showLoading(false);
    }

    function performAutoFetchWithStatusHandling() {
        getWebhookForCurrentTab((webhookUrl) => {
            const hasWebhook = !!webhookUrl;
            
            // Always try to fetch data
            showLoading(true);
            setStatus('Загружаю данные...');
            
            // Use retries to get config from page - page might not be ready immediately
            requestGlobalsFromTabWithRetries(3, 5000)
                .then(fromPage => {
                    if (fromPage && fromPage.site_root_url && fromPage.access && fromPage.VER_ID) {
                        // Config found - update status based on webhook presence
                        if (siteStatus) {
                            siteStatus.style.display = 'flex';
                            if (hasWebhook) {
                                // Site is in webhook list
                                siteStatus.classList.remove('not-found');
                                siteStatusIcon.textContent = '✅';
                                siteStatusText.textContent = 'Сайт в списке';
                                siteStatusWebhook.textContent = '🔗 Вебхук готов к использованию';
                                siteStatusText.style.color = '#155724';
                            } else {
                                // Site is not in list but is a Mosaic site
                                siteStatus.classList.remove('not-found');
                                siteStatusIcon.textContent = '⚡';
                                siteStatusText.textContent = 'Mosaic сайт';
                                siteStatusWebhook.textContent = '📊 Автоматическая загрузка коллекций';
                                siteStatusText.style.color = '#004085';
                                siteStatus.style.backgroundColor = '#cce5ff';
                                siteStatus.style.borderColor = '#b8daff';
                            }
                        }

                        if (webhookUrl && webhookInput) {
                            webhookInput.value = webhookUrl;
                        }

                        // Now perform the auto-fetch
                        performAutoFetch();
                    } else {
                        // Config not found
                        hideLoading();
                        if (siteStatus) {
                            siteStatus.style.display = 'flex';
                            siteStatus.classList.add('not-found');
                            siteStatusIcon.textContent = 'ℹ️';
                            siteStatusText.textContent = 'Сайт не в списке';
                            siteStatusWebhook.textContent = 'Вы можете ввести вебхук вручную ниже';
                            siteStatusText.style.color = '#666';
                        }
                        setStatus('Введите вебхук вручную или нажмите Fetch Mosaic');
                    }
                })
                .catch(err => {
                    hideLoading();
                    if (siteStatus) {
                        siteStatus.style.display = 'flex';
                        siteStatus.classList.add('not-found');
                        siteStatusIcon.textContent = 'ℹ️';
                        siteStatusText.textContent = 'Сайт не в списке';
                        siteStatusWebhook.textContent = 'Вы можете ввести вебхук вручную ниже';
                        siteStatusText.style.color = '#666';
                    }
                    setStatus('Введите вебхук вручную или нажмите Fetch Mosaic');
                });
        });
    }

    function performAutoFetch() {
        showLoading(true);
        setStatus('Загружаю данные...');
        
        // Use retries to get config from page - page might not be ready immediately
        requestGlobalsFromTabWithRetries(3, 5000)
            .then(fromPage => {
                if (fromPage && fromPage.site_root_url && fromPage.access && fromPage.VER_ID) {
                    saveMosaicConfigToSession(fromPage, () => {
                        setStatus('✓ Конфигурация получена, загружаю коллекции...');
                        sendFetch(fromPage, false, (response) => {
                            hideLoading();
                            if (resultPre) resultPre.textContent = JSON.stringify(response, null, 2);
                            renderPayload(response, container, createItemBtn);
                            if (response && response.result && response.result.length > 0) {
                                setStatus('✓ Данные успешно загружены');
                            } else if (response && response.error) {
                                setStatus('Ошибка: ' + response.error);
                            } else {
                                setStatus('Коллекции загружены');
                            }
                        }, setStatus);
                    });
                } else {
                    hideLoading();
                    setStatus('Введите вебхук вручную или нажмите Fetch Mosaic');
                    console.warn('Config not available from page:', fromPage);
                }
            })
            .catch(err => {
                hideLoading();
                setStatus('Введите вебхук вручную или нажмите Fetch Mosaic');
                console.error('Auto-fetch error:', err);
            });
    }

    getMosaicConfigFromSession((cfg) => {
        if (cfg) {
            if (resultPre) resultPre.textContent = JSON.stringify(cfg, null, 2);
        }
    });

    async function getConfigThenFetch(isTest = false) {
        getMosaicConfigFromSession(async (cfg) => {
            if (!cfg || !cfg.site_root_url || !cfg.access || !cfg.VER_ID) {
                try {
                    const fromPage = await requestGlobalsFromTabWithRetries(2, 5000);
                    if (!fromPage || !fromPage.site_root_url || !fromPage.access || !fromPage.VER_ID) {
                        setStatus('Не удалось получить корректный конфиг из страницы');
                        hideLoading();
                        return;
                    }
                    cfg = fromPage;
                } catch (err) {
                    setStatus('Ошибка запроса переменных страницы: ' + err.message);
                    hideLoading();
                    return;
                }
            }

            saveMosaicConfigToSession(cfg, () => {
                sendFetch(cfg, isTest, (response) => {
                        hideLoading();
                        if (resultPre) resultPre.textContent = JSON.stringify(response, null, 2);
                        renderPayload(response, container, createItemBtn);
                }, setStatus);
            });
        });
    }

    if (fetchBtn) {
        fetchBtn.addEventListener('click', async () => {
            showLoading(true);
            setStatus('Запрашиваю переменные страницы...');
            try {
                const fromPage = await requestGlobalsFromTabWithRetries(3, 5000);
                if (fromPage && fromPage.site_root_url && fromPage.access && fromPage.VER_ID) {
                    saveMosaicConfigToSession(fromPage, () => {
                        setStatus('Конфиг получен со страницы, выполняю запрос...');
                        sendFetch(fromPage, false, (response) => {
                            hideLoading();
                            if (resultPre) resultPre.textContent = JSON.stringify(response, null, 2);
                            renderPayload(response, container, createItemBtn);
                        }, setStatus);
                    });
                } else {
                    hideLoading();
                    setStatus('Не удалось получить конфиг со страницы, пробую из сессии...');
                    getConfigThenFetch(false);
                }
            } catch (err) {
                hideLoading();
                setStatus('Ошибка запроса переменных страницы: ' + (err && err.message ? err.message : err));
                getConfigThenFetch(false);
            }
        });
    }

    if (createItemBtn) {
        createItemBtn.addEventListener('click', async () => {
            const activeHeader = document.querySelector('.data-card-header.active');
            let objFieldItems = {};
            const fieldItems = activeHeader.querySelectorAll('.import-field-option');

            fieldItems.forEach(fi => {
                objFieldItems[fi.getAttribute('data-field-id')] =  fi.getAttribute('data-field-type');
            });

            if (!activeHeader) { setStatus('Пожалуйста, выберите коллекцию'); return; }
            const collectionId = activeHeader.getAttribute('data-collection-id');
            if (!collectionId) { setStatus('ID коллекции не найден'); return; }
            // only create items from imported data; do nothing if no import present
            getImportedItemsFromSession(async (imported) => {
                if (!imported || !imported.length) { setStatus('Нет импортированных данных для создания записей'); return; }

                getMosaicConfigFromSession(async (cfg) => {
                    if (!cfg || !cfg.site_root_url || !cfg.access || !cfg.VER_ID) {
                        try {
                            const fromPage = await requestGlobalsFromTabWithRetries(2, 5000);
                            if (!fromPage || !fromPage.site_root_url || !fromPage.access || !fromPage.VER_ID) { setStatus('Не удалось получить конфиг для создания записи'); return; }
                            cfg = fromPage;
                        } catch (err) { setStatus('Ошибка при получении конфига: ' + err.message); return; }
                    }

                    function toUnixMs(input) {
                        if (input === null || input === undefined || input === '') return null;
                        if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(input)) return new Date(input).getTime();
                        if (/^\d{2}\.\d{2}\.\d{4}$/.test(input)) {
                            const [d, m, y] = input.split('.');
                            return new Date(y, m - 1, d).getTime();
                        }
                        throw new Error('Неподдерживаемый формат даты');
                    }

                    function buildItemPayload(record) {
                        // Инициализируем payload
                        const itemData = {};
                        const itemImage = [];


                        if (record.title) {
                            itemData.title = { title: String(record.title) };
                        }

                        for (const k of Object.keys(record)) {
                            const v = record[k];
                            
                            // Пропускаем заголовок, так как обработали его выше
                            if (k === 'title') continue;

                            // Проверяем, есть ли определение типа для этого ключа
                            const fieldType = objFieldItems[k];

                            if (!fieldType) {
                                console.warn(`Тип для ключа ${k} не найден в objFieldItems`);
                                continue;
                            }

                            switch (fieldType) {
                                case 'rich_text':
                                    itemData[k] = { richText: v == null ? '' : `${String(v)}` };
                                    break;
                                    
                                case 'date':
                                    try {
                                        // Убедись, что функция toUnixMs определена в контексте
                                        itemData[k] = { dateTime: toUnixMs(String(v)) };
                                    } catch (e) {
                                        itemData[k] = { dateTime: Date.now() };
                                    }
                                    break;
                                    
                                case 'text':
                                    itemData[k] = { text: String(v == null ? '' : v) };
                                    break;
                                    
                                case 'link':
                                    itemData[k] = { link: String(v == null ? '' : v) };
                                    break;
                                case 'image':
                                    itemImage.push({
                                        'imageLink': v,
                                        'imageFieldId': k,
                                        'imageFileName':`image_${Math.random().toString(36).substring(2, 10)}.jpg`
                                    });
                                break;
                                default:
                                    console.log(`Ключ ${k} имеет неизвестный тип: ${fieldType}`);
                            }
                        }

                        console.log('Результат itemData:', itemData);
                        console.log('Результат itemImage:', itemImage);
                        return { 'itemData': itemData , 'itemImage': itemImage};
                    }

 
                    saveMosaicConfigToSession(cfg, async () => {
                        for (let i = 0; i < imported.length; i++) {
                            const record = imported[i];
                            const itemPayload = buildItemPayload(record);

                            setStatus(`Создаю запись ${i + 1} из ${imported.length}...`);

                            await new Promise((resolve) => {
                                createMosaicItem(cfg, collectionId, itemPayload, (response) => {
                                    if (resultPre) resultPre.textContent = JSON.stringify(response, null, 2);
                                    if (response && response.error) setStatus('Ошибка создания записи: ' + response.error);
                                    else setStatus(`Успешно создано: ${i + 1} / ${imported.length}`);
                                    resolve();
                                }, setStatus);
                            });
                        }
                        setStatus('Импорт завершён');
                    });
                });
            });
        });
    }

    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (!confirm('Удалить весь кэш mosaicCache_ ?')) return;
            clearMosaicCache(() => {}, setStatus);
        });
    }

    if (webhookGoBtn && webhookInput) {
        webhookGoBtn.addEventListener('click', () => {
            const url = webhookInput.value.trim();
            if (!url) {
                setStatus('Пожалуйста, введите URL вебхука');
                return;
            }
            setStatus('Отправляю запрос к вебхуку...');
            fetch(url, { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    setStatus('Ответ получен:');
                    if (resultPre) resultPre.textContent = JSON.stringify(data, null, 2);
                    try { saveImportedItemsToSession(data.result, () => {}); } catch (e) {}

                })
                .catch(err => {
                    setStatus('Ошибка запроса к вебхуку: ' + err.message);
                });
        });
    }
}
