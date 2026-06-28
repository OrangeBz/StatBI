// app.js

// --- 1. ESTADO GLOBAL DE LA APLICACIÓN ---
let globalData = [];          // Array de objetos [{Col1: Val1, Col2: Val2}, ...]
let currentHeaders = [];      // Cabeceras detectadas en el CSV
let currentVarX = "";         // Variable seleccionada para el eje X
let currentVarY = "";         // Variable seleccionada para el eje Y (análisis métrico)
let activeChart = null;       // Instancia activa de Chart.js (Estadística Descriptiva)
let distributionChart = null; // Instancia activa de Chart.js (Distribuciones)
let currentChartType = 'scatter'; // 'scatter' | 'line' | 'histogram' | 'boxplot'
let histogramMin = 0;
let histogramMax = 0;
let chartRenderStartTime = 0; // Marca de tiempo de renderizado para animar líneas de tendencia

// Configuración de Slicing (Filtro de Rango de Filas)
let sliceStart = 1;
let sliceEnd = 1;

// Configuración de Paginación para la Tabla
const rowsPerPage = 10;
let currentPage = 1;

// --- 2. MAPEO DEL DOM ---
// Navegación por pestañas
const menuItems = document.querySelectorAll('.menu-item');
const appViews = document.querySelectorAll('.app-view');

// Elementos de carga e interfaz
const fileInput = document.getElementById('csv-file');
const tableBody = document.getElementById('table-body');
const recordsIndicator = document.getElementById('records-count');
const tablePagination = document.getElementById('table-pagination');

// Variables de Análisis (Multicolumnas y Slicing)
const variablesSelectorBlock = document.getElementById('variables-selector-block');
const selectVarX = document.getElementById('select-var-x');
const selectVarY = document.getElementById('select-var-y');
const rangeStart = document.getElementById('range-start');
const rangeEnd = document.getElementById('range-end');

// Gráfico e Interpretación Descriptiva
const chartTitle = document.getElementById('chart-title');
const ctx = document.getElementById('main-chart').getContext('2d');
const kpiButtons = document.querySelectorAll('.kpi-card:not(.static)');
const insightContainer = document.getElementById('insight-container');
const optionsButtonsContainer = document.querySelector('.options-buttons');

// Barra de estado inferior
const statusFile = document.getElementById('status-file');
const statusRecords = document.getElementById('status-records');

// Módulo de Probabilidad
const probTabs = document.getElementById('prob-tabs');
const probInstruction = document.getElementById('prob-instruction');
const probDynamicInputs = document.getElementById('prob-dynamic-inputs');
const btnCalculateProb = document.getElementById('btn-calculate-prob');
const probResultBox = document.getElementById('prob-result-box');
let activeProbTab = 'combinatoria'; // 'combinatoria' | 'simple' | 'condicional' | 'bayes'

// Módulo de Distribuciones
const selectDistribution = document.getElementById('select-distribution');
const distInputsContainer = document.getElementById('dist-inputs-container');
const btnPlotDistribution = document.getElementById('btn-plot-distribution');
const btnSimulateProbability = document.getElementById('btn-simulate-probability');
const distCtx = document.getElementById('distribution-curve-chart').getContext('2d');


// --- 3. ENRUTADOR DINÁMICO DE PESTAÑAS (TAB SYSTEM) ---
menuItems.forEach(item => {
    item.addEventListener('click', function() {
        document.querySelector('.menu-item.active').classList.remove('active');
        this.classList.add('active');

        const targetViewId = this.getAttribute('data-target');
        appViews.forEach(view => {
            view.classList.remove('active');
            if (view.id === targetViewId) {
                view.classList.add('active');
            }
        });

        // Re-renderizado de gráficos para evitar colapso de tamaño
        if (targetViewId === 'view-descriptive' && getActiveData().length > 0) {
            setTimeout(renderChart, 80);
        } else if (targetViewId === 'view-distributions') {
            setTimeout(renderDistributionCurve, 80);
        }
    });
});


// --- Helper para obtener datos filtrados por Slicing ---
function getActiveData() {
    if (!globalData || globalData.length === 0) return [];
    return globalData.slice(sliceStart - 1, sliceEnd);
}


// --- 4. CONTROLADOR DE CARGA DE ARCHIVOS CSV ---
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    parseCSV(file, function(result) {
        globalData = result.rawData;
        currentHeaders = result.headers;
        currentPage = 1;

        statusFile.innerHTML = `Archivo Activo: <strong>${file.name}</strong>`;
        statusRecords.innerText = `Registros Cargados: ${globalData.length.toLocaleString()}`;

        // Configuración segura del estado del Slicing
        sliceStart = 1;
        sliceEnd = globalData.length;
        
        rangeStart.value = 1;
        rangeStart.min = 1;
        rangeStart.max = globalData.length;
        
        rangeEnd.value = globalData.length;
        rangeEnd.min = 1;
        rangeEnd.max = globalData.length;

        // Configuración de multicolumnas dinámica
        if (currentHeaders.length >= 2) {
            populateVariableSelectors();
            variablesSelectorBlock.style.display = 'block';
            currentVarX = currentHeaders[0];
            currentVarY = currentHeaders[1];
            selectVarX.value = currentVarX;
            selectVarY.value = currentVarY;
        } else {
            variablesSelectorBlock.style.display = 'none';
            currentVarX = currentHeaders[0] || "";
            currentVarY = currentHeaders[0] || "";
        }

        updateDashboard();
    });
});

function populateVariableSelectors() {
    selectVarX.innerHTML = "";
    selectVarY.innerHTML = "";

    currentHeaders.forEach(header => {
        const optionX = document.createElement('option');
        optionX.value = header;
        optionX.innerText = header;
        selectVarX.appendChild(optionX);

        const optionY = document.createElement('option');
        optionY.value = header;
        optionY.innerText = header;
        selectVarY.appendChild(optionY);
    });
}

// Escuchadores de cambios en Variables
selectVarX.addEventListener('change', function() {
    currentVarX = this.value;
    displayTableRows();
    renderChart();
});

selectVarY.addEventListener('change', function() {
    currentVarY = this.value;
    displayTableRows();
    calculateMetrics();
    renderChart();
});

// Escuchadores de cambios en Rango de Slicing
rangeStart.addEventListener('change', function() {
    let val = parseInt(this.value);
    const maxVal = globalData.length;
    if (isNaN(val) || val < 1) {
        val = 1;
    } else if (val > maxVal) {
        val = maxVal;
    }
    this.value = val;
    
    // Forzar consistencia: start <= end
    let endVal = parseInt(rangeEnd.value);
    if (val > endVal) {
        rangeEnd.value = val;
        sliceEnd = val;
    }
    sliceStart = val;
    currentPage = 1;
    updateDashboard();
});

rangeEnd.addEventListener('change', function() {
    let val = parseInt(this.value);
    const maxVal = globalData.length;
    if (isNaN(val) || val < 1) {
        val = 1;
    } else if (val > maxVal) {
        val = maxVal;
    }
    this.value = val;
    
    // Forzar consistencia: start <= end
    let startVal = parseInt(rangeStart.value);
    if (val < startVal) {
        rangeStart.value = val;
        sliceStart = val;
    }
    sliceEnd = val;
    currentPage = 1;
    updateDashboard();
});


// --- 5. RENDERIZADO DE LA TABLA CON PAGINACIÓN ---
function displayTableRows() {
    tableBody.innerHTML = "";
    
    // Cambiar cabeceras de la tabla descriptiva de forma dinámica
    const thElements = document.querySelectorAll('.table-block table thead th');
    if (thElements.length >= 2 && currentVarX && currentVarY) {
        thElements[0].innerText = currentVarX;
        thElements[1].innerText = currentVarY;
    }

    const activeData = getActiveData();
    if (activeData.length === 0) return;

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedItems = activeData.slice(start, end);

    recordsIndicator.innerText = `Mostrando ${start + 1} a ${Math.min(end, activeData.length)} de ${activeData.length.toLocaleString()}`;

    paginatedItems.forEach((row) => {
        const valX = row[currentVarX];
        const valY = row[currentVarY];

        const formattedX = typeof valX === 'number' ? valX.toFixed(2) : valX;
        const formattedY = typeof valY === 'number' ? valY.toFixed(2) : valY;

        const rowHTML = `<tr>
            <td>${formattedX ?? '—'}</td>
            <td>${formattedY ?? '—'}</td>
        </tr>`;
        tableBody.innerHTML += rowHTML;
    });

    renderPaginationControls();
}

