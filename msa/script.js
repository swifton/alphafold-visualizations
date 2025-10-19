// Main application script
document.addEventListener('DOMContentLoaded', async () => {
    console.log('MSA Visualizations app loaded');

    // Load initial sequences
    await loadSequences('/api/msa');

    // Add event listener to Next button
    const nextBtn = document.getElementById('next-btn');
    nextBtn.addEventListener('click', async () => {
        await loadSequences('/api/next');
    });

    // Add event listener to Matrix button
    const matrixBtn = document.getElementById('matrix-btn');
    matrixBtn.addEventListener('click', async () => {
        await loadMatrix();
    });
});

async function loadSequences(endpoint) {
    const fileLoader = document.getElementById('file-loader');

    try {
        // Fetch MSA data from backend API
        const response = await fetch(endpoint);

        if (!response.ok) {
            throw new Error(`Failed to load file: ${response.statusText}`);
        }

        const data = await response.json();

        // Update the display
        fileLoader.innerHTML = `
            <h2>MSA Sequence Alignment</h2>
            <p>File: ${data.filename}</p>
            <p>Showing sequence ${data.current_index + 1} of ${data.total_sequences}</p>
            <p>Sequence 1 (reference): ${data.seq1_length} amino acids</p>
            <p>Sequence 2: ${data.seq2_length} amino acids ${data.seq2_header ? '- ' + data.seq2_header : ''}</p>
        `;

        console.log(`Loaded sequence ${data.current_index + 1} of ${data.total_sequences}`);
        console.log(`Alignment has ${data.alignment.length} positions`);

        // Clear previous visualization
        const svg = document.getElementById('sequence-viz');
        svg.innerHTML = '';

        visualizeAlignment(data.seq1, data.seq2, data.alignment);

    } catch (error) {
        console.error('Error loading file:', error);
        fileLoader.innerHTML = `
            <h2>MSA Sequence Visualization</h2>
            <p style="color: red;">Error loading MSA data: ${error.message}</p>
            <p>Make sure the Python server is running (python3 server.py)</p>
        `;
    }
}

