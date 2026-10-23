// Configuration
let CELL_SIZE = 10

// Global state for matrix rendering
let currentMatrixData = null;
let currentDiffCountData = null;
let currentDistogramData = null;
let currentView = 'mutation'; // 'mutation' | 'distogram'

// Which protein is selected, and the sequence data for it. These used to live
// in a server-side session; the site is static now, so they live here.
let currentProtein = '';
let currentSequences = null; // { reference, reference_stripped, headers, sequences, total }
let currentIndex = 0;
let referenceSequence = '';

// Incremented per sequence view so a slow UniProt response for a sequence the
// user has already clicked past can be discarded.
let currentRequestId = 0;

function dataUrl(...parts) {
    return ['data', currentProtein, ...parts].join('/');
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.statusText}`);
    }
    return response.json();
}

// Track if Molstar has been initialized
let molstarInitialized = false;

// Track hover state for Molstar coloring
let hoverResidues = [];

// Main application script
document.addEventListener('DOMContentLoaded', async () => {
    console.log('MSA Visualizations app loaded');

    // Populate protein selector dropdown from the generated manifest
    const proteinSelector = document.getElementById('protein-selector');
    let manifest;
    try {
        manifest = await fetchJson('data/manifest.json');
    } catch (error) {
        console.error('Error loading manifest:', error);
        document.getElementById('file-loader').innerHTML =
            `<p style="color: red;">Could not load data/manifest.json: ${error.message}</p>`;
        return;
    }

    currentProtein = manifest.default;

    manifest.proteins.forEach(protein => {
        const option = document.createElement('option');
        option.value = protein;
        option.textContent = protein;
        if (protein === currentProtein) {
            option.selected = true;
        }
        proteinSelector.appendChild(option);
    });

    // Handle protein selection change
    proteinSelector.addEventListener('change', async (event) => {
        currentProtein = event.target.value;
        console.log(`Protein selected: ${currentProtein}`);

        // Hide visualizations while loading
        const matrixVisualization = document.getElementById('matrix-visualization');
        const alignmentQualityContainer = document.getElementById('alignment-quality-container');
        matrixVisualization.style.display = 'none';
        alignmentQualityContainer.style.display = 'none';

        // Reset molstar viewer and flag (will be reinitialized when tab is opened)
        molstarViewer = null;
        molstarInitialized = false;

        // Start the new protein from its first sequence
        currentSequences = null;
        currentIndex = 0;

        await loadSequences();
        await loadMatrix();

        // If the Mutation tab is currently visible, reinitialize Molstar
        if (mutationContent.classList.contains('active')) {
            try {
                await initMolstarViewer();
                molstarInitialized = true;
            } catch (e) {
                console.error('Error reinitializing Molstar after protein change:', e);
            }
        }

        console.log(`Reloaded data for ${currentProtein}`);
    });

    // Set up tab switching
    const alignmentTab = document.getElementById('alignment-tab');
    const mutationTab = document.getElementById('mutation-tab');
    const alignmentContent = document.getElementById('alignment-content');
    const mutationContent = document.getElementById('mutation-content');

    alignmentTab.addEventListener('click', () => {
        // Switch to alignment tab
        alignmentTab.classList.add('active');
        mutationTab.classList.remove('active');
        alignmentContent.classList.add('active');
        mutationContent.classList.remove('active');
        alignmentContent.style.display = 'block';
        mutationContent.style.display = 'none';
    });

    mutationTab.addEventListener('click', async () => {
        // Switch to mutation tab
        mutationTab.classList.add('active');
        alignmentTab.classList.remove('active');
        mutationContent.classList.add('active');
        alignmentContent.classList.remove('active');
        mutationContent.style.display = 'block';
        alignmentContent.style.display = 'none';

        // Initialize Molstar only when the tab is first opened (when it's visible)
        if (!molstarInitialized) {
            console.log('Initializing Molstar for the first time (tab is now visible)');
            try {
                await fetchReferenceSequence();
                await initMolstarViewer();
                molstarInitialized = true;
            } catch (e) {
                console.error('Error initializing Molstar:', e);
            }
        }
    });

    // Load initial sequences
    await loadSequences();

    // Load matrix automatically
    await loadMatrix();

    // If the Mutation tab is currently visible, initialize Molstar
    if (mutationContent.classList.contains('active')) {
        try {
            await initMolstarViewer();
            molstarInitialized = true;
        } catch (e) {
            console.error('Error reinitializing Molstar after protein change:', e);
        }
    }

    // Add event listener to Previous button
    const previousBtn = document.getElementById('previous-btn');
    previousBtn.addEventListener('click', async () => {
        currentIndex -= 1;
        await loadSequences();
    });

    // Add event listener to Next button
    const nextBtn = document.getElementById('next-btn');
    nextBtn.addEventListener('click', async () => {
        currentIndex += 1;
        await loadSequences();
    });

    // Add event listener to Random button
    const randomBtn = document.getElementById('random-btn');
    randomBtn.addEventListener('click', async () => {
        if (currentSequences && currentSequences.total > 0) {
            currentIndex = Math.floor(Math.random() * currentSequences.total);
        }
        await loadSequences();
    });

    // Add window resize handler to recalculate cell size and re-render matrix
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce resize events
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const active = getActiveViewData();
            if (active) {
                console.log('Window resized, recalculating cell size and re-rendering matrix');
                CELL_SIZE = calculateCellSize(active.size);
                console.log(`New cell size: ${CELL_SIZE}px`);

                renderMatrix(active.matrix, active.size, active.minValue, active.maxValue);

                if (currentView === 'mutation' && currentDiffCountData) {
                    renderDiffCountSVG(
                        currentDiffCountData.diffCount,
                        currentDiffCountData.size,
                        currentDiffCountData.diffCountMin,
                        currentDiffCountData.diffCountMax
                    );
                }
            }
        }, 250); // Wait 250ms after resize stops
    });

    // Wire up matrix view toggle
    document.getElementById('view-mutation-btn').addEventListener('click', () => switchView('mutation'));
    document.getElementById('view-distogram-btn').addEventListener('click', () => switchView('distogram'));
});

function getActiveViewData() {
    if (currentView === 'distogram') return currentDistogramData;
    return currentMatrixData;
}

async function switchView(view) {
    if (view === currentView) return;

    if (view === 'distogram') {
        // Lazy-load distogram on first switch
        if (!currentDistogramData) {
            const ok = await loadDistogram();
            if (!ok) return;
        }
        currentView = 'distogram';
    } else {
        currentView = 'mutation';
    }

    applyView();
}

// Sync the toggle, heading and panels with currentView, and render its matrix
function applyView() {
    // Update button states
    document.getElementById('view-mutation-btn').classList.toggle('active', currentView === 'mutation');
    document.getElementById('view-distogram-btn').classList.toggle('active', currentView === 'distogram');

    // Update heading
    const heading = document.getElementById('matrix-heading');
    heading.textContent = currentView === 'distogram' ? 'Distogram (expected distance, Å)' : 'Mutation Matrix';

    // Show/hide mutation-specific panels
    const diffCountSvg = document.getElementById('diff-count-svg');
    const valuesPlotContainer = document.getElementById('matrix-values-plot-container');
    if (currentView === 'distogram') {
        diffCountSvg.style.display = 'none';
        valuesPlotContainer.style.display = 'none';
    } else {
        diffCountSvg.style.display = '';
        if (currentMatrixData) valuesPlotContainer.style.display = 'block';
    }

    const active = getActiveViewData();
    if (active) {
        CELL_SIZE = calculateCellSize(active.size);
        renderMatrix(active.matrix, active.size, active.minValue, active.maxValue);
        if (currentView === 'mutation' && currentDiffCountData) {
            renderDiffCountSVG(
                currentDiffCountData.diffCount,
                currentDiffCountData.size,
                currentDiffCountData.diffCountMin,
                currentDiffCountData.diffCountMax
            );
        }
    }
}

async function loadDistogram() {
    try {
        console.log(`Loading distogram for ${currentProtein}...`);
        const data = await fetchJson(dataUrl('distogram.json'));
        if (!data.success || !data.available) {
            console.warn('Distogram not available');
            return false;
        }
        const { min: minValue, max: maxValue } = calculateMatrixMinMax(data.matrix, data.size);
        currentDistogramData = {
            matrix: data.matrix,
            size: data.size,
            minValue,
            maxValue,
            blockName: data.block_name
        };
        console.log(`Distogram loaded (block ${data.block_name}), min: ${minValue.toFixed(2)} Å, max: ${maxValue.toFixed(2)} Å`);
        return true;
    } catch (error) {
        console.error('Error loading distogram:', error);
        alert(`Error loading distogram: ${error.message}`);
        return false;
    }
}

// Fetch the sequence bundle for the current protein once, then keep it.
async function ensureSequences() {
    if (!currentSequences) {
        currentSequences = await fetchJson(dataUrl('sequences.json'));
        referenceSequence = currentSequences.reference_stripped;
        console.log(`Loaded ${currentSequences.total} sequences for ${currentProtein}`);
    }
    return currentSequences;
}

// Render the sequence at currentIndex, wrapping around at either end. This
// replaces the /api/msa, /api/previous, /api/next and /api/random endpoints;
// the index is just a local variable now.
async function loadSequences() {
    const fileLoader = document.getElementById('file-loader');

    try {
        const data = await ensureSequences();

        if (data.total === 0) {
            throw new Error('No comparison sequences in this alignment');
        }

        // Wrap around at either end, as the server used to
        currentIndex = ((currentIndex % data.total) + data.total) % data.total;

        const seq1 = data.reference;
        const seq2 = data.sequences[currentIndex];
        const seq2Header = data.headers[currentIndex];

        // Discard any UniProt response for a sequence we have already left
        const requestId = ++currentRequestId;

        const uniprotId = parseUniprotId(seq2Header);

        let seq2Info = '';
        if (uniprotId) {
            seq2Info = `- <span class="uniprot-spinner">⟳</span> <span id="protein-info">Loading...</span>`;
        } else if (seq2Header) {
            seq2Info = `- ${seq2Header}`;
        }

        fileLoader.innerHTML = `
            <p>File: ${currentProtein}.a3m</p>
            <p>Showing sequence ${currentIndex + 1} of ${data.total}</p>
            <p>Sequence 1 (reference): ${seq1.replace(/-/g, '').length} amino acids</p>
            <p>Sequence 2: ${seq2.replace(/-/g, '').length} amino acids ${seq2Info}</p>
        `;

        console.log(`Loaded sequence ${currentIndex + 1} of ${data.total}`);

        // Clear previous visualization
        const svg = document.getElementById('sequence-viz');
        svg.innerHTML = '';

        visualizeAlignment(seq1, seq2);

        // UniProt allows cross-origin reads, so the browser can ask it directly
        if (uniprotId) {
            fetchUniprotData(uniprotId, requestId);
        }

    } catch (error) {
        console.error('Error loading file:', error);
        fileLoader.innerHTML = `
            <h2>MSA Sequence Visualization</h2>
            <p style="color: red;">Error loading MSA data: ${error.message}</p>
        `;
    }
}

// UniRef100 headers look like: >UniRef100_<UniProtID> <other tab-separated fields>
const UNIREF_PREFIX = '>UniRef100_';

function parseUniprotId(header) {
    if (!header || !header.startsWith(UNIREF_PREFIX)) {
        return null;
    }
    return header.slice(UNIREF_PREFIX.length).split(/\s/)[0] || null;
}

async function fetchUniprotData(uniprotId, requestId) {
    try {
        const data = await fetchJson(`https://rest.uniprot.org/uniprotkb/${uniprotId}.json`);

        // The user may have clicked Next while this was in flight
        if (requestId !== currentRequestId) {
            console.log(`Discarding stale UniProt data for request #${requestId}`);
            return;
        }

        const proteinName = data.proteinDescription?.recommendedName?.fullName?.value;
        const organism = data.organism?.scientificName;

        const proteinInfo = document.getElementById('protein-info');
        if (proteinInfo && proteinName && organism) {
            proteinInfo.innerHTML = `<strong>${proteinName}</strong> (${organism})`;
            const spinner = document.querySelector('.uniprot-spinner');
            if (spinner) {
                spinner.remove();
            }
            console.log('Received UniProt data');
        }
    } catch (error) {
        console.error('Error fetching UniProt data:', error);
        if (requestId === currentRequestId) {
            const proteinInfo = document.getElementById('protein-info');
            if (proteinInfo) {
                proteinInfo.textContent = 'metadata unavailable';
            }
            const spinner = document.querySelector('.uniprot-spinner');
            if (spinner) {
                spinner.remove();
            }
        }
    }
}