function renderPaginationControls() {
    tablePagination.innerHTML = "";
    const activeData = getActiveData();
    const totalPages = Math.ceil(activeData.length / rowsPerPage);
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = "page-btn";
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => { currentPage--; displayTableRows(); });
    tablePagination.appendChild(prevBtn);

    let pages = [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
    pages = [...new Set(pages)].filter(p => p > 0 && p <= totalPages).sort((a,b) => a-b);

    pages.forEach((page, index) => {
        if (index > 0 && page - pages[index - 1] > 1) {
            const dots = document.createElement('span');
            dots.innerText = "...";
            tablePagination.appendChild(dots);
        }
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${page === currentPage ? 'active' : ''}`;
        pageBtn.innerText = page;
        pageBtn.addEventListener('click', () => { currentPage = page; displayTableRows(); });
        tablePagination.appendChild(pageBtn);
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = "page-btn";
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => { currentPage++; displayTableRows(); });
    tablePagination.appendChild(nextBtn);
}


// --- 6. PROCESADOR MATEMÁTICO DESCRIPTIVO ---
function calculateMetrics() {
    const activeData = getActiveData();
    document.getElementById('kpi-total').innerText = activeData.length.toLocaleString();

    if (activeData.length === 0 || !currentVarY) return;

    const dataVector = activeData.map(row => row[currentVarY]).filter(val => typeof val === 'number');
    const N = dataVector.length;

    if (N === 0) return;

    // A. Media
    const sum = dataVector.reduce((a, b) => a + b, 0);
    const media = sum / N;
    document.getElementById('kpi-media').innerText = media.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // B. Mediana
    const sorted = [...dataVector].sort((a, b) => a - b);
    const half = Math.floor(N / 2);
    const mediana = N % 2 !== 0 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
    document.getElementById('kpi-mediana').innerText = mediana.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // C. Moda
    const freq = {};
    let maxFreq = 0;
    let moda = sorted[0];
    dataVector.forEach(val => {
        freq[val] = (freq[val] || 0) + 1;
        if (freq[val] > maxFreq) { maxFreq = freq[val]; moda = val; }
    });
    document.getElementById('kpi-moda').innerText = Number(moda).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // D. Varianza Poblacional
    const avgSquareDiff = dataVector.reduce((sum, val) => sum + Math.pow(val - media, 2), 0);
    const varianza = avgSquareDiff / N;
    document.getElementById('kpi-varianza').innerText = varianza.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // E. Desviación Estándar
    const desviacion = Math.sqrt(varianza);
    document.getElementById('kpi-desviacion').innerText = desviacion.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    generateInsights(currentVarY, media, mediana, desviacion);
}


// --- 7. GENERADOR DE INSIGHTS AUTOMÁTICOS ---
function generateInsights(variableName, media, mediana, desviacion) {
    insightContainer.innerHTML = "";

    let skewText = `La distribución de la variable ${variableName} presenta un comportamiento simétrico estable.`;
    if (media > mediana + 0.2) {
        skewText = `La media métrica está por encima de la mediana, reflejando un sesgo positivo hacia el extremo derecho de la muestra.`;
    } else if (media < mediana - 0.2) {
        skewText = `Se detecta un sesgo hacia la izquierda de la muestra de datos, indicando concentraciones en rangos inferiores.`;
    }

    const insights = [
        skewText,
        `La dispersión estándar calculada en base a los registros válidos de la variable ${variableName} es de ${desviacion.toFixed(2)} unidades.`,
        `Rango de densidad normal (68% de las muestras procesadas): Ocurre entre ${(media - desviacion).toFixed(2)} y ${(media + desviacion).toFixed(2)}.`
    ];

    insights.forEach(text => {
        insightContainer.innerHTML += `
            <div class="insight-item">
                <i class="fa-solid fa-circle-check text-green"></i>
                <p>${text}</p>
            </div>
        `;
    });
}


// --- 8. RENDERIZADOR DE GRÁFICO PERSONALIZABLE (CHART.JS) ---

// Plugin personalizado para dibujar líneas de referencia / bandas correspondientes a los KPIs en el gráfico descriptivo
const kpiLinePlugin = {
    id: 'kpiLinePlugin',
    afterDraw: (chart) => {
        const activeData = getActiveData();
        if (activeData.length === 0 || !currentVarY) return;
        const activeKpi = document.querySelector('.kpi-card.active');
        if (!activeKpi) return;
        const metric = activeKpi.getAttribute('data-metric');
        if (!metric) return; 

        // Leer valor del DOM
        const valText = document.getElementById(`kpi-${metric}`).innerText.replace(/,/g, '');
        const value = parseFloat(valText);
        if (isNaN(value)) return;

        const { ctx, chartArea: { top, bottom, left, right }, scales: { x, y } } = chart;
        ctx.save();

        // 1. Determinar el color dinámico heredado del botón superior (Teal/Turquesa exacto para desviación/varianza)
        let metricColor = '#ef4444'; // fallback rojo
        if (metric === 'media') metricColor = '#0284c7';
        else if (metric === 'mediana') metricColor = '#22c55e';
        else if (metric === 'moda') metricColor = '#f97316';
        else if (metric === 'desviacion' || metric === 'varianza') metricColor = '#14b8a6';

        // 2. Calcular progreso temporal de dibujo (gradual)
        const elapsed = Date.now() - chartRenderStartTime;
        const progress = Math.min(1, elapsed / 800); // 800ms coincide con animaciones

        // Si la animación no ha completado, solicitamos nuevo frame
        if (progress < 1) {
            requestAnimationFrame(() => {
                if (chart.ctx) chart.draw();
            });
        }

        ctx.strokeStyle = metricColor;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);

        if (currentChartType === 'histogram') {
            // Dibujar línea vertical de KPI gradualmente
            if (value >= histogramMin && value <= histogramMax) {
                const pct = (value - histogramMin) / ((histogramMax - histogramMin) || 1);
                const pixelX = left + pct * (right - left);
                const currentBottom = bottom - progress * (bottom - top);

                ctx.beginPath();
                ctx.moveTo(pixelX, bottom);
                ctx.lineTo(pixelX, currentBottom);
                ctx.stroke();

                // Fade in del label
                ctx.globalAlpha = progress;
                ctx.fillStyle = metricColor;
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`${activeKpi.querySelector('.kpi-info span').innerText}: ${value.toFixed(2)}`, pixelX + 6, top + 15);
            }
        } else if (currentChartType === 'boxplot') {
            // 1. Dibujar línea blanca de la Mediana
            const dataVectorY = activeData.map(row => typeof row[currentVarY] === 'number' ? row[currentVarY] : parseFloat(row[currentVarY])).filter(val => !isNaN(val));
            if (dataVectorY.length > 0) {
                const sorted = [...dataVectorY].sort((a, b) => a - b);
                const getPct = (p) => {
                    const idx = (sorted.length - 1) * p;
                    const lower = Math.floor(idx);
                    const upper = Math.ceil(idx);
                    const w = idx - lower;
                    return sorted[lower] * (1 - w) + sorted[upper] * w;
                };
                const medVal = getPct(0.5);
                const medianX = x.getPixelForValue(medVal);
                
                const yCenter = (bottom + top) / 2;
                const boxHalfHeight = 45 / 2;
                
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.moveTo(medianX, yCenter - boxHalfHeight);
                ctx.lineTo(medianX, yCenter + boxHalfHeight);
                ctx.stroke();
            }

            // 2. Dibujar línea vertical de referencia gradualmente
            const pixelX = x.getPixelForValue(value);
            const currentBottom = bottom - progress * (bottom - top);

            ctx.beginPath();
            ctx.moveTo(pixelX, bottom);
            ctx.lineTo(pixelX, currentBottom);
            ctx.stroke();

            ctx.globalAlpha = progress;
            ctx.fillStyle = metricColor;
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${activeKpi.querySelector('.kpi-info span').innerText}: ${value.toFixed(2)}`, pixelX + 6, top + 15);

        } else if (currentChartType === 'scatter' || currentChartType === 'line') {
            // Dibujar líneas/franjas en eje Y
            if (metric === 'media' || metric === 'mediana' || metric === 'moda') {
                const pixelY = y.getPixelForValue(value);
                const currentRight = left + progress * (right - left);

                ctx.beginPath();
                ctx.moveTo(left, pixelY);
                ctx.lineTo(currentRight, pixelY);
                ctx.stroke();

                ctx.globalAlpha = progress;
                ctx.fillStyle = metricColor;
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`${activeKpi.querySelector('.kpi-info span').innerText}: ${value.toFixed(2)}`, left + 10, pixelY - 6);
            } else if (metric === 'desviacion' || metric === 'varianza') {
                const meanVal = parseFloat(document.getElementById('kpi-media').innerText.replace(/,/g, ''));
                const devVal = parseFloat(document.getElementById('kpi-desviacion').innerText.replace(/,/g, ''));
                if (!isNaN(meanVal) && !isNaN(devVal)) {
                    const yTop = y.getPixelForValue(meanVal + devVal);
                    const yBottom = y.getPixelForValue(meanVal - devVal);

                    // Sombreado de desviación estándar gradual (animando opacidad)
                    ctx.globalAlpha = progress * 0.12;
                    ctx.fillStyle = metricColor;
                    ctx.fillRect(left, Math.min(yTop, yBottom), right - left, Math.abs(yTop - yBottom));

                    // Límites graduales
                    ctx.globalAlpha = progress;
                    ctx.strokeStyle = metricColor;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 4]);
                    
                    const currentRight = left + progress * (right - left);
                    ctx.beginPath();
                    ctx.moveTo(left, yTop); ctx.lineTo(currentRight, yTop);
                    ctx.moveTo(left, yBottom); ctx.lineTo(currentRight, yBottom);
                    ctx.stroke();

                    ctx.fillStyle = metricColor;
                    ctx.font = 'bold 11px sans-serif';
                    ctx.fillText(`Desv. Estándar (±1σ): ${(meanVal - devVal).toFixed(2)} a ${(meanVal + devVal).toFixed(2)}`, left + 10, Math.min(yTop, yBottom) + 16);
                }
            }
        }
        ctx.restore();
    }
};

