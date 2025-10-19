#!/usr/bin/env python3
"""
Minimal web server for MSA visualization
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import numpy as np


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
    Build diff_matrix by tracking which letters in sequences were changed
    compared to the first sequence. Uses Needleman-Wunsch alignment to handle
    sequences of different lengths.

    Returns:
        tuple: (matrix, diff_count, diff_matrix)
    """
    first_line = None
    matrix = None
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
                    matrix = np.ones((n, n), dtype=float)  # initialize to ones
    if first_line is None:
        raise ValueError("No valid lines found in file.")

    diff_count = np.zeros(n, dtype=float)
    diff_matrix = np.zeros((n, n), dtype=float)

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

        for idx1, idx2 in alignment:
            # Both positions have amino acids (not gaps)
            if idx1 != -1 and idx2 != -1:
                if first_clean[idx1] != line_clean[idx2]:
                    # Different amino acids at aligned positions
                    diff_indices.append(idx1)
                else:
                    # Same amino acids at aligned positions
                    same_indices.append(idx1)
            elif idx1 != -1:
                # Gap in the aligned sequence (deletion) - treat as difference
                diff_indices.append(idx1)

        # Update diff_count for positions that differ
        for i in diff_indices:
            diff_count[i] += 1

        # Fill diff_matrix: for each i in diff_indices, for each j in same_indices
        for i in range(len(diff_indices)):
            for j in range(i+1, len(diff_indices)):
                diff_matrix[diff_indices[i]][diff_indices[j]] += 1
                diff_matrix[diff_indices[j]][diff_indices[i]] += 1

        # Fill matrix: for pairs of same_indices
        for i in range(len(same_indices)):
            for j in range(i+1, len(same_indices)):
                matrix[same_indices[i]][same_indices[j]] += 1
                matrix[same_indices[j]][same_indices[i]] += 1

    # Normalize diff_matrix by dividing each entry by the minimum of mutations
    # between the two residues
    normalized_diff_matrix = np.zeros_like(diff_matrix)
    for i in range(n):
        for j in range(n):
            min_mutations = min(diff_count[i], diff_count[j])
            if min_mutations > 0:
                normalized_diff_matrix[i, j] = diff_matrix[i, j] / min_mutations
            else:
                normalized_diff_matrix[i, j] = 0

    return np.array(matrix), diff_count, normalized_diff_matrix


def get_matrix_data(filename):
    """
    Get the diff_matrix data for frontend rendering.

    Args:
        filename: Path to the MSA file

    Returns:
        dict: Dictionary containing matrix data and metadata
    """
    matrix, diff_count, diff_matrix = build_matrix_from_file(filename)

    # Get matrix dimensions
    matrix_size = diff_matrix.shape[0]

    # Get min and max values for color scaling
    min_val = float(np.min(diff_matrix))
    max_val = float(np.max(diff_matrix))

    # Convert matrix to list for JSON serialization
    matrix_data = diff_matrix.tolist()

    return {
        'matrix': matrix_data,
        'size': matrix_size,
        'min_value': min_val,
        'max_value': max_val
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
    # Class variable to store current sequence index
    current_sequence_index = 0
    def do_GET(self):
        if self.path == '/':
            # Serve the main HTML page
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            with open('index.html', 'rb') as f:
                self.wfile.write(f.read())

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

        elif self.path == '/lamprey.pdb':
            # Serve PDB file
            self.send_response(200)
            self.send_header('Content-type', 'chemical/x-pdb')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            with open('lamprey.pdb', 'rb') as f:
                self.wfile.write(f.read())

        elif self.path == '/api/msa':
            # API endpoint to get MSA file content with alignment
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Get the current sequence based on index
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

        elif self.path == '/api/matrix':
            # API endpoint to get the matrix data
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            try:
                # Get the matrix data
                matrix_data = get_matrix_data('lamprey.a3m')
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

        with open('lamprey.a3m', 'r') as f:
            lines = f.readlines()
            total_lines = len(lines)

            # Get reference sequence (line 3, index 2)
            if len(lines) > 2:
                seq1 = lines[2].rstrip('\n')

            # Count total sequences (every other line starting from line 7)
            total_sequences = (total_lines - 3) // 2

            # Check if we've gone past the end, wrap around
            if MSAHandler.current_sequence_index >= total_sequences:
                MSAHandler.current_sequence_index = 0
                target_line_index = 6

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
            'filename': 'lamprey.a3m',
            'seq1': seq1,
            'seq2': seq2,
            'seq2_header': seq2_header,
            'alignment': alignment,
            'seq1_length': len(seq1.replace('-', '')),
            'seq2_length': len(seq2.replace('-', '')),
            'current_index': MSAHandler.current_sequence_index,
            'total_sequences': total_sequences
        }

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
