#!/usr/bin/env python3
"""
Minimal web server for MSA visualization
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import random
import numpy as np

# Configuration
PROTEIN_NAME = 'insulin'


def get_available_proteins():
    """
    Get list of available protein examples from the examples folder.

    Returns:
        list: List of protein names (subfolder names)
    """
    examples_dir = 'examples'
    if not os.path.exists(examples_dir):
        return []

    proteins = []
    for item in os.listdir(examples_dir):
        item_path = os.path.join(examples_dir, item)
        if os.path.isdir(item_path):
            proteins.append(item)

    return sorted(proteins)


def align_sequences(seq1, seq2):
    """
    Align two sequences using Needleman-Wunsch algorithm.
    Dashes are treated as gap characters (not part of the actual sequence).

    Returns a list of tuples where each tuple is:
    - (idx1, idx2): matching positions in both sequences
    - (idx1, -1): deletion in seq2 (gap in seq2)
    - (-1, idx2): insertion in seq2 (gap in seq1)

    Args:
        seq1: Reference sequence (string), may contain dashes '-' for gaps
        seq2: Aligned sequence (string), may contain dashes '-' for gaps

    Returns:
        List of tuples representing the alignment
    """
    # Remove dashes from both sequences before alignment
    # We'll treat dashes as pre-existing gaps that should be preserved
    seq1_clean = seq1.replace('-', '')
    seq2_clean = seq2.replace('-', '')

    # Use Needleman-Wunsch algorithm on clean sequences
    alignment = needleman_wunsch(seq1_clean, seq2_clean)

    return alignment


def build_matrix_from_file(filename):
    """
    Build mutation_matrix by tracking which letters in sequences were changed
    compared to the first sequence. Uses Needleman-Wunsch alignment to handle
    sequences of different lengths.
    """
    first_line = None
    lines = []
    with open(filename) as f:
        for line in f:
            line = line.rstrip('\n')
            if line and (line[0] == '-' or ('A' <= line[0] <= 'Z')):
                line = line.upper()
                lines.append(line)
                if first_line is None:
                    first_line = line
                    # Get the length of the first sequence (without gaps)
                    first_clean = first_line.replace('-', '')
                    n = len(first_clean)
    if first_line is None:
        raise ValueError("No valid lines found in file.")

    diff_count = np.zeros(n, dtype=float)
    mutation_matrix = np.zeros((n, n), dtype=float)
    alignment_quality = []  # Track number of properly aligned residues per sequence

    total_sequences = len(lines) - 1

    # Process each sequence (skip the first one since it's the reference)
    for line in lines[1:]:
        # Align the current sequence with the first sequence
        alignment = align_sequences(first_line, line)

        # Get clean sequences (without gaps)
        first_clean = first_line.replace('-', '')
        line_clean = line.replace('-', '')

        # Track which positions in the first sequence are different/same
        diff_indices = []
        same_indices = []
        aligned_count = 0  # Count properly aligned residues (matching positions)

        for idx1, idx2 in alignment:
            # Both positions have amino acids (not gaps)
            if idx1 != -1 and idx2 != -1:
                if first_clean[idx1] != line_clean[idx2]:
                    # Different amino acids at aligned positions
                    diff_indices.append(idx1)
                else:
                    # Same amino acids at aligned positions
                    same_indices.append(idx1)
                    aligned_count += 1  # Count as properly aligned
            elif idx1 != -1:
                # Gap in the aligned sequence (deletion) - treat as difference
                diff_indices.append(idx1)

        # Save the alignment quality for this sequence
        alignment_quality.append(aligned_count)

        # Update diff_count for positions that differ
        for i in diff_indices:
            diff_count[i] += 1

        # Fill mutation_matrix: for each i in diff_indices, for each j in same_indices
        for i in range(len(diff_indices)):
            for j in range(i+1, len(diff_indices)):
                mutation_matrix[diff_indices[i]][diff_indices[j]] += 1
                mutation_matrix[diff_indices[j]][diff_indices[i]] += 1

    # Normalize using the new formula:
    # normalized[i,j] = (count[i,j] / N) - (mutations[i] * mutations[j] / N^2)
    # where N = total_sequences
    # This gives the correlation adjusted for individual mutation frequencies
    normalized_mutation_matrix = np.zeros_like(mutation_matrix)
    for i in range(n):
        for j in range(n):
            if i == j:
                # Set diagonal elements to zero
                normalized_mutation_matrix[i, j] = 0
            else:
                # First term: observed co-mutation frequency
                observed = mutation_matrix[i, j] / total_sequences

                # Second term: expected co-mutation if mutations were independent
                expected = (diff_count[i] * diff_count[j]) / (total_sequences ** 2)

                # Variances
                mean_i = diff_count[i] / total_sequences
                mean_j = diff_count[j] / total_sequences
                var_i = (mean_i - mean_i ** 2)
                var_j = (mean_j - mean_j ** 2)

                # Normalized value = observed - expected
                normalized_mutation_matrix[i, j] = (observed - expected) / (var_i * var_j)

    return diff_count, normalized_mutation_matrix, alignment_quality


def get_matrix_data(filename):
    """
    Get the mutation_matrix data for frontend rendering.

    Args:
        filename: Path to the MSA file

    Returns:
        dict: Dictionary containing matrix data and metadata
    """
    diff_count, mutation_matrix, alignment_quality = build_matrix_from_file(filename)

    # Get matrix dimensions
    matrix_size = mutation_matrix.shape[0]

    # Get min and max values for color scaling, excluding diagonal elements
    # Create a mask for non-diagonal elements
    non_diagonal_mask = ~np.eye(matrix_size, dtype=bool)
    non_diagonal_values = mutation_matrix[non_diagonal_mask]

    min_val = float(np.min(non_diagonal_values))
    max_val = float(np.max(non_diagonal_values))

    # Get min and max for diff_count
    diff_count_min = float(np.min(diff_count))
    diff_count_max = float(np.max(diff_count))

    # Convert matrix to list for JSON serialization
    matrix_data = mutation_matrix.tolist()
    diff_count_data = diff_count.tolist()

    return {
        'matrix': matrix_data,
        'size': matrix_size,
        'min_value': min_val,
        'max_value': max_val,
        'diff_count': diff_count_data,
        'diff_count_min': diff_count_min,
        'diff_count_max': diff_count_max,
        'alignment_quality': alignment_quality
    }


def needleman_wunsch(seq1, seq2):
    """
    Needleman-Wunsch global sequence alignment algorithm.

    Args:
        seq1: First sequence (string)
        seq2: Second sequence (string)

    Returns:
        List of tuples representing the alignment
    """
    # Scoring scheme
    match_score = 1
    mismatch_score = -1
    gap_penalty = -2

    m, n = len(seq1), len(seq2)

    # Initialize scoring matrix
    score = [[0] * (n + 1) for _ in range(m + 1)]

    # Initialize first row and column
    for i in range(m + 1):
        score[i][0] = gap_penalty * i
    for j in range(n + 1):
        score[0][j] = gap_penalty * j

    # Fill the scoring matrix
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            match = score[i-1][j-1] + (match_score if seq1[i-1] == seq2[j-1] else mismatch_score)
            delete = score[i-1][j] + gap_penalty
            insert = score[i][j-1] + gap_penalty
            score[i][j] = max(match, delete, insert)

    # Traceback to find alignment
    alignment = []
    i, j = m, n

    while i > 0 or j > 0:
        if i > 0 and j > 0 and score[i][j] == score[i-1][j-1] + (match_score if seq1[i-1] == seq2[j-1] else mismatch_score):
            # Match or mismatch
            alignment.append((i-1, j-1))
            i -= 1
            j -= 1
        elif i > 0 and score[i][j] == score[i-1][j] + gap_penalty:
            # Deletion (gap in seq2)
            alignment.append((i-1, -1))
            i -= 1
        else:
            # Insertion (gap in seq1)
            alignment.append((-1, j-1))
            j -= 1

    # Reverse alignment (traceback builds it backwards)
    alignment.reverse()

    return alignment


class MSAHandler(BaseHTTPRequestHandler):
    # Class variables
    current_sequence_index = 0
    current_protein = PROTEIN_NAME  # Track currently selected protein

    def do_GET(self):
        if self.path == '/':
            # Serve the main HTML page with protein list injected
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()

            # Get available proteins
            proteins = get_available_proteins()

            # Read HTML and inject protein data
            with open('index.html', 'r') as f:
                html_content = f.read()

            # Inject protein list and current protein as a script tag before </head>
            protein_data_script = f'''
                    <script>
                        window.AVAILABLE_PROTEINS = {json.dumps(proteins)};
                        window.CURRENT_PROTEIN = {json.dumps(MSAHandler.current_protein)};
                    </script>
                </head>'''
            html_content = html_content.replace('</head>', protein_data_script)

            self.wfile.write(html_content.encode('utf-8'))

        elif self.path == '/styles.css':
            # Serve CSS
            self.send_response(200)
            self.send_header('Content-type', 'text/css')
            self.end_headers()
            with open('styles.css', 'rb') as f:
                self.wfile.write(f.read())

        elif self.path == '/script.js':
            # Serve JavaScript
            self.send_response(200)
            self.send_header('Content-type', 'application/javascript')
            self.end_headers()
            with open('script.js', 'rb') as f:
                self.wfile.write(f.read())

        elif self.path == f'/pdb':
            # Serve PDB file from examples folder
            self.send_response(200)
            self.send_header('Content-type', 'chemical/x-pdb')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            pdb_path = f'examples/{MSAHandler.current_protein}/{MSAHandler.current_protein}.pdb'
            with open(pdb_path, 'rb') as f:
                self.wfile.write(f.read())

        elif self.path == '/api/msa':
            # API endpoint to get MSA file content with alignment
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Get the current sequence based on index
            response = self.get_sequence_alignment()
            self.wfile.write(json.dumps(response).encode())

        elif self.path == '/api/previous':
            # API endpoint to get the previous sequence
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Decrement the sequence index
            MSAHandler.current_sequence_index -= 1

            # Get the previous sequence
            response = self.get_sequence_alignment()
            self.wfile.write(json.dumps(response).encode())

        elif self.path == '/api/next':
            # API endpoint to get the next sequence
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Increment the sequence index
            MSAHandler.current_sequence_index += 1

            # Get the next sequence
            response = self.get_sequence_alignment()
            self.wfile.write(json.dumps(response).encode())

        elif self.path == '/api/random':
            # API endpoint to get a random sequence
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Set a random sequence index
            # First, we need to know the total number of sequences
            a3m_path = f'examples/{MSAHandler.current_protein}/{MSAHandler.current_protein}.a3m'
            with open(a3m_path, 'r') as f:
                lines = f.readlines()
                total_sequences = (len(lines) - 3) // 2

            # Generate random index
            MSAHandler.current_sequence_index = random.randint(0, total_sequences - 1)

            # Get the random sequence
            response = self.get_sequence_alignment()
            self.wfile.write(json.dumps(response).encode())

        elif self.path == '/api/matrix':
            # API endpoint to get the matrix data
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            try:
                # Get the matrix data
                a3m_path = f'examples/{MSAHandler.current_protein}/{MSAHandler.current_protein}.a3m'
                matrix_data = get_matrix_data(a3m_path)
                response = {
                    'success': True,
                    **matrix_data
                }
            except Exception as e:
                response = {
                    'success': False,
                    'error': str(e)
                }

            self.wfile.write(json.dumps(response).encode())

        elif self.path == '/api/reference-sequence':
            # API endpoint to get the reference sequence
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            try:
                # Read the reference sequence from .a3m file (line 3, index 2)
                a3m_path = f'examples/{MSAHandler.current_protein}/{MSAHandler.current_protein}.a3m'
                with open(a3m_path, 'r') as f:
                    lines = f.readlines()
                    if len(lines) > 2:
                        ref_seq = lines[2].rstrip('\n').replace('-', '')
                        response = {
                            'success': True,
                            'sequence': ref_seq
                        }
                    else:
                        response = {
                            'success': False,
                            'error': 'Reference sequence not found'
                        }
            except Exception as e:
                response = {
                    'success': False,
                    'error': str(e)
                }

            self.wfile.write(json.dumps(response).encode())

        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

    def get_sequence_alignment(self):
        """
        Get alignment for current sequence index.
        Reference sequence is always line 3.
        Comparison sequences start at line 7 and every other line after (7, 9, 11, ...).
        """
        seq1 = ""
        seq2 = ""
        seq2_header = ""
        total_sequences = 0

        # Calculate the target line for seq2
        # Sequence lines are at indices: 2 (reference), 4, 6, 8, 10, 12, ...
        target_line_index = 4 + (MSAHandler.current_sequence_index * 2)

        a3m_path = f'examples/{MSAHandler.current_protein}/{MSAHandler.current_protein}.a3m'
        with open(a3m_path, 'r') as f:
            lines = f.readlines()
            total_lines = len(lines)

            # Get reference sequence (line 3, index 2)
            if len(lines) > 2:
                seq1 = lines[2].rstrip('\n')

            # Count total sequences (every other line starting from line 7)
            total_sequences = (total_lines - 3) // 2

            # Check if we've gone past the end, wrap around to the beginning
            if MSAHandler.current_sequence_index >= total_sequences:
                MSAHandler.current_sequence_index = 0
                target_line_index = 4
            # Check if we've gone before the beginning, wrap around to the end
            elif MSAHandler.current_sequence_index < 0:
                MSAHandler.current_sequence_index = total_sequences - 1
                target_line_index = 4 + (MSAHandler.current_sequence_index * 2)

            # Get the target sequence
            if target_line_index < total_lines:
                # Get header (line before sequence)
                if target_line_index > 0:
                    seq2_header = lines[target_line_index - 1].rstrip('\n')
                seq2 = lines[target_line_index].rstrip('\n')
            else:
                # Shouldn't happen but handle gracefully
                seq2 = seq1

        # Compute alignment
        alignment = align_sequences(seq1, seq2)

        return {
            'filename': f'{MSAHandler.current_protein}.a3m',
            'seq1': seq1,
            'seq2': seq2,
            'seq2_header': seq2_header,
            'alignment': alignment,
            'seq1_length': len(seq1.replace('-', '')),
            'seq2_length': len(seq2.replace('-', '')),
            'current_index': MSAHandler.current_sequence_index,
            'total_sequences': total_sequences
        }

    def do_POST(self):
        if self.path == '/api/select-protein':
            # Handle protein selection
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            selected_protein = data.get('protein')

            if selected_protein:
                # Update the current protein
                MSAHandler.current_protein = selected_protein
                # Reset sequence index when switching proteins
                MSAHandler.current_sequence_index = 0

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()

                response = {
                    'success': True,
                    'protein': selected_protein
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))

                print(f"Switched to protein: {selected_protein}")
            else:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()

                response = {
                    'success': False,
                    'error': 'No protein specified'
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Custom log format
        print(f"[{self.log_date_time_string()}] {format % args}")


def run_server(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, MSAHandler)
    print(f"Server running on http://localhost:{port}")
    print(f"Press Ctrl+C to stop")
    httpd.serve_forever()


if __name__ == '__main__':
    run_server()