function renderChart() {
    if (activeChart) activeChart.destroy();
    const activeData = getActiveData();
    if (activeData.length === 0 || !currentVarX || !currentVarY) return;

    const dataVectorY = activeData.map(row => typeof row[currentVarY] === 'number' ? row[currentVarY] : parseFloat(row[currentVarY])).filter(val => !isNaN(val));
    const dataVectorX = activeData.map(row => typeof row[currentVarX] === 'number' ? row[currentVarX] : parseFloat(row[currentVarX])).filter(val => !isNaN(val));

    if (dataVectorY.length === 0) return;

    // Resetear marca de tiempo de dibujo
    chartRenderStartTime = Date.now();

    // Mapeo dinámico y descriptivo de la leyenda del dataset basado en el KPI activo
    const kpiLabelMap = {
        media:     'Línea Base: Media',
        mediana:   'Umbral: Mediana',
        moda:      'Moda Predominante',
        desviacion:'Banda: Desv. Estándar',
        varianza:  'Banda: Varianza (±1σ)',
        default:   'Distribución de Datos'
    };

    const activeKpi = document.querySelector('.kpi-card.active');
    const metric = activeKpi ? activeKpi.getAttribute('data-metric') : 'default';
    const datasetLabel = kpiLabelMap[metric] || kpiLabelMap['default'];

    let chartData = {};
    let config = {
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animations: {
                y: { from: ctx.canvas.clientHeight, duration: 800, easing: 'easeOutBack' },
                opacity: { from: 0, to: 1, duration: 600 }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            }
        },
        plugins: [kpiLinePlugin]
    };

    if (currentChartType === 'scatter') {
        const scatterPoints = activeData.map(row => ({
            x: typeof row[currentVarX] === 'number' ? row[currentVarX] : parseFloat(row[currentVarX]),
            y: typeof row[currentVarY] === 'number' ? row[currentVarY] : parseFloat(row[currentVarY])
        })).filter(pt => !isNaN(pt.x) && !isNaN(pt.y));

        config.type = 'scatter';
        chartData = {
            datasets: [{
                label: `${datasetLabel} (${currentVarY} vs ${currentVarX})`,
                data: scatterPoints,
                backgroundColor: 'rgba(37, 99, 235, 0.7)',
                borderColor: '#2563eb',
                pointRadius: 6,
                hoverRadius: 8
            }]
        };
        config.options.scales = {
            x: { title: { display: true, text: currentVarX, font: { weight: 'bold' } } },
            y: { title: { display: true, text: currentVarY, font: { weight: 'bold' } } }
        };

    } else if (currentChartType === 'line') {
        config.type = 'line';
        chartData = {
            labels: dataVectorX.length > 0 ? dataVectorX : Array.from({length: dataVectorY.length}, (_, i) => i + 1),
            datasets: [{
                label: datasetLabel,
                data: dataVectorY,
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                fill: true,
                tension: 0.2,
                pointRadius: 3
            }]
        };
        config.options.scales = {
            x: { title: { display: true, text: currentVarX || 'Índice', font: { weight: 'bold' } } },
            y: { title: { display: true, text: currentVarY, font: { weight: 'bold' } } }
        };

    } else if (currentChartType === 'histogram') {
        const min = Math.min(...dataVectorY);
        const max = Math.max(...dataVectorY);
        histogramMin = min;
        histogramMax = max;
        
        const binCount = 10;
        const binWidth = (max - min) / binCount || 1;
        const bins = Array.from({length: binCount}, () => 0);
        const labels = [];

        for (let i = 0; i < binCount; i++) {
            const start = min + i * binWidth;
            const end = start + binWidth;
            labels.push(`${start.toFixed(1)} - ${end.toFixed(1)}`);
        }

        dataVectorY.forEach(val => {
            let binIdx = Math.floor((val - min) / binWidth);
            if (binIdx >= binCount) binIdx = binCount - 1;
            if (binIdx < 0) binIdx = 0;
            bins[binIdx]++;
        });

        config.type = 'bar';
        chartData = {
            labels: labels,
            datasets: [{
                label: datasetLabel,
                data: bins,
                backgroundColor: 'rgba(16, 185, 129, 0.75)',
                borderColor: '#10b981',
                borderWidth: 1.5,
                barPercentage: 0.95,
                categoryPercentage: 0.95
            }]
        };

        config.options.scales = {
            x: { title: { display: true, text: `Intervalos de ${currentVarY}`, font: { weight: 'bold' } } },
            y: { title: { display: true, text: 'Frecuencia (Cantidad)', font: { weight: 'bold' } } }
        };
        config.options.scales.x.grid = { display: false };

    } else if (currentChartType === 'boxplot') {
        const sorted = [...dataVectorY].sort((a, b) => a - b);
        const minVal = sorted[0];
        const maxVal = sorted[sorted.length - 1];
        
        const getPct = (p) => {
            const idx = (sorted.length - 1) * p;
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            const w = idx - lower;
            return sorted[lower] * (1 - w) + sorted[upper] * w;
        };

        const q1 = getPct(0.25);
        const q3 = getPct(0.75);

        config.type = 'bar';
        chartData = {
            labels: ['Variable Analizada'],
            datasets: [
                {
                    label: 'Rango Total (Min a Max)',
                    data: [[minVal, maxVal]],
                    backgroundColor: 'rgba(148, 163, 184, 0.25)',
                    borderColor: '#64748b',
                    borderWidth: 1.5,
                    barThickness: 8,
                    grouped: false
                },
                {
                    label: datasetLabel,
                    data: [[q1, q3]],
                    backgroundColor: 'rgba(124, 58, 237, 1)', 
                    borderColor: '#7c3aed',
                    borderWidth: 2,
                    barThickness: 45,
                    grouped: false
                }
            ]
        };

        config.options.indexAxis = 'y'; // Caja horizontal
        config.options.scales = {
            x: { 
                title: { display: true, text: `Valores de ${currentVarY}`, font: { weight: 'bold' } },
                suggestedMin: minVal - (maxVal - minVal) * 0.1,
                suggestedMax: maxVal + (maxVal - minVal) * 0.1
            },
            y: {
                grid: { display: false }
            }
        };
    }

    config.data = chartData;
    activeChart = new Chart(ctx, config);

    const chartBlock = document.querySelector('.chart-block');
    chartBlock.classList.add('chart-update-flash');
    setTimeout(() => chartBlock.classList.remove('chart-update-flash'), 1000);
}