function visualizeAlignment(seq1, seq2, alignment) {
    // Configuration
    const boxSize = 30;
    const padding = 2;
    const rowGap = 10;
    const color1 = '#2ca02c';  // Green for sequence 1
    const color2 = '#1f77b4';  // Blue for sequence 2
    const mismatchColor = '#d62728';  // Red for mismatches
    const gapColor = '#e0e0e0'; // Light gray for gaps

    // Calculate dimensions (two rows)
    const width = alignment.length * (boxSize + padding);
    const height = 2 * boxSize + rowGap + padding;

    // Get SVG element
    const svg = document.getElementById('sequence-viz');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    // Remove dashes from sequences to get actual characters by index
    const seq1_clean = seq1.replace(/-/g, '');
    const seq2_clean = seq2.replace(/-/g, '');

    // Create visualization for each alignment position
    for (let i = 0; i < alignment.length; i++) {
        const [idx1, idx2] = alignment[i];
        const x = i * (boxSize + padding);

        // Check if this is a mismatch (both have amino acids but they're different)
        const isMismatch = idx1 !== -1 && idx2 !== -1 && seq1_clean[idx1] !== seq2_clean[idx2];

        // Draw sequence 1 box (top row)
        const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect1.setAttribute('x', x);
        rect1.setAttribute('y', 0);
        rect1.setAttribute('width', boxSize);
        rect1.setAttribute('height', boxSize);

        if (idx1 === -1) {
            // Gap in sequence 1
            rect1.setAttribute('fill', gapColor);
            rect1.setAttribute('stroke', '#999');
            rect1.setAttribute('stroke-dasharray', '3,3');
        } else if (isMismatch) {
            // Mismatch - use red
            rect1.setAttribute('fill', mismatchColor);
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
        if (idx1 !== -1) {
            const text1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text1.setAttribute('x', x + boxSize / 2);
            text1.setAttribute('y', boxSize / 2);
            text1.setAttribute('text-anchor', 'middle');
            text1.setAttribute('dominant-baseline', 'central');
            text1.setAttribute('fill', 'white');
            text1.setAttribute('font-size', '14px');
            text1.setAttribute('font-weight', 'bold');
            text1.setAttribute('font-family', 'monospace');
            text1.textContent = seq1_clean[idx1];
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

        if (idx2 === -1) {
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
        if (idx2 !== -1) {
            const text2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text2.setAttribute('x', x + boxSize / 2);
            text2.setAttribute('y', boxSize + rowGap + boxSize / 2);
            text2.setAttribute('text-anchor', 'middle');
            text2.setAttribute('dominant-baseline', 'central');
            text2.setAttribute('fill', 'white');
            text2.setAttribute('font-size', '14px');
            text2.setAttribute('font-weight', 'bold');
            text2.setAttribute('font-family', 'monospace');
            text2.textContent = seq2_clean[idx2];
            g2.appendChild(text2);
        }
        svg.appendChild(g2);
    }

    console.log(`Visualized alignment of ${alignment.length} positions`);
}

async function loadMatrix() {
    const matrixBtn = document.getElementById('matrix-btn');
    const spinner = document.getElementById('matrix-spinner');
    const matrixVisualization = document.getElementById('matrix-visualization');

    try {
        // Disable button and show spinner
        matrixBtn.disabled = true;
        spinner.style.display = 'block';

        console.log('Requesting matrix from server...');

        // Make request to server
        const response = await fetch('/api/matrix');

        if (!response.ok) {
            throw new Error(`Failed to load matrix: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Matrix received');

        if (data.success) {
            // Render the matrix as SVG
            renderMatrixSVG(data.matrix, data.size, data.min_value, data.max_value);

            // Render the diff_count visualization
            renderDiffCountSVG(data.diff_count, data.size, data.diff_count_min, data.diff_count_max);

            matrixVisualization.style.display = 'block';

            // Initialize Mol* viewer
            await initMolstarViewer();

            console.log('Matrix visualization displayed');
        } else {
            throw new Error(data.error || 'Failed to generate matrix');
        }

    } catch (error) {
        console.error('Error loading matrix:', error);
        alert(`Error loading matrix: ${error.message}`);
    } finally {
        // Re-enable button and hide spinner
        matrixBtn.disabled = false;
        spinner.style.display = 'none';
    }
}

function renderMatrixSVG(matrix, size, minValue, maxValue) {
    const svg = document.getElementById('matrix-svg');
    const positionDisplay = document.getElementById('matrix-position');

    // Clear previous content
    svg.innerHTML = '';

    // Configuration
    const cellSize = 10; // Size of each cell in pixels
    const width = size * cellSize;
    const height = size * cellSize;

    // Set SVG dimensions
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Create color scale function (coolwarm colormap approximation)
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

    // Render each cell
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const value = matrix[row][col];
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

            rect.setAttribute('x', col * cellSize);
            rect.setAttribute('y', row * cellSize);
            rect.setAttribute('width', cellSize);
            rect.setAttribute('height', cellSize);
            rect.setAttribute('fill', getColor(value));

            // Add hover event to display position and highlight in Mol*
            rect.addEventListener('mouseenter', () => {
                positionDisplay.textContent = `Position: (${row}, ${col}) Value: ${value.toFixed(2)}`;
                highlightResiduesInMolstar(row, col);
            });

            rect.addEventListener('mouseleave', () => {
                positionDisplay.textContent = '';
                clearHighlightInMolstar();
            });

            svg.appendChild(rect);
        }
    }

    console.log(`Rendered ${size}x${size} matrix with ${size * size} cells`);
}

let molstarViewer = null;

function renderDiffCountSVG(diffCount, size, minValue, maxValue) {
    const svg = document.getElementById('diff-count-svg');
    const positionDisplay = document.getElementById('matrix-position');

    // Clear previous content
    svg.innerHTML = '';

    // Configuration
    const cellSize = 10; // Match the matrix cell size
    const cellHeight = 30; // Taller cells for better visibility
    const width = size * cellSize;
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

    // Render each cell
    for (let i = 0; i < size; i++) {
        const value = diffCount[i];
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

        rect.setAttribute('x', i * cellSize);
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

async function highlightResiduesInMolstar(residue1, residue2) {
    if (!molstarViewer) return;

    try {
        // PDB residue numbers are 1-indexed, matrix indices are 0-indexed
        const pdbResidue1 = residue1 + 1;
        const pdbResidue2 = residue2 + 1;

        // PDBe Molstar uses a simple selection API
        // Clear previous selection
        await molstarViewer.visual.clearSelection();

        // Select both residues with yellow highlighting
        const selections = [
            {
                struct_asym_id: 'A',
                start_residue_number: pdbResidue1,
                end_residue_number: pdbResidue1,
                color: { r: 255, g: 255, b: 0 }
            },
            {
                struct_asym_id: 'A',
                start_residue_number: pdbResidue2,
                end_residue_number: pdbResidue2,
                color: { r: 255, g: 255, b: 0 }
            }
        ];

        await molstarViewer.visual.select({ data: selections });
    } catch (error) {
        console.error('Error highlighting residues in PDBe Molstar:', error);
    }
}

async function clearHighlightInMolstar() {
    if (!molstarViewer) return;

    try {
        await molstarViewer.visual.clearSelection();
    } catch (error) {
        console.error('Error clearing highlight in PDBe Molstar:', error);
    }
}

async function initMolstarViewer() {
    // Don't reinitialize if already created
    if (molstarViewer) {
        console.log('PDBe Molstar viewer already initialized');
        return;
    }

    const viewerElement = document.getElementById('molstar-viewer');

    try {
        console.log('Initializing PDBe Molstar viewer...');

        // Create the PDBe Molstar viewer instance
        const viewerInstance = new PDBeMolstarPlugin();

        // Initialize with options
        const options = {
            customData: {
                url: '/lamprey.pdb',
                format: 'pdb'
            },
            hideControls: true,
            hideCanvasControls: ['expand', 'selection', 'animation'],
            sequencePanel: true,
            pdbeUrl: window.location.origin,
            expanded: false,
            landscape: false
        };

        await viewerInstance.render(viewerElement, options);
        molstarViewer = viewerInstance;

        console.log('PDBe Molstar viewer initialized and structure loaded');

    } catch (error) {
        console.error('Error initializing PDBe Molstar viewer:', error);
        throw error;
    }
}