function visualizeAlignment(seq1, seq2) {
    // Configuration
    const boxSize = 30;
    const padding = 2;
    const rowGap = 10;
    const color1 = '#2ca02c';  // Green for sequence 1
    const color2 = '#1f77b4';  // Blue for sequence 2
    const mismatchColor = '#d62728';  // Red for mismatches
    const gapColor = '#e0e0e0'; // Light gray for gaps
    const deletionColor = '#f1c40f'; // Yellow for deletions from sequence 1

    // Sequences should be same length now
    const alignmentLength = seq1.length;

    // Calculate dimensions (two rows)
    const width = alignmentLength * (boxSize + padding);
    const height = 2 * boxSize + rowGap + padding;

    // Get SVG element
    const svg = document.getElementById('sequence-viz');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    // Create visualization for each position
    for (let i = 0; i < alignmentLength; i++) {
        const char1 = seq1[i] || '';
        const char2 = seq2[i] || '';
        const x = i * (boxSize + padding);

        // Check if this is a mismatch or deletion
        const isGap1 = char1 === '-';
        const isGap2 = char2 === '-';
        const isMismatch = !isGap1 && !isGap2 && char1 !== char2;
        const isDeletion = !isGap1 && isGap2;  // Deletion from seq1 (gap in seq2)

        // Draw sequence 1 box (top row)
        const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect1.setAttribute('x', x);
        rect1.setAttribute('y', 0);
        rect1.setAttribute('width', boxSize);
        rect1.setAttribute('height', boxSize);

        if (isGap1) {
            // Gap in sequence 1
            rect1.setAttribute('fill', gapColor);
            rect1.setAttribute('stroke', '#999');
            rect1.setAttribute('stroke-dasharray', '3,3');
        } else if (isMismatch) {
            // Mismatch - use red
            rect1.setAttribute('fill', mismatchColor);
            rect1.setAttribute('stroke', '#333');
        } else if (isDeletion) {
            // Deletion (gap in seq2) - use yellow
            rect1.setAttribute('fill', deletionColor);
            rect1.setAttribute('stroke', '#333');
        } else {
            // Match - use normal color
            rect1.setAttribute('fill', color1);
            rect1.setAttribute('stroke', '#333');
        }
        rect1.setAttribute('stroke-width', '1');
        rect1.setAttribute('rx', '2');
        g1.appendChild(rect1);

        // Add text for sequence 1
        if (!isGap1) {
            const text1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text1.setAttribute('x', x + boxSize / 2);
            text1.setAttribute('y', boxSize / 2);
            text1.setAttribute('text-anchor', 'middle');
            text1.setAttribute('dominant-baseline', 'central');
            // Use dark text for yellow background, white for others
            text1.setAttribute('fill', isDeletion ? '#333' : 'white');
            text1.setAttribute('font-size', '14px');
            text1.setAttribute('font-weight', 'bold');
            text1.setAttribute('font-family', 'monospace');
            text1.textContent = char1;
            g1.appendChild(text1);
        }
        svg.appendChild(g1);

        // Draw sequence 2 box (bottom row)
        const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect2.setAttribute('x', x);
        rect2.setAttribute('y', boxSize + rowGap);
        rect2.setAttribute('width', boxSize);
        rect2.setAttribute('height', boxSize);

        if (isGap2) {
            // Gap in sequence 2
            rect2.setAttribute('fill', gapColor);
            rect2.setAttribute('stroke', '#999');
            rect2.setAttribute('stroke-dasharray', '3,3');
        } else if (isMismatch) {
            // Mismatch - use red
            rect2.setAttribute('fill', mismatchColor);
            rect2.setAttribute('stroke', '#333');
        } else {
            // Match - use normal color
            rect2.setAttribute('fill', color2);
            rect2.setAttribute('stroke', '#333');
        }
        rect2.setAttribute('stroke-width', '1');
        rect2.setAttribute('rx', '2');
        g2.appendChild(rect2);

        // Add text for sequence 2
        if (!isGap2) {
            const text2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text2.setAttribute('x', x + boxSize / 2);
            text2.setAttribute('y', boxSize + rowGap + boxSize / 2);
            text2.setAttribute('text-anchor', 'middle');
            text2.setAttribute('dominant-baseline', 'central');
            text2.setAttribute('fill', 'white');
            text2.setAttribute('font-size', '14px');
            text2.setAttribute('font-weight', 'bold');
            text2.setAttribute('font-family', 'monospace');
            text2.textContent = char2;
            g2.appendChild(text2);
        }
        svg.appendChild(g2);
    }

    console.log(`Visualized alignment of ${alignmentLength} positions`);
}