// Configuración de la botonera inferior
function updateChartButtons() {
    optionsButtonsContainer.innerHTML = "";
    
    const options = [
        { type: 'scatter', name: 'Dispersión Relacional' },
        { type: 'line', name: 'Línea de Tendencia' },
        { type: 'histogram', name: 'Histograma' },
        { type: 'boxplot', name: 'Caja y Bigotes' }
    ];

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = `opt-btn ${currentChartType === opt.type ? 'active' : ''}`;
        btn.setAttribute('data-chart-type', opt.type);
        btn.innerText = opt.name;
        btn.addEventListener('click', function() {
            document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentChartType = opt.type;
            
            // Cambiar titulo descriptivo
            const activeKpi = document.querySelector('.kpi-card.active');
            const kpiName = activeKpi ? activeKpi.querySelector('.kpi-info span').innerText : "Total";
            chartTitle.innerText = `Visualización: ${opt.name} (${kpiName})`;
            
            renderChart();
        });
        optionsButtonsContainer.appendChild(btn);
    });
}


// --- 9. ACTUALIZADOR MAESTRO ---
function updateDashboard() {
    displayTableRows();
    calculateMetrics();
    updateChartButtons();
    renderChart();
}

// Escucha de clics en KPIs
kpiButtons.forEach(button => {
    button.addEventListener('click', function(e) {
        document.querySelector('.kpi-card.active').classList.remove('active');
        this.classList.add('active');

        const metricName = this.querySelector('.kpi-info span').innerText;
        chartTitle.innerText = `Visualización: Enfoque en variable analítica - ${metricName}`;
        
        // Lanzar efecto de estela de partículas
        createColorTrail(e, this);

        renderChart();
    });
});


// --- 10. MÓDULO DE PROBABILIDAD (LÓGICA MATEMÁTICA Y FORMULARIOS) ---

const probTabInputs = {
    combinatoria: `
        <div class="input-group">
            <label>Tipo de Operación</label>
            <select id="comb-type" class="large-select" style="padding: 10px; width: 100%;">
                <option value="permutacion">Permutación — P<sub>n</sub></option>
                <option value="combinacion" selected>Combinación — C<sub>n</sub><sup>k</sup></option>
                <option value="variacion">Variación — V<sub>n</sub><sup>k</sup></option>
            </select>
        </div>
        <div class="form-row-double margin-top-20">
            <div class="input-group">
                <label>Elementos en el Conjunto (n)</label>
                <input type="number" id="comb-n" value="5" min="1" max="50">
            </div>
            <div class="input-group" id="comb-k-group">
                <label>Elementos Seleccionados (k)</label>
                <input type="number" id="comb-k" value="3" min="0" max="50">
            </div>
        </div>
    `,
    simple: `
        <div class="input-group">
            <label>Casos Favorables (f)</label>
            <input type="number" id="prob-simple-f" value="5" min="0" placeholder="Ej. 5">
        </div>
        <div class="input-group margin-top-20">
            <label>Casos Posibles Totales (N)</label>
            <input type="number" id="prob-simple-n" value="20" min="1" placeholder="Ej. 20">
        </div>
    `,
    condicional: `
        <div class="input-group">
            <label>Probabilidad de que ocurra B: P(B)</label>
            <input type="number" id="prob-cond-b" value="0.50" min="0.0001" max="1" step="0.01" placeholder="Ej. 0.50">
        </div>
        <div class="input-group margin-top-20">
            <label>Probabilidad Conjunta: P(A ∩ B)</label>
            <input type="number" id="prob-cond-joint" value="0.20" min="0" max="1" step="0.01" placeholder="Ej. 0.20">
        </div>
    `,
    bayes: `
        <div class="input-group">
            <label>Probabilidad A Priori: P(A)</label>
            <input type="number" id="prob-bayes-prior" value="0.01" min="0" max="1" step="0.001" placeholder="Ej. 0.01">
        </div>
        <div class="input-group margin-top-20">
            <label>Sensibilidad (Verdadero Positivo): P(B|A)</label>
            <input type="number" id="prob-bayes-sens" value="0.95" min="0" max="1" step="0.01" placeholder="Ej. 0.95">
        </div>
        <div class="input-group margin-top-20">
            <label>Tasa de Falsos Positivos: P(B|A<sup>c</sup>)</label>
            <input type="number" id="prob-bayes-fp" value="0.05" min="0" max="1" step="0.01" placeholder="Ej. 0.05">
        </div>
    `
};

// Factorial helper
function factorial(num) {
    if (num < 0) return 0;
    if (num === 0 || num === 1) return 1;
    let result = 1;
    for (let i = 2; i <= num; i++) result *= i;
    return result;
}

// Genera los elementos del Espacio Muestral (Ω) limitándolos a 50 para rendimiento
function getOmegaElements(type, n, k) {
    const letters = "ABCDEFGHIJKLMOPQRSTUVWXYZ".split("");
    const elements = letters.slice(0, n);
    if (n > letters.length) {
        elements.length = 0;
        for (let i = 1; i <= n; i++) elements.push(i.toString());
    }
    
    let result = [];
    
    if (type === 'permutacion') {
        function permute(arr, memo = []) {
            if (result.length >= 50) return;
            if (arr.length === 0) {
                result.push(`(${memo.join("")})`);
                return;
            }
            for (let i = 0; i < arr.length; i++) {
                let curr = arr.slice();
                let next = curr.splice(i, 1);
                permute(curr.slice(), memo.concat(next));
            }
        }
        permute(elements);
    } else if (type === 'combinacion') {
        function combine(start, memo = []) {
            if (result.length >= 50) return;
            if (memo.length === k) {
                result.push(`(${memo.join(",")})`);
                return;
            }
            for (let i = start; i < elements.length; i++) {
                combine(i + 1, memo.concat(elements[i]));
            }
        }
        combine(0);
    } else if (type === 'variacion') {
        function vary(memo = []) {
            if (result.length >= 50) return;
            if (memo.length === k) {
                result.push(`(${memo.join(",")})`);
                return;
            }
            for (let i = 0; i < elements.length; i++) {
                if (!memo.includes(elements[i])) {
                    vary(memo.concat(elements[i]));
                }
            }
        }
        vary();
    }
    return result;
}

// Actualiza de manera interactiva la fórmula y sus variables internas en tiempo real
function updateInteractiveFormula() {
    const display = document.getElementById('prob-formula-display');
    if (!display) return;

    if (activeProbTab === 'combinatoria') {
        const typeEl = document.getElementById('comb-type');
        if (!typeEl) return;
        const type = typeEl.value;
        const nVal = parseInt(document.getElementById('comb-n').value) || 0;
        const kInput = document.getElementById('comb-k');
        const kVal = kInput ? (parseInt(kInput.value) || 0) : 0;

        if (type === 'permutacion') {
            display.innerHTML = `P<sub>${nVal}</sub> = n! = ${nVal}!`;
        } else if (type === 'combinacion') {
            display.innerHTML = `C<sub>${nVal}</sub><sup>${kVal}</sup> = <sup>n!</sup>&frasl;<sub>k!(n-k)!</sub> = <sup>${nVal}!</sup>&frasl;<sub>${kVal}!(${nVal}-${kVal})!</sub>`;
        } else if (type === 'variacion') {
            display.innerHTML = `V<sub>${nVal}</sub><sup>${kVal}</sup> = <sup>n!</sup>&frasl;<sub>(n-k)!</sub> = <sup>${nVal}!</sup>&frasl;<sub>(${nVal}-${kVal})!</sub>`;
        }
    } else if (activeProbTab === 'simple') {
        const fValText = document.getElementById('prob-simple-f') ? document.getElementById('prob-simple-f').value : "0";
        const nValText = document.getElementById('prob-simple-n') ? document.getElementById('prob-simple-n').value : "0";
        display.innerHTML = `P(A) = <sup>f</sup>&frasl;<sub>N</sub> = <sup>${fValText}</sup>&frasl;<sub>${nValText}</sub>`;
    } else if (activeProbTab === 'condicional') {
        const pbValText = document.getElementById('prob-cond-b') ? document.getElementById('prob-cond-b').value : "0";
        const jointValText = document.getElementById('prob-cond-joint') ? document.getElementById('prob-cond-joint').value : "0";
        display.innerHTML = `P(A | B) = <sup>P(A &cap; B)</sup>&frasl;<sub>P(B)</sub> = <sup>${jointValText}</sup>&frasl;<sub>${pbValText}</sub>`;
    } else if (activeProbTab === 'bayes') {
        const priorValText = document.getElementById('prob-bayes-prior') ? document.getElementById('prob-bayes-prior').value : "0";
        const sensValText = document.getElementById('prob-bayes-sens') ? document.getElementById('prob-bayes-sens').value : "0";
        const fpValText = document.getElementById('prob-bayes-fp') ? document.getElementById('prob-bayes-fp').value : "0";

        const prior = parseFloat(priorValText) || 0;
        const fp = parseFloat(fpValText) || 0;
        const compPrior = (1 - prior).toFixed(3);

        display.innerHTML = `P(A|B) = <sup>P(B|A)P(A)</sup>&frasl;<sub>P(B|A)P(A) + P(B|A<sup>c</sup>)P(A<sup>c</sup>)</sub> = <sup>${sensValText}&times;${priorValText}</sup>&frasl;<sub>${sensValText}&times;${priorValText} + ${fpValText}&times;${compPrior}</sub>`;
    }
}

