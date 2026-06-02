document.addEventListener('DOMContentLoaded', () => {
    const fetchBtn = document.getElementById('fetchBtn');
    const status = document.getElementById('status');
    const resultPre = document.getElementById('result');
    
    const createItemBtn = document.getElementById('createItemBtn');
    const configInfo = document.getElementById('configInfo');

    // Session storage helpers (prefer chrome.storage.session, fallback to in-memory and migrate from )
    let _popupSessionMosaicConfig = null;

    function saveMosaicConfigToSession(cfg, cb) {
        try {
            if (chrome && chrome.storage && chrome.storage.session && chrome.storage.session.set) {
                chrome.storage.session.set({ mosaicConfig: cfg }, () => {
                    _popupSessionMosaicConfig = cfg;
                    if (cb) cb();
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

    function getMosaicConfigFromSession(cb) {
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

    // Показываем сохранённый конфиг из сессии/локального хранилища, если он есть
    getMosaicConfigFromSession((cfg) => {
        if (cfg) {
            status.textContent = 'Конфигурация найдена в сессии';
            resultPre.textContent = JSON.stringify(cfg, null, 2);
        } else {
            status.textContent = 'Конфигурация берётся со страницы при нажатии Fetch или Import';
        }
    });

    // Fetch handler removed — unified handler with force support defined later

    const forceCheckbox = document.getElementById('forceRefresh');
    const clearCacheBtn = document.getElementById('clearCacheBtn');

    // Helper: request globals from active tab (one-shot listener with timeout)
    function requestGlobalsFromTab(timeout = 3000) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                if (!tabs || !tabs[0]) return reject(new Error('Нет активной вкладки'));
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

                // Safety timeout
                timer = setTimeout(() => {
                    chrome.runtime.onMessage.removeListener(onMessage);
                    resolve(null);
                }, timeout);

                chrome.tabs.sendMessage(tabId, {
                    action: 'requestGlobals'
                }, (resp) => {
                    if (chrome.runtime.lastError) {
                        chrome.runtime.onMessage.removeListener(onMessage);
                        clearTimeout(timer);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        status.textContent = 'Запрошены переменные страницы, ожидаю...';
                    }
                });
            });
        });
    }

    // Helper: get config (from storage or page) then perform fetch
    async function getConfigThenFetch(isTest = false) {
        getMosaicConfigFromSession(async (cfg) => {
            if (!cfg || !cfg.site_root_url || !cfg.access || !cfg.VER_ID) {
                try {
                    const fromPage = await requestGlobalsFromTab();
                    if (!fromPage || !fromPage.site_root_url || !fromPage.access || !fromPage.VER_ID) {
                        status.textContent = 'Не удалось получить корректный конфиг из страницы';
                        return;
                    }
                    cfg = fromPage;
                } catch (err) {
                    status.textContent = 'Ошибка запроса переменных страницы: ' + err.message;
                    return;
                }
            }

            // Ensure force flag reflects UI
            cfg.force = !!(forceCheckbox && forceCheckbox.checked);

            // Save config to session and perform fetch
            saveMosaicConfigToSession(cfg, () => {
                sendFetch(cfg, isTest);
            });
        });
    }

    function sendFetch(cfg, isTest) {
        status.textContent = isTest ? 'Отправляю тестовый запрос...' : 'Отправляю запрос...';
        resultPre.textContent = '';

        chrome.runtime.sendMessage({
            action: 'fetchMosaicList',
            config: cfg
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[popup] runtime error', chrome.runtime.lastError.message);
                status.textContent = 'Ошибка: ' + chrome.runtime.lastError.message;
                return;
            }

            if (response && response.error) {
                status.textContent = 'Ошибка: ' + response.error;
                resultPre.textContent = JSON.stringify(response, null, 2);
                renderPayload(null);
            } else {
                status.textContent = (response && response.fromCache) ? 'Данные из кэша' : 'Успешно — смотрите консоль и результат ниже';
                resultPre.textContent = JSON.stringify(response, null, 2);

                // Render structured card view (mirrors exemple-html.html)
                renderPayload(response);

                if (response && response.cOrder) console.log('[popup] cOrder:', response.cOrder);
            }
        });
    }

    // Render function: create card UI similar to exemple-html.html
    function renderPayload(payload) {
        const container = document.getElementById('data-container');
        container.innerHTML = '';
        if (!payload || !Array.isArray(payload.result) || payload.result.length === 0) {
            const msg = document.createElement('div');
            msg.style.color = '#666';
            msg.textContent = 'Нет данных для отображения';
            container.appendChild(msg);
            // Hide create button if no data
            if (createItemBtn) createItemBtn.style.display = 'none';
            return;
        }

        payload.result.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card data-card';

            const merged = [...(item.settings || []), ...(item.cSchema || [])];

            const fieldsMap = merged.reduce((acc, f) => {
                if (f && f.fieldName) acc[f.fieldName] = f.id || '';
                return acc;
            }, {});
            const encodedFields = encodeURIComponent(JSON.stringify(fieldsMap));

            card.innerHTML = `
                <div class="card-header data-card-header" tabindex="0" role="button" data-collection-id="${item.id || ''}" data-fields="${encodedFields}">
                    <div class="data-card-title">${(item.title || '')} (ID: ${item.id || ''})</div>
                    <div class="data-card-actions">
                        <button class="copy-json-btn" title="Copy JSON" type="button" aria-label="Copy JSON">Copy JSON</button>
                        <button class="import-btn" title="Импорт данных" type="button" aria-label="Импорт">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M.5 9.9a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H2.71l2.147 2.146a.5.5 0 0 1-.708.708L2 10.707V12.5a.5.5 0 0 1-1 0v-2.6z"/>
                                <path d="M7.646 1.646a.5.5 0 0 1 .708 0L11.5 4.793 8.854 7.438a.5.5 0 1 1-.708-.707L9.293 5H4.5a.5.5 0 0 1 0-1h4.793L7.646 2.354a.5.5 0 0 1 0-.708z"/>
                            </svg>
                        </button>
                        <input class="file-input" type="file" accept=".json,.csv" />
                    </div>
                </div>
                <div class="card-body data-card-body">
                    <div class="row">
                        <div class="col-12 row-line">
                            ${merged.map(field => `
                                <div class="field-item">
                                    <div class="field-name">${field.fieldName || ''}</div>
                                    <div class="field-id">${field.id || ''}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;

            container.appendChild(card);
        });

        // Show create button if we have data
        if (createItemBtn && payload.result.length > 0) {
            createItemBtn.style.display = 'block';
        }

        // Add interactive behavior (single-open tabs, import button behavior)
        const headers = container.querySelectorAll('.data-card-header');
        const bodies = container.querySelectorAll('.data-card-body');

        function closeAll() {
            headers.forEach(h => h.classList.remove('active'));
            bodies.forEach(b => {
                b.classList.remove('show');
                b.setAttribute('aria-hidden', 'true');
            });
            headers.forEach(h => h.setAttribute('aria-expanded', 'false'));
        }

        headers.forEach(header => {
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.setAttribute('aria-expanded', 'false');
            const body = header.nextElementSibling;
            if (body) body.setAttribute('aria-hidden', 'true');

            const toggle = () => {
                const isActive = header.classList.contains('active');
                if (isActive) return;
                closeAll();
                header.classList.add('active');
                if (body) {
                    body.classList.add('show');
                    body.setAttribute('aria-hidden', 'false');
                }
                header.setAttribute('aria-expanded', 'true');
            };

            header.addEventListener('click', toggle);
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });

            const importBtn = header.querySelector('.import-btn');
            const fileInput = header.querySelector('.file-input');
            if (importBtn && fileInput) {
                importBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fileInput.click();
                });
                fileInput.addEventListener('change', (e) => {
                    const files = e.target.files;
                    if (files && files.length) {
                        console.log('Файлы для импорта:', files);
                        alert(`Выбран(о) ${files.length} файл(ов) для импорта.`);
                        // TODO: добавить обработку импортированных файлов при необходимости
                    }
                });
            }

            // Copy JSON button behavior — builds { fieldName: id } mapping and copies to clipboard
            const copyBtn = header.querySelector('.copy-json-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dataAttr = header.getAttribute('data-fields') || '';
                    let obj = {};
                    try {
                        obj = JSON.parse(decodeURIComponent(dataAttr));
                    } catch (err) {
                        obj = {};
                    }
                    const json = JSON.stringify(obj, null, 2);

                    const fallbackCopy = (text) => {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        document.body.appendChild(ta);
                        ta.select();
                        try { document.execCommand('copy'); status.textContent = 'JSON скопирован (fallback)'; } catch (err) { status.textContent = 'Не удалось скопировать JSON'; }
                        document.body.removeChild(ta);
                    };

                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(json).then(() => {
                            status.textContent = 'JSON скопирован в буфер обмена';
                        }).catch(() => {
                            fallbackCopy(json);
                        });
                    } else {
                        fallbackCopy(json);
                    }
                });
            }
        });

        // Open first card by default
        if (headers.length > 0) {
            headers[0].click();
        }
    }

    // Create item handler
    if (createItemBtn) {
        createItemBtn.addEventListener('click', async () => {
            // Get the active collection card
            const activeHeader = document.querySelector('.data-card-header.active');
            if (!activeHeader) {
                status.textContent = 'Пожалуйста, выберите коллекцию';
                return;
            }

            const collectionId = activeHeader.getAttribute('data-collection-id');
            if (!collectionId) {
                status.textContent = 'ID коллекции не найден';
                return;
            }

            // Get config
            getMosaicConfigFromSession(async (cfg) => {
                if (!cfg || !cfg.site_root_url || !cfg.access || !cfg.VER_ID) {
                    try {
                        const fromPage = await requestGlobalsFromTab();
                        if (!fromPage || !fromPage.site_root_url || !fromPage.access || !fromPage.VER_ID) {
                            status.textContent = 'Не удалось получить конфиг для создания записи';
                            return;
                        }
                        cfg = fromPage;
                    } catch (err) {
                        status.textContent = 'Ошибка при получении конфига: ' + err.message;
                        return;
                    }
                }

                // Prepare item data (example payload — can be modified later)
                const itemDataPayload = {
                    "title": {
                        "title": "New Item"
                    },
                    "6b7730": {
                        "dateTime": Date.now()
                    },
                    "781ab6": {
                        "richText": "<p>Item description</p>"
                    }
                };

                status.textContent = 'Создаю запись в коллекции...';

                // Save config to session to ensure background can use it
                saveMosaicConfigToSession(cfg, () => {
                    chrome.runtime.sendMessage({
                        action: 'createMosaicItem',
                        config: cfg,
                        collectionId: collectionId,
                        itemData: itemDataPayload
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('[popup] create item runtime error', chrome.runtime.lastError.message);
                            status.textContent = 'Ошибка: ' + chrome.runtime.lastError.message;
                            return;
                        }

                        if (response && response.error) {
                            status.textContent = 'Ошибка создания записи: ' + response.error;
                            resultPre.textContent = JSON.stringify(response, null, 2);
                        } else {
                            status.textContent = 'Запись успешно создана!';
                            resultPre.textContent = JSON.stringify(response, null, 2);
                            console.log('[popup] Item created successfully:', response);
                        }
                    });
                });
            });
        });
    }

    // Clear cache handler — clears all mosaic caches (no inputs necessary)
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (!confirm('Удалить весь кэш mosaicCache_ ?')) return;
            status.textContent = 'Очищаю кэш...';
            chrome.runtime.sendMessage({
                action: 'clearMosaicCache',
                keys: {}
            }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.warn('[popup] clear cache runtime error', chrome.runtime.lastError.message);
                    status.textContent = 'Ошибка: ' + chrome.runtime.lastError.message;
                    return;
                }
                status.textContent = 'Кэш очищен: ' + (resp && resp.cleared ? resp.cleared : 0);
            });
        });
    }

    

    // Update fetch button to request page globals first, save to session, then perform fetch
    fetchBtn.addEventListener('click', async () => {
        status.textContent = 'Запрашиваю переменные страницы...';
        try {
            const fromPage = await requestGlobalsFromTab();
            if (fromPage && fromPage.site_root_url && fromPage.access && fromPage.VER_ID) {
                // save to session and immediately perform fetch using this config
                saveMosaicConfigToSession(fromPage, () => {
                    status.textContent = 'Конфиг получен со страницы, выполняю запрос...';
                    sendFetch(fromPage, false);
                });
            } else {
                // fallback to previous behavior (will try session then page)
                status.textContent = 'Не удалось получить конфиг со страницы, пробую из сессии...';
                getConfigThenFetch(false);
            }
        } catch (err) {
            status.textContent = 'Ошибка запроса переменных страницы: ' + (err && err.message ? err.message : err);
            // fallback
            getConfigThenFetch(false);
        }
    });

});