function calculateMatrixMinMax(matrix, size) {
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (i !== j) {  // Exclude diagonal elements
                const value = matrix[i][j];
                if (value < minValue) minValue = value;
                if (value > maxValue) maxValue = value;
            }
        }
    }
    return { min: minValue, max: maxValue };
}

function calculateArrayMinMax(array) {
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (let i = 0; i < array.length; i++) {
        const value = array[i];
        if (value < minValue) minValue = value;
        if (value > maxValue) maxValue = value;
    }
    return { min: minValue, max: maxValue };
}

function calculateCellSize(matrixSize) {
    // Get available vertical space (window height minus header and padding)
    const header = document.querySelector('header');
    const headerHeight = header ? header.offsetHeight : 0;
    const padding = 300; // Space for tabs, controls, margins, etc.
    const availableHeight = window.innerHeight - headerHeight - padding;

    // Calculate cell size to fit the matrix vertically
    const cellSize = availableHeight / matrixSize;

    // Whole pixels (at most 20) keep cells crisp. Large proteins need less
    // than 2px per cell to fit, and the canvas can draw fractional cells, so
    // those only stop shrinking at 1px.
    if (cellSize >= 2) return Math.min(20, Math.floor(cellSize));
    return Math.max(1, cellSize);
}

function updateMolstarViewerSize(matrixHeight) {
    const molstarViewerElement = document.getElementById('molstar-viewer');
    if (molstarViewerElement) {
        molstarViewerElement.style.height = `${matrixHeight}px`;
        molstarViewerElement.style.width = `${matrixHeight}px`;

        // If Molstar instance exists, trigger a resize after updating the container size
        if (molstarViewer && molstarViewer.plugin) {
            setTimeout(() => {
                try {
                    if (molstarViewer.plugin.canvas3d) {
                        molstarViewer.plugin.canvas3d.handleResize();
                        console.log('Molstar resized after container update');
                    }
                } catch (e) {
                    console.log('Error resizing Molstar:', e);
                }
            }, 100);
        }
    }
}

