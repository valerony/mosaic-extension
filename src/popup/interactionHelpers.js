// interactionHelpers.js — attach handlers for import and copy buttons
import { parseFile } from './parseCSVToJson.js';
import { saveImportedItemsToSession } from './storage.js';

export function attachImportHandler(header) {
    const importBtn = header.querySelector('.import-btn');
    const fileInput = header.querySelector('.file-input');
    if (!importBtn || !fileInput) return;
    importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (!files || !files.length) return;

        const file = files[0];
        const name = (file.name || '').toLowerCase();

        if (name.endsWith('.csv')) {
            parseFile(file).then(parsed => {
                const resultEl = document.getElementById('result');
                if (resultEl) resultEl.textContent = JSON.stringify(parsed, null, 2);
                header.setAttribute('data-import-json', encodeURIComponent(JSON.stringify(parsed)));
                // save parsed items to session so UI can create them later
                try { saveImportedItemsToSession(parsed, () => {}); } catch (e) {}

                alert(`CSV распаршен: ${parsed.length} записей`);
            }).catch(err => {
                alert('Ошибка при разборе CSV: ' + (err && err.message ? err.message : err));
            });
            return;
        }

        if (name.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    const resultEl = document.getElementById('result');
                    if (resultEl) resultEl.textContent = JSON.stringify(parsed, null, 2);
                    header.setAttribute('data-import-json', encodeURIComponent(JSON.stringify(parsed)));
                    try { saveImportedItemsToSession(parsed, () => {}); } catch (e) {}
                    alert('JSON загружен');
                } catch (err) {
                    alert('Ошибка парсинга JSON: ' + (err && err.message ? err.message : err));
                }
            };
            reader.onerror = () => alert('Ошибка чтения файла');
            reader.readAsText(file);
            return;
        }

        alert(`Выбран(о) ${files.length} файл(ов) для импорта.`);
    });
}

export function attachCopyHandler(header) {
    const copyBtn = header.querySelector('.copy-json-btn');
    if (!copyBtn) return;
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dataAttr = header.getAttribute('data-fields') || '';
        let obj = {};
        try { obj = JSON.parse(decodeURIComponent(dataAttr)); } catch (err) { obj = {}; }
        const json = JSON.stringify(obj, null, 2);

        const fallbackCopy = (text) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (err) {}
            document.body.removeChild(ta);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).then(() => {}).catch(() => { fallbackCopy(json); });
        } else {
            fallbackCopy(json);
        }
    });
}

