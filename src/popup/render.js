// render.js — renderPayload and helpers
import { attachImportHandler, attachCopyHandler } from './interactionHelpers.js';

export function renderPayload(payload, containerEl, createItemBtnEl) {
    containerEl.innerHTML = '';
    if (!payload || !Array.isArray(payload.result) || payload.result.length === 0) {
        const msg = document.createElement('div');
        msg.style.color = '#666';
        msg.textContent = 'Нет данных для отображения';
        containerEl.appendChild(msg);
        if (createItemBtnEl) createItemBtnEl.style.display = 'none';
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
                    <button class="copy-json-btn" title="Скопировать JSON" type="button" aria-label="Скопировать JSON">Скопировать JSON</button>
                    <button class="import-btn" title="Импорт данных" type="button" aria-label="Импорт">Импорт</button>
                    <input class="file-input" type="file" accept=".json,.csv" />
                    <div class="hidden import-field">
                        ${merged.map(field => `
                            <div class="import-field-option" data-field-name="${field.fieldName || ''}" data-field-id="${field.id || ''}" data-field-type="${field.type || ''}"></div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="card-body data-card-body">
                <div class="row">
                    <div class="col-12 row-line">
                        ${merged.map(field => `
                            <div class="field-item" data-field-name="${field.fieldName || ''}">
                                <div class="field-name">${field.fieldName || ''}</div>
                                <div class="field-id">${field.id || ''}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        containerEl.appendChild(card);
    });

    if (createItemBtnEl && payload.result.length > 0) {
        createItemBtnEl.style.display = 'block';
    }

    const headers = containerEl.querySelectorAll('.data-card-header');
    const bodies = containerEl.querySelectorAll('.data-card-body');

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

        attachImportHandler(header);
        attachCopyHandler(header);
    });

    if (headers.length > 0) headers[0].click();
}