async function loadMatrix() {
    const spinner = document.getElementById('matrix-spinner');
    const matrixVisualization = document.getElementById('matrix-visualization');

    try {
        // Show spinner
        if (spinner) {
            spinner.style.display = 'block';
        }

        console.log(`Loading matrix for ${currentProtein}...`);

        const data = await fetchJson(dataUrl('matrix.json'));
        console.log('Matrix received');

        if (data.success) {
            // Calculate initial min and max values from the matrix (excluding diagonal)
            console.time('Calculate initial min/max from matrix');
            let { min: minValue, max: maxValue } = calculateMatrixMinMax(data.matrix, data.size);
            console.timeEnd('Calculate initial min/max from matrix');
            console.log(`Initial calculated min: ${minValue}, max: ${maxValue}`);

            // Calculate threshold at 90% of the interval from min to max
            const threshold90 = minValue + 0.9 * (maxValue - minValue);
            console.log(`90% interval threshold: ${threshold90}`);

            // Zero out entries greater than the threshold
            console.time('Zero out values > 90% of interval');
            let zeroedCount = 0;
            let totalNonDiagonal = 0;
            for (let i = 0; i < data.size; i++) {
                for (let j = 0; j < data.size; j++) {
                    if (i !== j) {
                        totalNonDiagonal++;
                        if (data.matrix[i][j] > threshold90) {
                            // data.matrix[i][j] = 0;
                            zeroedCount++;
                        }
                    }
                }
            }
            console.timeEnd('Zero out values > 90% of interval');
            console.log(`Zeroed ${zeroedCount} entries (${(zeroedCount / totalNonDiagonal * 100).toFixed(1)}%)`);

            // Recalculate min and max after zeroing
            console.time('Recalculate min/max after zeroing');
            ({ min: minValue, max: maxValue } = calculateMatrixMinMax(data.matrix, data.size));
            console.timeEnd('Recalculate min/max after zeroing');
            console.log(`After zeroing - min: ${minValue}, max: ${maxValue}`);

            // Calculate min and max for diff_count
            console.time('Calculate min/max from diff_count');
            const { min: diffCountMin, max: diffCountMax } = calculateArrayMinMax(data.diff_count);
            console.timeEnd('Calculate min/max from diff_count');
            console.log(`Calculated diff_count min: ${diffCountMin}, max: ${diffCountMax}`);

            // Calculate optimal cell size based on window height
            CELL_SIZE = calculateCellSize(data.size);
            console.log(`Calculated cell size: ${CELL_SIZE}px for matrix size ${data.size}x${data.size}`);

            // Store data globally for resize handling
            currentMatrixData = {
                matrix: data.matrix,
                size: data.size,
                minValue: minValue,
                maxValue: maxValue
            };
            currentDiffCountData = {
                diffCount: data.diff_count,
                size: data.size,
                diffCountMin: diffCountMin,
                diffCountMax: diffCountMax
            };

            // Render the matrix values distribution plot
            renderMatrixValuesPlot(data.matrix, data.size);

            // Render the alignment quality plot in the alignment tab
            renderAlignmentQualityPlot(data.alignment_quality);
            document.getElementById('alignment-quality-container').style.display = 'block';

            // Show/hide distogram toggle based on availability
            const toggleContainer = document.getElementById('matrix-view-toggle');
            toggleContainer.style.display = data.distogram_available ? 'inline-flex' : 'none';

            // Open a (re)loaded protein on its distogram when it has one
            currentView = 'mutation';
            currentDistogramData = null;
            if (data.distogram_available && await loadDistogram()) {
                currentView = 'distogram';
            }

            matrixVisualization.style.display = 'block';
            applyView();

            // Note: Molstar will be initialized when the Mutation tab is first clicked
            console.log('Matrix visualization displayed');
        } else {
            throw new Error(data.error || 'Failed to generate matrix');
        }

    } catch (error) {
        console.error('Error loading matrix:', error);
        alert(`Error loading matrix: ${error.message}`);
    } finally {
        // Hide spinner
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
}

function renderMatrix(matrix, size, minValue, maxValue) {
    // The cells are drawn on a canvas; the SVG laid over it holds only the
    // axis labels and the hover/selection outlines. One SVG rect per cell made
    // hovering slow for large proteins (118k rects for OmpA).
    const plot = document.getElementById('matrix-plot');
    const canvas = document.getElementById('matrix-canvas');
    const svg = document.getElementById('matrix-svg');
    const positionDisplay = document.getElementById('matrix-position');

    // Track fixed row/column with keyboard modifiers
    let fixedRow = null;
    let fixedCol = null;

    // Track drag selection
    let isDragging = false;
    let dragStartRow = null;
    let dragStartCol = null;
    let dragEndRow = null;
    let dragEndCol = null;

    // Clear previous content
    svg.innerHTML = '';

    // Configuration
    const cellSize = CELL_SIZE; // Size of each cell in pixels
    const scaleSize = 30; // Space for axis labels
    const matrixWidth = size * cellSize;
    const matrixHeight = size * cellSize;
    const width = matrixWidth + scaleSize;
    const height = matrixHeight + scaleSize;

    // Set SVG dimensions
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Size the canvas in device pixels so the cells stay sharp on HiDPI screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;

    // Create color scale function (coolwarm colormap approximation), as [r, g, b]
    const getColor = (value) => {
        // Normalize value to 0-1 range
        const normalized = (value - minValue) / (maxValue - minValue);

        // Coolwarm colormap: blue (cool) to white to red (warm)
        if (normalized < 0.5) {
            // Blue to white
            const t = normalized * 2;
            return [
                Math.round(59 + (255 - 59) * t),
                Math.round(76 + (255 - 76) * t),
                Math.round(192 + (255 - 192) * t)
            ];
        } else {
            // White to red
            const t = (normalized - 0.5) * 2;
            return [255, Math.round(255 - 255 * t), Math.round(255 - 89 * t)];
        }
    };

    // Paint one pixel per cell, then scale it up onto the canvas without smoothing
    const cells = new ImageData(size, size);
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const [r, g, b] = getColor(matrix[row][col]);
            const i = (row * size + col) * 4;
            cells.data[i] = r;
            cells.data[i + 1] = g;
            cells.data[i + 2] = b;
            cells.data[i + 3] = 255;
        }
    }
    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = size;
    cellCanvas.height = size;
    cellCanvas.getContext('2d').putImageData(cells, 0, 0);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cellCanvas, scaleSize, scaleSize, matrixWidth, matrixHeight);

    // Draw axis scales
    // Determine tick interval based on matrix size
    let tickInterval = 10;
    if (size > 200) tickInterval = 50;
    else if (size > 100) tickInterval = 20;

    // Top horizontal scale (column positions)
    for (let i = 0; i < size; i += tickInterval) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', scaleSize + i * cellSize);
        text.setAttribute('y', scaleSize - 5);
        text.setAttribute('font-size', '10px');
        text.setAttribute('font-family', 'monospace');
        text.setAttribute('fill', '#333');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = i + 1; // 1-indexed for user display
        svg.appendChild(text);

        // Draw tick mark
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', scaleSize + i * cellSize);
        tick.setAttribute('y1', scaleSize - 2);
        tick.setAttribute('x2', scaleSize + i * cellSize);
        tick.setAttribute('y2', scaleSize);
        tick.setAttribute('stroke', '#999');
        tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);
    }

    // Left vertical scale (row positions)
    for (let i = 0; i < size; i += tickInterval) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', scaleSize - 5);
        text.setAttribute('y', scaleSize + i * cellSize + cellSize / 2);
        text.setAttribute('font-size', '10px');
        text.setAttribute('font-family', 'monospace');
        text.setAttribute('fill', '#333');
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = i + 1; // 1-indexed for user display
        svg.appendChild(text);

        // Draw tick mark
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', scaleSize - 2);
        tick.setAttribute('y1', scaleSize + i * cellSize);
        tick.setAttribute('x2', scaleSize);
        tick.setAttribute('y2', scaleSize + i * cellSize);
        tick.setAttribute('stroke', '#999');
        tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);
    }

    // Create highlight rectangle for hover
    const highlightRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    highlightRect.setAttribute('id', 'matrix-highlight');
    highlightRect.setAttribute('fill', 'none');
    highlightRect.setAttribute('stroke', '#000');
    highlightRect.setAttribute('stroke-width', '2');
    highlightRect.setAttribute('pointer-events', 'none');
    highlightRect.setAttribute('visibility', 'hidden');

    // Create selection rectangle for drag selection
    const selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    selectionRect.setAttribute('id', 'matrix-selection');
    selectionRect.setAttribute('fill', 'rgba(255, 165, 0, 0.1)');
    selectionRect.setAttribute('stroke', '#ffa500');
    selectionRect.setAttribute('stroke-width', '2');
    selectionRect.setAttribute('pointer-events', 'none');
    selectionRect.setAttribute('visibility', 'hidden');

    svg.appendChild(highlightRect);
    svg.appendChild(selectionRect);

    // Map a mouse event to the cell under the pointer, or null outside the cells
    const cellAt = (event) => {
        const box = canvas.getBoundingClientRect();
        const x = (event.clientX - box.left) * width / box.width - scaleSize;
        const y = (event.clientY - box.top) * height / box.height - scaleSize;
        const row = Math.floor(y / cellSize);
        const col = Math.floor(x / cellSize);
        if (row < 0 || col < 0 || row >= size || col >= size) return null;
        return { row, col };
    };

    // The cell the pointer was over at the last mouse event
    let hoverCell = null;

    const enterCell = (row, col, event) => {
        // Update drag selection if dragging
        if (isDragging) {
            dragEndRow = row;
            dragEndCol = col;

            // Update selection rectangle
            const minRow = Math.min(dragStartRow, dragEndRow);
            const maxRow = Math.max(dragStartRow, dragEndRow);
            const minCol = Math.min(dragStartCol, dragEndCol);
            const maxCol = Math.max(dragStartCol, dragEndCol);

            selectionRect.setAttribute('x', scaleSize + minCol * cellSize);
            selectionRect.setAttribute('y', scaleSize + minRow * cellSize);
            selectionRect.setAttribute('width', (maxCol - minCol + 1) * cellSize);
            selectionRect.setAttribute('height', (maxRow - minRow + 1) * cellSize);
            selectionRect.setAttribute('visibility', 'visible');
            return;
        }
        // Check keyboard modifiers to fix row or column
        let displayRow = row;
        let displayCol = col;

        if (event.shiftKey) {
            // Shift key: fix the column, only row changes
            if (fixedCol === null) {
                fixedCol = col;
            }
            displayCol = fixedCol;
        } else if (event.ctrlKey || event.metaKey) {
            // Ctrl/Cmd key: fix the row, only column changes
            if (fixedRow === null) {
                fixedRow = row;
            }
            displayRow = fixedRow;
        } else {
            // No modifier: reset fixed values
            fixedRow = null;
            fixedCol = null;
        }

        const displayValue = matrix[displayRow][displayCol];
        positionDisplay.textContent = `Position: (${displayRow}, ${displayCol}) Value: ${displayValue.toFixed(2)}`;
        highlightResiduesInMolstar(displayRow, displayCol);

        // Update highlight rectangle position
        highlightRect.setAttribute('x', scaleSize + displayCol * cellSize);
        highlightRect.setAttribute('y', scaleSize + displayRow * cellSize);
        highlightRect.setAttribute('width', cellSize);
        highlightRect.setAttribute('height', cellSize);
        highlightRect.setAttribute('visibility', 'visible');
    };

    const leaveCells = () => {
        positionDisplay.textContent = '';
        clearHighlightInMolstar();
        highlightRect.setAttribute('visibility', 'hidden');
    };

    // Handlers are assigned rather than added so that re-rendering replaces them

    // Start drag selection
    plot.onmousedown = (event) => {
        const cell = cellAt(event);
        if (!cell) return;
        isDragging = true;
        dragStartRow = cell.row;
        dragStartCol = cell.col;
        dragEndRow = cell.row;
        dragEndCol = cell.col;
        event.preventDefault();
    };

    // Display position and highlight in Mol* when the pointer reaches a new cell.
    // Moving between cells goes straight to the next highlight, without clearing
    // Mol* in between.
    plot.onmousemove = (event) => {
        const cell = cellAt(event);
        if (cell && hoverCell && cell.row === hoverCell.row && cell.col === hoverCell.col) return;
        if (!cell && hoverCell) leaveCells();
        hoverCell = cell;
        if (cell) enterCell(cell.row, cell.col, event);
    };

    // Finish drag selection or clear selection on click
    plot.onmouseup = () => {
        if (isDragging) {
            isDragging = false;

            // Check if this was a click (start == end) or a drag
            if (dragStartRow === dragEndRow && dragStartCol === dragEndCol) {
                // Single click - clear the selection
                selectedRegionResidues = [];
                selectionRect.setAttribute('visibility', 'hidden');
                clearHighlightInMolstar();
                console.log('Selection cleared');
            } else {
                // Drag - create selection
                // Get the selected region bounds
                const minRow = Math.min(dragStartRow, dragEndRow);
                const maxRow = Math.max(dragStartRow, dragEndRow);
                const minCol = Math.min(dragStartCol, dragEndCol);
                const maxCol = Math.max(dragStartCol, dragEndCol);

                // Collect all unique residue indices in the selection
                const residues = new Set();
                for (let r = minRow; r <= maxRow; r++) {
                    residues.add(r);
                }
                for (let c = minCol; c <= maxCol; c++) {
                    residues.add(c);
                }

                // Highlight residues in Molstar
                highlightRegionInMolstar(Array.from(residues));

                console.log(`Selected region: rows ${minRow}-${maxRow}, cols ${minCol}-${maxCol}`);
                console.log(`Highlighting ${residues.size} residues in Molstar`);
            }
        }
    };

    // Clear the hover and cancel any drag when the mouse leaves the matrix
    plot.onmouseleave = () => {
        if (hoverCell) {
            hoverCell = null;
            leaveCells();
        }
        if (isDragging) {
            isDragging = false;
            selectionRect.setAttribute('visibility', 'hidden');
        }
    };

    console.log(`Rendered ${size}x${size} matrix with ${size * size} cells`);

    // Update Molstar viewer size to match matrix height
    updateMolstarViewerSize(height);
}

