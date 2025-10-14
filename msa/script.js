// Main application script
document.addEventListener('DOMContentLoaded', async () => {
    console.log('MSA Visualizations app loaded');

    const fileLoader = document.getElementById('file-loader');
    const msaPreview = document.getElementById('msa-preview');

    try {
        // Fetch MSA data from backend API
        const response = await fetch('/api/msa');

        if (!response.ok) {
            throw new Error(`Failed to load file: ${response.statusText}`);
        }

        const data = await response.json();

        // Update the display
        fileLoader.innerHTML = `
            <h2>MSA File Viewer</h2>
            <p>File: ${data.filename} (${data.total_lines} lines total)</p>
            <p>Showing first ${data.showing} lines:</p>
        `;

        msaPreview.textContent = data.lines.join('\n');

        console.log(`Loaded ${data.showing} of ${data.total_lines} lines from ${data.filename}`);

    } catch (error) {
        console.error('Error loading file:', error);
        fileLoader.innerHTML = `
            <h2>MSA File Viewer</h2>
            <p style="color: red;">Error loading MSA data: ${error.message}</p>
            <p>Make sure the Python server is running (python3 server.py)</p>
        `;
    }
});
