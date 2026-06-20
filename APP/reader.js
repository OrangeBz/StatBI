// reader.js

/**
 * Procesa un archivo CSV y extrae cabeceras y filas mapeadas numéricamente
 * @param {File} file - El objeto de archivo obtenido del input HTML
 * @param {Function} callback - Función de retorno que recibe (headers, rows, rawData)
 */
function parseCSV(file, callback) {
    const reader = new FileReader();

    reader.onload = function(e) {
        const text = e.target.result;
        
        // Separamos por líneas limpiando retornos de carro (\r)
        const lines = text.split(/\r?\n/);
        if (lines.length === 0 || lines[0].trim() === "") {
            console.error("El archivo CSV está vacío.");
            return;
        }

        // 1. Extraer y limpiar las cabeceras (Primera fila)
        const headers = lines[0].split(',').map(header => header.trim());

        const rows = [];
        const rawData = [];

        // 2. Iterar sobre las filas de datos (a partir de la línea 1)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === "") continue; // Saltarse líneas vacías

            const columns = line.split(',').map(col => col.trim());
            
            // Verificamos que la fila tenga la misma cantidad de columnas que las cabeceras
            if (columns.length === headers.length) {
                // Estructura de fila plana para pintar la tabla en el DOM
                rows.push(columns);

                // Estructura clave-valor para la manipulación y filtros lógicos de la App
                const rowObject = {};
                headers.forEach((header, index) => {
                    const value = columns[index];
                    // Si el valor es puramente numérico, lo convertimos de una vez
                    rowObject[header] = !isNaN(value) && value !== "" ? parseFloat(value) : value;
                });
                rawData.push(rowObject);
            }
        }

        // Devolvemos el control a app.js enviando las estructuras limpias
        callback({
            headers: headers,
            rows: rows,
            rawData: rawData
        });
    };

    // Iniciamos la lectura asíncrona del archivo local
    reader.readAsText(file);
}