let molstarViewer = null;

// Track selected region residues (persist across hovers)
let selectedRegionResidues = [];

function renderDiffCountSVG(diffCount, size, minValue, maxValue) {
    const svg = document.getElementById('diff-count-svg');
    const positionDisplay = document.getElementById('matrix-position');

    // Clear previous content
    svg.innerHTML = '';

    // Configuration
    const cellSize = CELL_SIZE;
    const cellHeight = 30; // Taller cells for better visibility
    const scaleSize = 30; // Space for axis labels (match matrix scale)
    const barWidth = size * cellSize;
    const width = barWidth + scaleSize;
    const height = cellHeight;

    // Set SVG dimensions
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Create color scale function (same coolwarm as matrix)
    const getColor = (value) => {
        // Normalize value to 0-1 range
        const normalized = (value - minValue) / (maxValue - minValue);

        // Coolwarm colormap: blue (cool) to white to red (warm)
        if (normalized < 0.5) {
            // Blue to white
            const t = normalized * 2;
            const r = Math.round(59 + (255 - 59) * t);
            const g = Math.round(76 + (255 - 76) * t);
            const b = Math.round(192 + (255 - 192) * t);
            return `rgb(${r}, ${g}, ${b})`;
        } else {
            // White to red
            const t = (normalized - 0.5) * 2;
            const r = 255;
            const g = Math.round(255 - 255 * t);
            const b = Math.round(255 - 89 * t);
            return `rgb(${r}, ${g}, ${b})`;
        }
    };

    // Render each cell (offset by scaleSize to match matrix)
    for (let i = 0; i < size; i++) {
        const value = diffCount[i];
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

        rect.setAttribute('x', scaleSize + i * cellSize);
        rect.setAttribute('y', 0);
        rect.setAttribute('width', cellSize);
        rect.setAttribute('height', cellHeight);
        rect.setAttribute('fill', getColor(value));

        // Add hover event to display position and highlight in Molstar
        rect.addEventListener('mouseenter', () => {
            positionDisplay.textContent = `Residue: ${i} Mutations: ${value.toFixed(2)}`;
            highlightSingleResidueInMolstar(i);
        });

        rect.addEventListener('mouseleave', () => {
            positionDisplay.textContent = '';
            clearHighlightInMolstar();
        });

        svg.appendChild(rect);
    }

    console.log(`Rendered diff_count with ${size} residues`);
}