// Renderizar entradas de la pestaña activa en probabilidad
function loadProbabilityForm() {
    probDynamicInputs.innerHTML = probTabInputs[activeProbTab];
    
    // Cambiar texto descriptivo de la pestaña e interactividad exclusiva de combinatoria
    if (activeProbTab === 'combinatoria') {
        probInstruction.innerText = "Calcula la permutación, combinación o variación de un conjunto:";
        
        const combType = document.getElementById('comb-type');
        const kGroup = document.getElementById('comb-k-group');
        
        const toggleKInput = () => {
            if (combType.value === 'permutacion') {
                kGroup.style.display = 'none';
            } else {
                kGroup.style.display = 'block';
            }
        };
        
        combType.addEventListener('change', () => {
            toggleKInput();
            updateInteractiveFormula();
        });
        toggleKInput();
    } else if (activeProbTab === 'simple') {
        probInstruction.innerText = "Determina la razón matemática de un evento elemental:";
    } else if (activeProbTab === 'condicional') {
        probInstruction.innerText = "Calcula la probabilidad de A condicionado a que ya ocurrió B:";
    } else {
        probInstruction.innerText = "Actualiza las probabilidades a priori basándote en nueva evidencia:";
    }

    // Inicializar la fórmula interactiva
    updateInteractiveFormula();
}

// Escucha clics en pestañas de probabilidad
probTabs.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        probTabs.querySelector('.tab.active').classList.remove('active');
        this.classList.add('active');
        activeProbTab = this.getAttribute('data-tab');
        loadProbabilityForm();
        
        // Reset result box
        probResultBox.className = "result-box large-result";
        probResultBox.style.borderLeftColor = "#e2e8f0";
        probResultBox.style.backgroundColor = "#f8fafc";
        probResultBox.style.color = "#475569";
        probResultBox.innerHTML = "<p>El resultado matemático calculado aparecerá tabulado en esta sección tras ejecutar la operación del panel izquierdo.</p>";
    });
});

// Escuchar cambios de inputs para la sustitución de fórmulas en tiempo real (Event delegation)
probDynamicInputs.addEventListener('input', updateInteractiveFormula);
probDynamicInputs.addEventListener('change', updateInteractiveFormula);

// Realizar cálculos reales al pulsar el botón
btnCalculateProb.addEventListener('click', function() {
    let resultHTML = "";

    if (activeProbTab === 'combinatoria') {
        const type = document.getElementById('comb-type').value;
        const n = parseInt(document.getElementById('comb-n').value);
        const kInput = document.getElementById('comb-k');
        const k = kInput ? parseInt(kInput.value) : 0;

        if (isNaN(n) || n < 1 || n > 50) {
            alert("Por favor ingresa un valor de n entre 1 y 50.");
            return;
        }
        if (type !== 'permutacion' && (isNaN(k) || k < 0 || k > n)) {
            alert("El valor de k debe estar entre 0 y n.");
            return;
        }

        let result = 0;
        let formulaName = "";
        let stepsHTML = "";

        if (type === 'permutacion') {
            result = factorial(n);
            formulaName = `Permutación (P<sub>${n}</sub>)`;
            stepsHTML = `
                <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Fórmula:</td><td style="text-align: right; font-family: monospace;">P<sub>n</sub> = n!</td></tr>
                <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Sustitución:</td><td style="text-align: right;">${n}!</td></tr>
            `;
        } else if (type === 'combinacion') {
            result = factorial(n) / (factorial(k) * factorial(n - k));
            formulaName = `Combinación (C<sub>${n}</sub><sup>${k}</sup>)`;
            stepsHTML = `
                <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Fórmula:</td><td style="text-align: right; font-family: monospace;">C<sub>n</sub><sup>k</sup> = n! / (k! &times; (n - k)!)</td></tr>
                <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Sustitución:</td><td style="text-align: right;">${n}! / (${k}! &times; ${n - k}!)</td></tr>
            `;
        } else if (type === 'variacion') {
            result = factorial(n) / factorial(n - k);
            formulaName = `Variación (V<sub>${n}</sub><sup>${k}</sup>)`;
            stepsHTML = `
                <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Fórmula:</td><td style="text-align: right; font-family: monospace;">V<sub>n</sub><sup>k</sup> = n! / (n - k)!</td></tr>
                <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Sustitución:</td><td style="text-align: right;">${n}! / ${n - k}!</td></tr>
            `;
        }

        const omegaElements = getOmegaElements(type, n, k);

        resultHTML = `
            <div style="width: 100%;">
                <h4 style="color: #14532d; font-size: 18px; margin-bottom: 12px; font-weight: 700;">
                    Resultado: ${formulaName}
                </h4>
                <div style="font-size: 32px; font-weight: 800; color: #16a34a; margin-bottom: 16px;">
                    ${result.toLocaleString()}
                </div>
                <table style="width: 100%; border-top: 1px solid #dcfce7; margin-top: 10px;">
                    ${stepsHTML}
                    <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Tamaño de Omega |Ω|:</td><td style="text-align: right; font-weight: bold;">${result.toLocaleString()}</td></tr>
                </table>
                <div style="margin-top: 14px; background: rgba(255,255,255,0.6); padding: 10px; border-radius: 6px; border: 1px solid #dcfce7; max-height: 120px; overflow-y: auto;">
                    <strong style="font-size: 12px; color: #16a34a; display: block; margin-bottom: 4px;">Estructura del Espacio Muestral (Ω) (Max. 50):</strong>
                    <span style="font-family: monospace; font-size: 13px; color: #15803d; word-break: break-all;">
                        { ${omegaElements.join(", ")}${result > omegaElements.length ? ", ..." : ""} }
                    </span>
                </div>
            </div>
        `;
        probResultBox.style.borderLeftColor = "#16a34a";
        probResultBox.style.backgroundColor = "#f0fdf4";
        probResultBox.style.color = "#14532d";

    } else if (activeProbTab === 'simple') {
        const f = parseInt(document.getElementById('prob-simple-f').value);
        const n = parseInt(document.getElementById('prob-simple-n').value);

        if (isNaN(f) || isNaN(n) || f < 0 || n <= 0) {
            alert("Por favor ingresa valores válidos. N debe ser mayor que 0.");
            return;
        }
        if (f > n) {
            alert("Los casos favorables no pueden superar a los casos posibles.");
            return;
        }

        const prob = f / n;
        const comp = 1 - prob;
        const odds = comp > 0 ? (prob / comp).toFixed(3) : '∞';

        resultHTML = `
            <div style="width: 100%;">
                <h4 style="color: #14532d; font-size: 18px; margin-bottom: 12px; font-weight: 700;">
                    Resultado: Probabilidad Simple P(A)
                </h4>
                <div style="font-size: 32px; font-weight: 800; color: #16a34a; margin-bottom: 16px;">
                    ${(prob * 100).toFixed(2)}% <span style="font-size: 16px; font-weight: 500; color: #15803d;">(${prob.toFixed(4)})</span>
                </div>
                <table style="width: 100%; border-top: 1px solid #dcfce7; margin-top: 10px;">
                    <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Fórmula Utilizada:</td><td style="text-align: right; font-family: monospace;">P(A) = f / N</td></tr>
                    <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Casos Evaluados:</td><td style="text-align: right;">${f} favorables de ${n} posibles</td></tr>
                    <tr style="border-bottom: 1px solid #dcfce7;"><td style="font-weight: 600; padding: 8px 0;">Probabilidad Complemento P(A<sup>c</sup>):</td><td style="text-align: right;">${(comp * 100).toFixed(2)}%</td></tr>
                    <tr><td style="font-weight: 600; padding: 8px 0;">Odds Favorables:</td><td style="text-align: right;">${odds} a 1</td></tr>
                </table>
            </div>
        `;
        probResultBox.style.borderLeftColor = "#16a34a";
        probResultBox.style.backgroundColor = "#f0fdf4";
        probResultBox.style.color = "#14532d";

    } else if (activeProbTab === 'condicional') {
        const pb = parseFloat(document.getElementById('prob-cond-b').value);
        const joint = parseFloat(document.getElementById('prob-cond-joint').value);

        if (isNaN(pb) || isNaN(joint) || pb <= 0 || pb > 1 || joint < 0 || joint > 1) {
            alert("Por favor ingresa probabilidades válidas entre 0 y 1. P(B) debe ser mayor que 0.");
            return;
        }
        if (joint > pb) {
            alert("La probabilidad conjunta P(A ∩ B) no puede ser mayor que P(B).");
            return;
        }

        const pAcondB = joint / pb;
        const pComplementAcondB = 1 - pAcondB;

        resultHTML = `
            <div style="width: 100%;">
                <h4 style="color: #1e3a8a; font-size: 18px; margin-bottom: 12px; font-weight: 700;">
                    Resultado: Probabilidad Condicional P(A | B)
                </h4>
                <div style="font-size: 32px; font-weight: 800; color: #2563eb; margin-bottom: 16px;">
                    ${(pAcondB * 100).toFixed(2)}% <span style="font-size: 16px; font-weight: 500; color: #1d4ed8;">(${pAcondB.toFixed(4)})</span>
                </div>
                <table style="width: 100%; border-top: 1px solid #dbeafe; margin-top: 10px;">
                    <tr style="border-bottom: 1px solid #dbeafe;"><td style="font-weight: 600; padding: 8px 0;">Fórmula:</td><td style="text-align: right; font-family: monospace;">P(A | B) = P(A ∩ B) / P(B)</td></tr>
                    <tr style="border-bottom: 1px solid #dbeafe;"><td style="font-weight: 600; padding: 8px 0;">Probabilidad de B:</td><td style="text-align: right;">${(pb*100).toFixed(1)}%</td></tr>
                    <tr style="border-bottom: 1px solid #dbeafe;"><td style="font-weight: 600; padding: 8px 0;">Prob. Conjunta P(A ∩ B):</td><td style="text-align: right;">${(joint*100).toFixed(1)}%</td></tr>
                    <tr><td style="font-weight: 600; padding: 8px 0;">P(A<sup>c</sup> | B):</td><td style="text-align: right;">${(pComplementAcondB*100).toFixed(2)}%</td></tr>
                </table>
            </div>
        `;
        probResultBox.style.borderLeftColor = "#2563eb";
        probResultBox.style.backgroundColor = "#eff6ff";
        probResultBox.style.color = "#1e3a8a";

    } else if (activeProbTab === 'bayes') {
        const prior = parseFloat(document.getElementById('prob-bayes-prior').value);
        const sens = parseFloat(document.getElementById('prob-bayes-sens').value);
        const fp = parseFloat(document.getElementById('prob-bayes-fp').value);

        if (isNaN(prior) || isNaN(sens) || isNaN(fp) || prior < 0 || prior > 1 || sens < 0 || sens > 1 || fp < 0 || fp > 1) {
            alert("Por favor ingresa probabilidades válidas entre 0 y 1.");
            return;
        }

        const compPrior = 1 - prior;
        const totalB = (sens * prior) + (fp * compPrior);
        const posterior = totalB > 0 ? (sens * prior) / totalB : 0;

        resultHTML = `
            <div style="width: 100%;">
                <h4 style="color: #581c87; font-size: 18px; margin-bottom: 12px; font-weight: 700;">
                    Resultado Posterior Teorema de Bayes: P(A | B)
                </h4>
                <div style="font-size: 32px; font-weight: 800; color: #7c3aed; margin-bottom: 16px;">
                    ${(posterior * 100).toFixed(2)}% <span style="font-size: 16px; font-weight: 500; color: #6d28d9;">(${posterior.toFixed(5)})</span>
                </div>
                <table style="width: 100%; border-top: 1px solid #f3e8ff; margin-top: 10px;">
                    <tr style="border-bottom: 1px solid #f3e8ff;"><td style="font-weight: 600; padding: 6px 0;">P(B) Evidencia Total:</td><td style="text-align: right;">${(totalB * 100).toFixed(2)}%</td></tr>
                    <tr style="border-bottom: 1px solid #f3e8ff;"><td style="font-weight: 600; padding: 6px 0;">A Priori P(A):</td><td style="text-align: right;">${(prior * 100).toFixed(2)}%</td></tr>
                    <tr style="border-bottom: 1px solid #f3e8ff;"><td style="font-weight: 600; padding: 6px 0;">Falso Negativo (1-Sens.):</td><td style="text-align: right;">${((1 - sens)*100).toFixed(1)}%</td></tr>
                    <tr><td style="font-weight: 600; padding: 6px 0;">P(A<sup>c</sup> | B<sup>c</sup>) (Verdadero Neg.):</td><td style="text-align: right;">${(((1-fp) * compPrior) / (1-totalB) * 100).toFixed(2)}%</td></tr>
                </table>
            </div>
        `;
        probResultBox.style.borderLeftColor = "#7c3aed";
        probResultBox.style.backgroundColor = "#faf5ff";
        probResultBox.style.color = "#581c87";
    }

    probResultBox.innerHTML = resultHTML;
    
    // Animar entrada del resultado
    probResultBox.style.animation = 'none';
    probResultBox.offsetHeight; // trigger reflow
    probResultBox.style.animation = 'letterWave 0.5s ease-out';
});


