// Main application script
document.addEventListener('DOMContentLoaded', async () => {
    console.log('MSA Visualizations app loaded');

    const fileLoader = document.getElementById('file-loader');

    try {
        // Fetch MSA data from backend API
        const response = await fetch('/api/msa');

        if (!response.ok) {
            throw new Error(`Failed to load file: ${response.statusText}`);
        }

        const data = await response.json();

        // Update the display
        fileLoader.innerHTML = `
            <h2>MSA Sequence Visualization</h2>
            <p>File: ${data.filename}</p>
            <p>Sequence length: ${data.sequence_length} amino acids</p>
        `;

        console.log(`Loaded sequence of length ${data.sequence_length} from ${data.filename}`);

        visualizeSequence(data.sequence);

    } catch (error) {
        console.error('Error loading file:', error);
        fileLoader.innerHTML = `
            <h2>MSA Sequence Visualization</h2>
            <p style="color: red;">Error loading MSA data: ${error.message}</p>
            <p>Make sure the Python server is running (python3 server.py)</p>
        `;
    }
});

function visualizeSequence(sequence) {
    // Configuration
    const boxSize = 30;
    const padding = 2;
    const color = '#2ca02c';  // Single green color for all letters

    // Calculate dimensions (single row)
    const width = sequence.length * (boxSize + padding);
    const height = boxSize + padding;

    // Get SVG element
    const svg = document.getElementById('sequence-viz');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    // Create rectangles for each letter in a single row
    for (let i = 0; i < sequence.length; i++) {
        const letter = sequence[i];
        const x = i * (boxSize + padding);
        const y = 0;

        // Create group
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Create rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', boxSize);
        rect.setAttribute('height', boxSize);
        rect.setAttribute('fill', color);
        rect.setAttribute('stroke', '#333');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('rx', '2');

        // Create text
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + boxSize / 2);
        text.setAttribute('y', y + boxSize / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', '14px');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('font-family', 'monospace');
        text.textContent = letter;

        // Add to group and SVG
        g.appendChild(rect);
        g.appendChild(text);
        svg.appendChild(g);
    }

    console.log(`Visualized ${sequence.length} amino acids in a single row`);
}