function renderMatrixValuesPlot(matrix, size) {
    const svg = document.getElementById('matrix-values-plot');
    const container = document.getElementById('matrix-values-plot-container');

    // Clear previous content
    svg.innerHTML = '';

    // Extract all non-diagonal values from the matrix
    console.time('Extract matrix values');
    const values = [];
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            if (i !== j) {  // Exclude diagonal
                values.push(matrix[i][j]);
            }
        }
    }
    console.timeEnd('Extract matrix values');

    // Sort values in descending order
    console.time('Sort matrix values');
    values.sort((a, b) => b - a);
    console.timeEnd('Sort matrix values');
    console.log(`Plotting ${values.length} matrix values`);

    // Configuration
    const width = 1000;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Set SVG dimensions
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Create background
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', margin.left);
    background.setAttribute('y', margin.top);
    background.setAttribute('width', plotWidth);
    background.setAttribute('height', plotHeight);
    background.setAttribute('fill', '#f9f9f9');
    background.setAttribute('stroke', '#ddd');
    svg.appendChild(background);

    // Calculate scale
    const maxValue = values[0];
    const minValue = values[values.length - 1];
    const xScale = plotWidth / values.length;
    const yScale = plotHeight / (maxValue - minValue);

    // Draw line plot
    const points = [];
    for (let i = 0; i < values.length; i++) {
        const x = margin.left + i * xScale;
        const y = margin.top + plotHeight - (values[i] - minValue) * yScale;
        points.push(`${x},${y}`);
    }

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#2c3e50');
    polyline.setAttribute('stroke-width', '1.5');
    svg.appendChild(polyline);

    // Draw axes
    // Y-axis
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', margin.left);
    yAxis.setAttribute('y1', margin.top);
    yAxis.setAttribute('x2', margin.left);
    yAxis.setAttribute('y2', margin.top + plotHeight);
    yAxis.setAttribute('stroke', '#333');
    yAxis.setAttribute('stroke-width', '2');
    svg.appendChild(yAxis);

    // X-axis
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', margin.left);
    xAxis.setAttribute('y1', margin.top + plotHeight);
    xAxis.setAttribute('x2', margin.left + plotWidth);
    xAxis.setAttribute('y2', margin.top + plotHeight);
    xAxis.setAttribute('stroke', '#333');
    xAxis.setAttribute('stroke-width', '2');
    svg.appendChild(xAxis);

    // Y-axis labels
    const numYTicks = 5;
    for (let i = 0; i <= numYTicks; i++) {
        const value = minValue + (maxValue - minValue) * i / numYTicks;
        const y = margin.top + plotHeight - (value - minValue) * yScale;

        // Tick mark
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', margin.left - 5);
        tick.setAttribute('y1', y);
        tick.setAttribute('x2', margin.left);
        tick.setAttribute('y2', y);
        tick.setAttribute('stroke', '#333');
        tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', margin.left - 10);
        label.setAttribute('y', y);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('font-size', '12px');
        label.setAttribute('font-family', 'sans-serif');
        label.setAttribute('fill', '#333');
        label.textContent = value.toFixed(2);
        svg.appendChild(label);
    }

    // X-axis labels
    const numXTicks = 5;
    for (let i = 0; i <= numXTicks; i++) {
        const index = Math.floor(values.length * i / numXTicks);
        const x = margin.left + index * xScale;

        // Tick mark
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', x);
        tick.setAttribute('y1', margin.top + plotHeight);
        tick.setAttribute('x2', x);
        tick.setAttribute('y2', margin.top + plotHeight + 5);
        tick.setAttribute('stroke', '#333');
        tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', margin.top + plotHeight + 20);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '12px');
        label.setAttribute('font-family', 'sans-serif');
        label.setAttribute('fill', '#333');
        label.textContent = index;
        svg.appendChild(label);
    }

    // Axis titles
    // Y-axis title
    const yTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yTitle.setAttribute('x', -height / 2);
    yTitle.setAttribute('y', 15);
    yTitle.setAttribute('transform', 'rotate(-90)');
    yTitle.setAttribute('text-anchor', 'middle');
    yTitle.setAttribute('font-size', '14px');
    yTitle.setAttribute('font-family', 'sans-serif');
    yTitle.setAttribute('fill', '#333');
    yTitle.textContent = 'Matrix Value';
    svg.appendChild(yTitle);

    // X-axis title
    const xTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xTitle.setAttribute('x', margin.left + plotWidth / 2);
    xTitle.setAttribute('y', height - 5);
    xTitle.setAttribute('text-anchor', 'middle');
    xTitle.setAttribute('font-size', '14px');
    xTitle.setAttribute('font-family', 'sans-serif');
    xTitle.setAttribute('fill', '#333');
    xTitle.textContent = 'Sorted Index (Descending)';
    svg.appendChild(xTitle);

    // Show the container
    container.style.display = 'block';

    console.log(`Matrix values plot rendered`);
}

