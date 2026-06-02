/**
 * Считывает файл и конвертирует его в JSON
 * @param {File} file - Объект файла из input
 * @returns {Promise<Array>} - Массив объектов
 */
export async function parseFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,          // Первая строка считается заголовками (ключами объекта)
            skipEmptyLines: 'greedy', // Полностью игнорирует пустые строки
            dynamicTyping: true,   // Автоматически конвертирует числа и boolean (опционально)
            complete: (results) => {
                // results.data содержит готовый массив объектов
                // results.errors содержит ошибки парсинга, если они были
                if (results.errors.length > 0) {
                    console.warn('Ошибки при парсинге CSV:', results.errors);
                }
                resolve(results.data);
            },
            error: (err) => {
                reject(new Error('Ошибка при чтении файла: ' + err.message));
            }
        });
    });
}

/**
 * Если данные приходят в виде строки (например, из API),
 * можно использовать эту функцию
 */
export function parseCSVStringToJson(csvString) {
    const parsed = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: 'greedy'
    });
    return parsed.data;
}