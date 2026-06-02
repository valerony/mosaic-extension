(function() {
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function safeGet(name) {
        try { return window[name]; } catch (e) { return null; }
    }

    function buildPayload() {
        const rawAccess = safeGet('access') || safeGet('ACCESS') || '';
        let extractedAccessValue = '';

        if (rawAccess) {
            try {
                if (String(rawAccess).indexOf('=') !== -1) {
                    const params = new URLSearchParams(String(rawAccess));
                    extractedAccessValue = params.get('access') || String(rawAccess);
                } else {
                    extractedAccessValue = String(rawAccess);
                }
            } catch (e) {
                extractedAccessValue = String(rawAccess);
            }
        }

        let mca = '', mcs = '';
        if (extractedAccessValue) {
            const parts = String(extractedAccessValue).split(';');
            mca = parts[1] || '';
            mcs = parts[2] || '';
        }

        return {
            site_root_url: (safeGet('site_root_url') ? String(safeGet('site_root_url')).replace(/\/$/, '') : (location.origin || '')),
            access: extractedAccessValue,
            VER_ID: (safeGet('VER_ID') ? String(safeGet('VER_ID')) : ''),
            site_domain: (safeGet('site_domain') ? String(safeGet('site_domain')) : (location.host || '')),
            DESIGN_ID: (safeGet('DESIGN_ID') ? String(safeGet('DESIGN_ID')) : ''),
            userAgent: (navigator && navigator.userAgent ? navigator.userAgent : ''),
            request_id: generateUUID(),
            mcaAccessValue: mca,
            mcsAccessValue: mcs,
            fromPage: true
        };
    }

    try {
        const payload = buildPayload();
        window.postMessage({ type: 'MOSAIC_GLOBALS', payload: payload }, '*');

        window.addEventListener('message', function(e) {
            if (e && e.data && e.data.type === 'MOSAIC_REQUEST') {
                const p = buildPayload();
                window.postMessage({ type: 'MOSAIC_GLOBALS', payload: p }, '*');
            }
        });
    } catch (err) {
        window.postMessage({ type: 'MOSAIC_GLOBALS', payload: { error: err.message } }, '*');
    }
})();