async function highlightSingleResidueInMolstar(residue) {
    if (!molstarViewer) return;

    try {
        // PDB residue numbers are 1-indexed, matrix indices are 0-indexed
        const pdbResidue = residue + 1;

        // Clear previous selection
        await molstarViewer.visual.clearSelection();

        // Select the single residue with yellow highlighting
        const selections = [
            {
                struct_asym_id: 'A',
                start_residue_number: pdbResidue,
                end_residue_number: pdbResidue,
                color: { r: 255, g: 255, b: 0 }
            }
        ];

        await molstarViewer.visual.select({ data: selections });

        console.log(`Highlighted residue ${pdbResidue} in PDBe Molstar`);

    } catch (error) {
        console.error('Error highlighting residue in PDBe Molstar:', error);
    }
}

// Unified function to apply all Molstar colors
async function applyMolstarColors() {
    if (!molstarViewer) return;

    try {
        await molstarViewer.visual.clearSelection();

        const selections = [];

        // Get sequence length to color all residues
        const seqLength = currentMatrixData ? currentMatrixData.size : 0;

        if (seqLength > 0) {
            // Color all residues
            for (let i = 0; i < seqLength; i++) {
                const residueNum = i + 1;  // 1-indexed for PDB

                // Determine color based on state
                let color;
                if (hoverResidues.includes(i)) {
                    color = { r: 255, g: 255, b: 0 };  // Yellow for hover
                } else if (selectedRegionResidues.includes(i)) {
                    color = { r: 0, g: 255, b: 0 };  // Green for selection
                } else {
                    color = { r: 128, g: 0, b: 128 };  // Purple for base color
                }

                selections.push({
                    struct_asym_id: 'A',
                    start_residue_number: residueNum,
                    end_residue_number: residueNum,
                    color: color
                });
            }
        }

        await molstarViewer.visual.select({ data: selections });
    } catch (error) {
        console.error('Error applying Molstar colors:', error);
    }
}

async function highlightResiduesInMolstar(residue1, residue2) {
    if (!molstarViewer) return;

    try {
        // Update hover state
        hoverResidues = [residue1, residue2];

        // Apply all colors
        await applyMolstarColors();
    } catch (error) {
        console.error('Error highlighting residues in PDBe Molstar:', error);
    }
}