// --- 11. MÓDULO DE DISTRIBUCIONES (ENTRADAS DINÁMICAS Y DIBUJO DE CAMPANA) ---

const distTemplates = {
    normal: `
        <div class="form-row-double">
            <div class="input-group">
                <label>Media (μ)</label>
                <input type="number" id="dist-normal-mean" value="100" step="any">
            </div>
            <div class="input-group">
                <label>Desviación Estándar (σ)</label>
                <input type="number" id="dist-normal-std" value="15" min="0.0001" step="any">
            </div>
        </div>
    `,
    binomial: `
        <div class="form-row-double">
            <div class="input-group">
                <label>Ensayos (n)</label>
                <input type="number" id="dist-binomial-n" value="20" min="1" step="1">
            </div>
            <div class="input-group">
                <label>Probabilidad Éxito (p)</label>
                <input type="number" id="dist-binomial-p" value="0.4" min="0" max="1" step="0.05">
            </div>
        </div>
    `,
    poisson: `
        <div class="form-row-double">
            <div class="input-group">
                <label>Tasa de Ocurrencia (λ - Lambda)</label>
                <input type="number" id="dist-poisson-lambda" value="3" min="0.01" step="any">
            </div>
        </div>
    `
};

// Función de Poisson PMF
function poissonPMF(lambda, k) {
    if (k < 0) return 0;
    let logProb = -lambda + k * Math.log(lambda);
    for (let i = 1; i <= k; i++) {
        logProb -= Math.log(i);
    }
    return Math.exp(logProb);
}

