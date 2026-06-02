import {
    preViewImage,
    generateUUID,
    base64ToBlob

} from './utils.js';
import {
    saveMosaicConfigToSession,
    getMosaicConfigFromSession

} from './storage.js';

export async function handleCreateMosaicItem(request, sendResponse) {
    let cfg = request.config;
    const collectionId = request.collectionId;
    const itemData = request.itemData['itemData'];
    const itemImage = request.itemData['itemImage'];

    // Вспомогательная функция для логики создания
    const continueWithCfg = async (theCfg) => {
        try {
            if (!theCfg || !theCfg.site_root_url || !theCfg.VER_ID || !theCfg.access) {
                throw new Error('Missing required config fields: site_root_url, VER_ID, access');
            }

            const site_root_url = theCfg.site_root_url.replace(/\/$/, '');
            const baseUrl = `${site_root_url}/-/x-api/v1/protected/`;
            
            const queryParams = new URLSearchParams({
                method: 'mosaic/collection/item/create',
                ver_id: String(theCfg.VER_ID),
                access: String(theCfg.access),
                'param[collection_id]': collectionId,
                request_id: generateUUID(),
            });

            const formData = new FormData();
            formData.append('item_data', JSON.stringify(itemData || {}));

            // --- ОБРАБОТКА КАРТИНОК В ЦИКЛЕ ---
            if (itemImage && Array.isArray(itemImage)) {
                for (const img of itemImage) {
                    if (!img.imageFieldId || !img.imageFileName) continue;

                    let imageBlob = null;

                    if (img.imageLink !== 'preview') {
                        try {
                            // 1. Запрос к n8n (ждем ответа)
                            const n8nUrl = `https://chaj.app.n8n.cloud/webhook/get-image-base64`;
                            const n8nResponse = await fetch(n8nUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ "image_url": img.imageLink })
                            });
                            const n8nData = await n8nResponse.json();
                            
                            // 2. Конвертируем полученный из n8n image_base64 в Blob
                            // n8nData.image_base64 — это чистая строка без префикса
                            imageBlob = base64ToBlob(n8nData.image_base64, n8nData.mime_type || "image/png");
                        } catch (error) {
                            console.error('[background] Error fetching image from n8n:', error);

                            imageBlob = base64ToBlob(preViewImage, "image/png");
                        }
                    } else {
                        // Если это превью, берем готовую строку
                        imageBlob = base64ToBlob(preViewImage, "image/png");
                    }

                    if (imageBlob) {
                        formData.append(`image_${img.imageFieldId}`, imageBlob, img.imageFileName);
                    }
                }
            }

            // --- ОТПРАВКА ФИНАЛЬНОГО ЗАПРОСА ---
            const requestUrl = `${baseUrl}?${queryParams.toString()}`;
            const response = await fetch(requestUrl, {
                method: 'POST',
                body: formData,
                credentials: 'include'
                // Браузер сам выставит нужные headers для FormData, включая Content-Type с boundary
            });


            const result = await response.json();
            sendResponse(result);

        } catch (error) {
            console.error('[background] Error:', error);
            sendResponse({ error: error.message });
        }
    };

    // Логика получения конфига
    if (!cfg) {
        getMosaicConfigFromSession((storedCfg) => {
            if (storedCfg) saveMosaicConfigToSession(storedCfg);
            continueWithCfg(storedCfg);
        });
    } else {
        saveMosaicConfigToSession(cfg);
        continueWithCfg(cfg);
    }

    return true; // Держим канал связи открытым для sendResponse
}