async function highlightRegionInMolstar(residues) {
    if (!molstarViewer || !residues || residues.length === 0) return;

    try {
        // Store the selected region globally so it persists across hovers
        selectedRegionResidues = residues;

        // Apply all colors
        await applyMolstarColors();
    } catch (error) {
        console.error('Error highlighting region in PDBe Molstar:', error);
    }
}

async function clearHighlightInMolstar() {
    if (!molstarViewer) return;

    try {
        // Clear hover state
        hoverResidues = [];

        // Apply all colors
        await applyMolstarColors();
    } catch (error) {
        console.error('Error clearing highlight in PDBe Molstar:', error);
    }
}

async function initMolstarViewer() {
    const viewerElement = document.getElementById('molstar-viewer');

    try {
        console.log('Initializing PDBe Molstar viewer...');

        // Completely recreate the viewer element to ensure clean state
        const parent = viewerElement.parentNode;
        const newViewerElement = document.createElement('div');
        newViewerElement.id = 'molstar-viewer';
        // Keep the size updateMolstarViewerSize gave it to match the matrix
        newViewerElement.style.cssText = viewerElement.style.cssText;
        parent.replaceChild(newViewerElement, viewerElement);

        // Small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create the PDBe Molstar viewer instance
        const viewerInstance = new PDBeMolstarPlugin();

        // Initialize with options
        const options = {
            customData: {
                url: new URL(dataUrl(`${currentProtein}.pdb`), window.location.href).href,
                format: 'pdb'
            },
            hideControls: true,
            hideCanvasControls: ['expand', 'selection', 'animation'],
            sequencePanel: true,
            pdbeUrl: window.location.origin,
            expanded: false,
            landscape: false
        };

        await viewerInstance.render(newViewerElement, options);
        molstarViewer = viewerInstance;

        // Apply initial color scheme (purple base, green selection, yellow hover)
        await applyMolstarColors();

        console.log('PDBe Molstar viewer initialized and structure loaded');
    } catch (error) {
        console.error('Error initializing PDBe Molstar viewer:', error);
        throw error;
    }
}

// The reference sequence arrives with the sequence bundle, so this only has
// to make sure that bundle has been loaded.
async function fetchReferenceSequence() {
    try {
        await ensureSequences();
        console.log(`Reference sequence loaded: ${referenceSequence.length} residues`);
    } catch (error) {
        console.error('Error fetching reference sequence:', error);
    }
}

function renderAlignmentQualityPlot(alignmentQuality) {
    const svg = document.getElementById('alignment-quality-plot');

    // Clear previous content
    svg.innerHTML = '';

    if (!alignmentQuality || alignmentQuality.length === 0) {
        console.warn('No alignment quality data to plot');
        return;
    }

    // Configuration
    const width = 800;
    const height = 300;
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Set SVG dimensions
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Find min and max values for scaling
    const minValue = Math.min(...alignmentQuality);
    const maxValue = Math.max(...alignmentQuality);
    const numSequences = alignmentQuality.length;

    // Create scales
    const xScale = (index) => margin.left + (index / (numSequences - 1)) * plotWidth;
    const yScale = (value) => margin.top + plotHeight - ((value - minValue) / (maxValue - minValue)) * plotHeight;

    // Create background
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', margin.left);
    bgRect.setAttribute('y', margin.top);
    bgRect.setAttribute('width', plotWidth);
    bgRect.setAttribute('height', plotHeight);
    bgRect.setAttribute('fill', '#f9f9f9');
    bgRect.setAttribute('stroke', '#ddd');
    svg.appendChild(bgRect);

    // Draw grid lines
    const numGridLines = 5;
    for (let i = 0; i <= numGridLines; i++) {
        const y = margin.top + (i / numGridLines) * plotHeight;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', margin.left);
        line.setAttribute('x2', margin.left + plotWidth);
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#ddd');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);

        // Add y-axis labels
        const value = maxValue - (i / numGridLines) * (maxValue - minValue);
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', margin.left - 10);
        label.setAttribute('y', y);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('font-size', '12px');
        label.setAttribute('fill', '#666');
        label.textContent = Math.round(value);
        svg.appendChild(label);
    }

    // Add dots at data points (point plot, no connecting lines)
    for (let i = 0; i < alignmentQuality.length; i++) {
        const x = xScale(i);
        const y = yScale(alignmentQuality[i]);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '2');
        circle.setAttribute('fill', '#2c3e50');
        circle.setAttribute('opacity', '0.6');

        // Add hover effect with tooltip
        circle.addEventListener('mouseenter', function() {
            this.setAttribute('r', '4');
            this.setAttribute('fill', '#3498db');
            this.setAttribute('opacity', '1');
        });

        circle.addEventListener('mouseleave', function() {
            this.setAttribute('r', '2');
            this.setAttribute('fill', '#2c3e50');
            this.setAttribute('opacity', '0.6');
        });

        svg.appendChild(circle);
    }

    // Add x-axis label
    const xAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xAxisLabel.setAttribute('x', margin.left + plotWidth / 2);
    xAxisLabel.setAttribute('y', height - 5);
    xAxisLabel.setAttribute('text-anchor', 'middle');
    xAxisLabel.setAttribute('font-size', '14px');
    xAxisLabel.setAttribute('fill', '#333');
    xAxisLabel.textContent = 'Sequence Index';
    svg.appendChild(xAxisLabel);

    // Add y-axis label
    const yAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    // Placed at its rotation centre, so rotating keeps it inside the left margin
    yAxisLabel.setAttribute('x', 16);
    yAxisLabel.setAttribute('y', margin.top + plotHeight / 2);
    yAxisLabel.setAttribute('text-anchor', 'middle');
    yAxisLabel.setAttribute('font-size', '14px');
    yAxisLabel.setAttribute('fill', '#333');
    yAxisLabel.setAttribute('transform', `rotate(-90, 16, ${margin.top + plotHeight / 2})`);
    yAxisLabel.textContent = 'Properly Aligned Residues';
    svg.appendChild(yAxisLabel);

    console.log(`Rendered alignment quality plot with ${alignmentQuality.length} sequences`);
}