// Genera interpretaciones automáticas descriptivo-inferenciales sobre la distribución y simulación activa
function generateDistributionInsights(shadedRange = null, simProb = null) {
    const type = selectDistribution.value;
    const container = document.getElementById('dist-insight-container');
    const block = document.getElementById('dist-interpretation-block');
    if (!container || !block) return;

    block.style.display = 'block';
    container.innerHTML = "";

    let insights = [];

    if (type === 'normal') {
        const mean = parseFloat(document.getElementById('dist-normal-mean').value);
        const std = parseFloat(document.getElementById('dist-normal-std').value);

        if (isNaN(mean) || isNaN(std) || std <= 0) {
            block.style.display = 'none';
            return;
        }

        const cv = (std / Math.abs(mean || 1) * 100).toFixed(1);
        let cvText = "baja y los datos son muy homogéneos";
        if (cv > 25) cvText = "alta, indicando alta dispersión y datos heterogéneos";
        else if (cv > 10) cvText = "moderada";

        insights.push(`Este modelo representa una variable aleatoria continua con distribución Normal concentrada alrededor de la media μ = ${mean}.`);
        insights.push(`El 68.2% de la población simulada del modelo se encuentra dentro del rango de desviación estándar [${(mean - std).toFixed(2)}, ${(mean + std).toFixed(2)}].`);
        insights.push(`El coeficiente de variación es del ${cv}%, sugiriendo que la dispersión de la población es ${cvText}.`);

        if (shadedRange && simProb !== null) {
            const minText = shadedRange.min === -Infinity || shadedRange.min <= mean - 4*std ? "-∞" : shadedRange.min.toFixed(2);
            const maxText = shadedRange.max === Infinity || shadedRange.max >= mean + 4*std ? "∞" : shadedRange.max.toFixed(2);
            insights.push(`La probabilidad acumulada de que un suceso ocurra en el intervalo [${minText}, ${maxText}] es de ${(simProb * 100).toFixed(4)}%.`);
        }
    } else if (type === 'binomial') {
        const n = parseInt(document.getElementById('dist-binomial-n').value);
        const p = parseFloat(document.getElementById('dist-binomial-p').value);

        if (isNaN(n) || isNaN(p) || n < 1 || p < 0 || p > 1) {
            block.style.display = 'none';
            return;
        }

        const expected = (n * p).toFixed(2);
        const variance = (n * p * (1 - p)).toFixed(2);
        const stdDev = Math.sqrt(n * p * (1 - p)).toFixed(2);

        insights.push(`Este modelo describe una secuencia de n = ${n} ensayos independientes de Bernoulli, cada uno con probabilidad constante de éxito p = ${(p * 100).toFixed(1)}%.`);
        insights.push(`El número esperado de éxitos (media teórica) es de E(X) = ${expected} éxitos, con una desviación estándar típica de σ = ${stdDev} éxitos.`);
        insights.push(`La varianza teórica calculada es Var(X) = ${variance}.`);

        if (shadedRange && simProb !== null) {
            insights.push(`La probabilidad de obtener éxitos dentro del rango discreto [${shadedRange.min}, ${shadedRange.max}] es de ${(simProb * 100).toFixed(4)}%. La probabilidad complementaria es de ${((1 - simProb)*100).toFixed(4)}%.`);
        }
    } else if (type === 'poisson') {
        const lambda = parseFloat(document.getElementById('dist-poisson-lambda').value);
        if (isNaN(lambda) || lambda <= 0) {
            block.style.display = 'none';
            return;
        }

        const expected = lambda.toFixed(2);
        const variance = lambda.toFixed(2);
        const stdDev = Math.sqrt(lambda).toFixed(2);

        insights.push(`Este modelo describe la probabilidad de que ocurra un número determinado de eventos independientes en un intervalo fijo de tiempo/espacio, con tasa λ = ${lambda}.`);
        insights.push(`El valor esperado (media teórica) es E(X) = ${expected} eventos, igualando a su varianza teórica Var(X) = ${variance} (propiedad de equidispersión de Poisson).`);
        insights.push(`La desviación estándar típica de ocurrencias es σ = ${stdDev} eventos.`);

        if (shadedRange && simProb !== null) {
            insights.push(`La probabilidad acumulada de registrar entre ${shadedRange.min} y ${shadedRange.max} ocurrencias es de ${(simProb * 100).toFixed(4)}%.`);
        }
    }

    insights.forEach(text => {
        container.innerHTML += `
            <div class="insight-item" style="border-left-color: #7c3aed; background-color: #faf5ff;">
                <i class="fa-solid fa-circle-check" style="color: #7c3aed;"></i>
                <p style="color: #581c87; font-weight: 500;">${text}</p>
            </div>
        `;
    });
}

function loadDistributionInputs() {
    distInputsContainer.innerHTML = distTemplates[selectDistribution.value];
    
    const lblMin = document.getElementById('lbl-sim-min');
    const lblMax = document.getElementById('lbl-sim-max');
    const inputMin = document.getElementById('dist-sim-min');
    const inputMax = document.getElementById('dist-sim-max');
    const resultDiv = document.getElementById('dist-sim-result');
    const interpretationBlock = document.getElementById('dist-interpretation-block');
    
    if (resultDiv) resultDiv.innerText = "";
    if (inputMin) inputMin.value = "";
    if (inputMax) inputMax.value = "";
    if (interpretationBlock) interpretationBlock.style.display = "none"; // Reset en cambio

    if (selectDistribution.value === 'normal') {
        if (lblMin) lblMin.innerText = "Límite Inferior (a)";
        if (lblMax) lblMax.innerText = "Límite Superior (b)";
        if (inputMin) inputMin.placeholder = "-∞ o valor";
        if (inputMax) inputMax.placeholder = "∞ o valor";
    } else if (selectDistribution.value === 'binomial') {
        if (lblMin) lblMin.innerText = "k Mínimo (a)";
        if (lblMax) lblMax.innerText = "k Máximo (b)";
        if (inputMin) inputMin.placeholder = "0";
        if (inputMax) inputMax.placeholder = "n";
    } else if (selectDistribution.value === 'poisson') {
        if (lblMin) lblMin.innerText = "k Mínimo (a)";
        if (lblMax) lblMax.innerText = "k Máximo (b)";
        if (inputMin) inputMin.placeholder = "0";
        if (inputMax) inputMax.placeholder = "valor (o vacío)";
    }
}

selectDistribution.addEventListener('change', function() {
    loadDistributionInputs();
    renderDistributionCurve();
});

// Función matemática de distribución Binomial robusta (Evita desbordamiento por logs)
function binomialPMF(n, p, k) {
    if (k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    
    let logComb = 0;
    for (let i = 1; i <= k; i++) {
        logComb += Math.log(n - i + 1) - Math.log(i);
    }
    return Math.exp(logComb + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

// Función Normal Gaussiana PDF
function normalPDF(x, mean, std) {
    const coeff = 1 / (std * Math.sqrt(2 * Math.PI));
    const exponent = -0.5 * Math.pow((x - mean) / std, 2);
    return coeff * Math.exp(exponent);
}

// Función Normal CDF aproximada
function normalCDF(x, mean, std) {
    const t = (x - mean) / std;
    const p = 0.3275911;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    
    const sign = t < 0 ? -1 : 1;
    const absT = Math.abs(t) / Math.sqrt(2);
    
    const k = 1 / (1 + p * absT);
    const erf = 1 - (((((a5 * k + a4) * k + a3) * k + a2) * k + a1) * k) * Math.exp(-absT * absT);
    
    return 0.5 * (1 + sign * erf);
}

// Dibujar Curva/Histograma de Distribución
function renderDistributionCurve(shadedRange = null, simProb = null) {
    if (distributionChart) distributionChart.destroy();

    const type = selectDistribution.value;
    let labels = [];
    let dataPoints = [];
    let chartConfig = {};

    if (type === 'normal') {
        const mean = parseFloat(document.getElementById('dist-normal-mean').value);
        const std = parseFloat(document.getElementById('dist-normal-std').value);

        if (isNaN(mean) || isNaN(std) || std <= 0) return;

        const start = mean - 4 * std;
        const end = mean + 4 * std;
        const step = (end - start) / 120;
        
        let backgroundColors = [];
        for (let i = 0; i <= 120; i++) {
            const x = start + i * step;
            labels.push(x.toFixed(2));
            const y = normalPDF(x, mean, std);
            dataPoints.push({ x: x, y: y });

            if (shadedRange && x >= shadedRange.min && x <= shadedRange.max) {
                backgroundColors.push('rgba(124, 58, 237, 0.4)');
            } else {
                backgroundColors.push('rgba(59, 130, 246, 0.15)');
            }
        }

        chartConfig = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Densidad Normal N(μ=${mean}, σ=${std})`,
                    data: dataPoints,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animations: {
                    y: { from: distCtx.canvas.clientHeight, duration: 1000, easing: 'easeOutQuart' },
                    opacity: { from: 0, to: 1, duration: 800 }
                },
                scales: {
                    x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Variable Aleatoria (X)' } },
                    y: { title: { display: true, text: 'F(X) Densidad' } }
                }
            }
        };

        if (shadedRange) {
            chartConfig.data.datasets[0].segment = {
                backgroundColor: ctx => {
                    const val = ctx.p1.raw.x;
                    return (val >= shadedRange.min && val <= shadedRange.max) ? 'rgba(124, 58, 237, 0.35)' : 'rgba(59, 130, 246, 0.15)';
                }
            };
        }

        // Generar interpretaciones automáticas en tiempo de renderizado
        generateDistributionInsights(shadedRange, simProb);

    } else if (type === 'binomial') {
        const n = parseInt(document.getElementById('dist-binomial-n').value);
        const p = parseFloat(document.getElementById('dist-binomial-p').value);

        if (isNaN(n) || isNaN(p) || n < 1 || p < 0 || p > 1) return;

        let backgroundColors = [];
        for (let k = 0; k <= n; k++) {
            labels.push(k.toString());
            const prob = binomialPMF(n, p, k);
            dataPoints.push(prob);

            if (shadedRange && k >= shadedRange.min && k <= shadedRange.max) {
                backgroundColors.push('#7c3aed');
            } else {
                backgroundColors.push('rgba(59, 130, 246, 0.7)');
            }
        }

        chartConfig = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: `Masa Binomial B(n=${n}, p=${p})`,
                    data: dataPoints,
                    backgroundColor: backgroundColors,
                    borderColor: '#2563eb',
                    borderWidth: 1.5,
                    barPercentage: 0.9
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animations: {
                    y: { from: distCtx.canvas.clientHeight, duration: 1000, easing: 'easeOutQuart' },
                    opacity: { from: 0, to: 1, duration: 800 }
                },
                scales: {
                    x: { title: { display: true, text: 'Número de Éxitos (k)' } },
                    y: { title: { display: true, text: 'P(X = k) Probabilidad' } }
                }
            }
        };

        generateDistributionInsights(shadedRange, simProb);
    } else if (type === 'poisson') {
        const lambda = parseFloat(document.getElementById('dist-poisson-lambda').value);
        if (isNaN(lambda) || lambda <= 0) return;

        // kMax determinado dinámicamente como lambda + 4 * raíz(lambda)
        const kMax = Math.ceil(lambda + 4 * Math.sqrt(lambda));
        
        let backgroundColors = [];
        for (let k = 0; k <= kMax; k++) {
            labels.push(k.toString());
            const prob = poissonPMF(lambda, k);
            dataPoints.push(prob);

            if (shadedRange && k >= shadedRange.min && k <= shadedRange.max) {
                backgroundColors.push('#7c3aed');
            } else {
                backgroundColors.push('rgba(59, 130, 246, 0.7)');
            }
        }

        chartConfig = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: `Masa de Poisson P(X = k; λ=${lambda})`,
                    data: dataPoints,
                    backgroundColor: backgroundColors,
                    borderColor: '#2563eb',
                    borderWidth: 1.5,
                    barPercentage: 0.9
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animations: {
                    y: { from: distCtx.canvas.clientHeight, duration: 1000, easing: 'easeOutQuart' },
                    opacity: { from: 0, to: 1, duration: 800 }
                },
                scales: {
                    x: { title: { display: true, text: 'Número de Eventos (k)' } },
                    y: { title: { display: true, text: 'P(X = k) Probabilidad' } }
                }
            }
        };

        generateDistributionInsights(shadedRange, simProb);
    }

    distributionChart = new Chart(distCtx, chartConfig);
}

btnPlotDistribution.addEventListener('click', () => {
    // Limpiar el resultado al redibujar el modelo base
    const resultDiv = document.getElementById('dist-sim-result');
    if (resultDiv) resultDiv.innerText = "";
    renderDistributionCurve();
});

// Simulación de Probabilidad Acumulada por Intervalo en las Distribuciones
btnSimulateProbability.addEventListener('click', function() {
    const type = selectDistribution.value;
    const resultDiv = document.getElementById('dist-sim-result');
    const valMinText = document.getElementById('dist-sim-min').value;
    const valMaxText = document.getElementById('dist-sim-max').value;

    if (type === 'normal') {
        const mean = parseFloat(document.getElementById('dist-normal-mean').value);
        const std = parseFloat(document.getElementById('dist-normal-std').value);
        
        if (isNaN(mean) || isNaN(std) || std <= 0) {
            if (resultDiv) resultDiv.innerHTML = "<span style='color:#ef4444;'>Define media y desviación estándar válidas.</span>";
            return;
        }

        const minVal = valMinText === "" ? -Infinity : parseFloat(valMinText);
        const maxVal = valMaxText === "" ? Infinity : parseFloat(valMaxText);

        if (isNaN(minVal) || isNaN(maxVal) || minVal > maxVal) {
            if (resultDiv) resultDiv.innerHTML = "<span style='color:#ef4444;'>Límites del intervalo inválidos.</span>";
            return;
        }

        const pMin = minVal === -Infinity ? 0 : normalCDF(minVal, mean, std);
        const pMax = maxVal === Infinity ? 1 : normalCDF(maxVal, mean, std);
        const accumProb = pMax - pMin;

        if (resultDiv) {
            resultDiv.innerHTML = `P(${minVal === -Infinity ? '-∞' : minVal.toFixed(2)} ≤ X ≤ ${maxVal === Infinity ? '∞' : maxVal.toFixed(2)}) = <span style="color:#7c3aed; font-size:15px; font-weight:800;">${(accumProb * 100).toFixed(4)}%</span>`;
        }
        
        // Redibujar sombreando la campana e inyectando interpretaciones
        renderDistributionCurve({ min: minVal === -Infinity ? mean - 4*std : minVal, max: maxVal === Infinity ? mean + 4*std : maxVal }, accumProb);

    } else if (type === 'binomial') {
        const n = parseInt(document.getElementById('dist-binomial-n').value);
        const p = parseFloat(document.getElementById('dist-binomial-p').value);
        
        if (isNaN(n) || isNaN(p) || n < 1 || p < 0 || p > 1) {
            if (resultDiv) resultDiv.innerHTML = "<span style='color:#ef4444;'>Define parámetros binomiales válidos.</span>";
            return;
        }

        const minVal = valMinText === "" ? 0 : parseInt(valMinText);
        const maxVal = valMaxText === "" ? n : parseInt(valMaxText);

        if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal > n || minVal > maxVal) {
            if (resultDiv) resultDiv.innerHTML = "<span style='color:#ef4444;'>Límites del intervalo inválidos (0 a n).</span>";
            return;
        }

        let accumProb = 0;
        for (let k = minVal; k <= maxVal; k++) {
            accumProb += binomialPMF(n, p, k);
        }

        if (resultDiv) {
            resultDiv.innerHTML = `P(${minVal} ≤ X ≤ ${maxVal}) = <span style="color:#7c3aed; font-size:15px; font-weight:800;">${(accumProb * 100).toFixed(4)}%</span>`;
        }
        
        // Redibujar coloreando las barras e inyectando interpretaciones
        renderDistributionCurve({ min: minVal, max: maxVal }, accumProb);
    } else if (type === 'poisson') {
        const lambda = parseFloat(document.getElementById('dist-poisson-lambda').value);
        if (isNaN(lambda) || lambda <= 0) {
            if (resultDiv) resultDiv.innerHTML = "<span style='color:#ef4444;'>Define un lambda válido.</span>";
            return;
        }

        const minVal = valMinText === "" ? 0 : parseInt(valMinText);
        const kMax = Math.ceil(lambda + 4 * Math.sqrt(lambda));
        const maxVal = valMaxText === "" ? kMax : parseInt(valMaxText);

        if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || minVal > maxVal) {
            if (resultDiv) resultDiv.innerHTML = "<span style='color:#ef4444;'>Límites del intervalo inválidos (mínimo 0).</span>";
            return;
        }

        let accumProb = 0;
        for (let k = minVal; k <= maxVal; k++) {
            accumProb += poissonPMF(lambda, k);
        }

        if (resultDiv) {
            resultDiv.innerHTML = `P(${minVal} ≤ X ≤ ${maxVal}) = <span style="color:#7c3aed; font-size:15px; font-weight:800;">${(accumProb * 100).toFixed(4)}%</span>`;
        }

        renderDistributionCurve({ min: minVal, max: maxVal }, accumProb);
    }
});


// --- 12. EFECTOS ESPECIALES Y FLORITURAS (ESTELAS DE COLOR Y ANIMACIONES) ---

// Crear un burst de partículas al pulsar en un KPI
function createColorTrail(e, element) {
    const rect = element.getBoundingClientRect();
    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    // Al colocar position: relative en .kpi-card, las coordenadas (x, y) son locales y precisas
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const wrapper = element.querySelector('.kpi-icon-wrapper');
    let color = '#2563eb'; 
    if (wrapper.classList.contains('bg-blue-light')) color = '#0284c7';
    else if (wrapper.classList.contains('bg-green-light')) color = '#22c55e';
    else if (wrapper.classList.contains('bg-orange-light')) color = '#f97316';
    else if (wrapper.classList.contains('bg-pink-light')) color = '#ec4899';
    else if (wrapper.classList.contains('bg-teal-light')) color = '#14b8a6';

    for (let i = 0; i < 12; i++) {
        const particle = document.createElement('span');
        particle.className = 'color-trail-particle';
        
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 50;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);
        particle.style.backgroundColor = color;
        particle.style.color = color;
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;

        element.appendChild(particle);
        
        setTimeout(() => particle.remove(), 800);
    }
}


// --- 13. INICIALIZACIÓN DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    loadProbabilityForm();
    loadDistributionInputs();
    renderDistributionCurve();
});