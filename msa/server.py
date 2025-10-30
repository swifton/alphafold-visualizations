#!/usr/bin/env python3
"""
Minimal web server for MSA visualization
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import random
import time
import numpy as np
import threading
import urllib.request
import urllib.error
import math

# Configuration
PROTEIN_NAME = 'insulin'

# Global counter for tracking UniProt requests
uniprot_request_counter = 0
uniprot_lock = threading.Lock()


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


def fetch_uniprot_data(uniprot_id, request_id, handler):
    """
    Fetch protein data from UniProt API asynchronously.

    Args:
        uniprot_id: The UniProt ID to fetch
        request_id: The request ID to track if this is still the latest request
        handler: The request handler to send the response through
    """
    try:
        uniprot_url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.json"
        print(f"Fetching UniProt data for {uniprot_id} (request #{request_id})")

        with urllib.request.urlopen(uniprot_url, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))

            protein_name = None
            organism = None

            # Extract protein name
            if 'proteinDescription' in data and 'recommendedName' in data['proteinDescription']:
                protein_name = data['proteinDescription']['recommendedName']['fullName']['value']
                print(f"Protein name: {protein_name}")

            # Extract organism
            if 'organism' in data and 'scientificName' in data['organism']:
                organism = data['organism']['scientificName']
                print(f"Organism: {organism}")

            # Extract gene name if available
            if 'genes' in data and len(data['genes']) > 0:
                gene_name = data['genes'][0].get('geneName', {}).get('value', '')
                if gene_name:
                    print(f"Gene: {gene_name}")

            # Check if this is still the most recent request
            with uniprot_lock:
                if request_id == uniprot_request_counter:
                    # Send the response to the client
                    handler.send_uniprot_update(request_id, protein_name, organism)
                    print(f"Sent UniProt data for request #{request_id}")
                else:
                    print(f"Discarding stale UniProt data for request #{request_id} (current: {uniprot_request_counter})")

    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"UniProt ID {uniprot_id} not found")
        else:
            print(f"HTTP error fetching UniProt data: {e.code}")
    except urllib.error.URLError as e:
        print(f"Network error fetching UniProt data: {e.reason}")
    except Exception as e:
        print(f"Error fetching UniProt data: {e}")


def build_matrix_from_file(filename):
    """
    Build mutation_matrix by tracking which letters in sequences were changed
    compared to the first sequence. Compares sequences position-by-position.
    """
    first_line = None
    lines = []
    with open(filename) as f:
        for line in f:
            line = line.rstrip('\n')
            if line and (line[0] == '-' or ('A' <= line[0] <= 'Z')):
                line = ''.join(c for c in line if not c.islower())
                lines.append(line)
                if first_line is None:
                    first_line = line
                    seq_len = len(first_line)
    if first_line is None:
        raise ValueError("No valid lines found in file.")

    diff_count = np.zeros(seq_len, dtype=float)
    mutation_matrix = np.zeros((seq_len, seq_len), dtype=float)
    alignment_quality = []  # Track number of properly aligned residues per sequence

    total_sequences = 0  # Will count only sequences that pass the threshold
    skipped_sequences = 0

    # Process each sequence (skip the first one since it's the reference)
    for line in lines[1:]:
        if len(line) != seq_len:
            print("ERROR: Wrong sequence length: ", len(line), " != ", seq_len)
            continue

        diff_indices = np.zeros(seq_len, dtype=int)
        aligned_count = 0  # Count properly aligned residues (matching positions)

        # Compare position-by-position
        for i in range(seq_len):
            char1 = first_line[i]
            char2 = line[i]

            if char1 != char2:
                # Mismatch
                diff_indices[i] = 1
            else:
                # Match
                aligned_count += 1

        # Calculate alignment percentage
        alignment_percentage = aligned_count / seq_len

        # Exclude low quality matches
        if alignment_percentage < 0.40:
            skipped_sequences += 1
            # continue

        # Save the alignment quality for this sequence
        alignment_quality.append(aligned_count)

        # Update diff_count for positions that differ
        diff_count += diff_indices

        mutation_matrix += np.outer(diff_indices, diff_indices)

        total_sequences += 1

    print(f"Skipped {skipped_sequences} sequences with low alignment quality")
    print(f"Using {total_sequences} sequences for matrix calculation")

    # Normalize using the new formula:
    # normalized[i,j] = (count[i,j] / N) - (mutations[i] * mutations[j] / N^2)
    # where N = total_sequences
    # This gives the correlation adjusted for individual mutation frequencies
    normalized_mutation_matrix = np.zeros_like(mutation_matrix)
    for i in range(seq_len):
        for j in range(seq_len):
            if diff_count[i] == 0 or diff_count[j] == 0:
                continue
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

                if normalized_mutation_matrix[i, j] < 1: 
                    normalized_mutation_matrix[i, j] = 0
                else:
                    normalized_mutation_matrix[i, j] = math.log(normalized_mutation_matrix[i, j])

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

    # Convert matrix to list for JSON serialization
    matrix_data = mutation_matrix.tolist()
    diff_count_data = diff_count.tolist()

    return {
        'matrix': matrix_data,
        'size': matrix_size,
        'diff_count': diff_count_data,
        'alignment_quality': alignment_quality
    }


class MSAHandler(BaseHTTPRequestHandler):
    # Class variables
    current_sequence_index = 0
    current_protein = PROTEIN_NAME  # Track currently selected protein
    latest_uniprot_data = {}  # Store latest UniProt data for polling

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

        elif self.path == '/api/uniprot-poll':
            # API endpoint to poll for UniProt data
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            response = {
                'success': True,
                'data': MSAHandler.latest_uniprot_data
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

        # Remove lowercase letters from seq2
        seq2 = ''.join(c for c in seq2 if not c.islower())

        # Increment request counter and get current request ID
        global uniprot_request_counter
        with uniprot_lock:
            uniprot_request_counter += 1
            current_request_id = uniprot_request_counter

        # Parse UniRef100 metadata to extract UniProt ID and trigger async fetch
        uniprot_id = None
        if seq2_header.startswith('>UniRef100_'):
            try:
                # UniRef100 format: >UniRef100_<UniProtID> ...
                # Extract the UniProt ID (everything after UniRef100_ until the first space)
                uniprot_id = seq2_header.split('_', 1)[1].split(' ')[0].split('\t')[0]
                print(f"UniProt ID: {uniprot_id} (request #{current_request_id})")

                # Start async fetch in background thread
                fetch_thread = threading.Thread(
                    target=fetch_uniprot_data,
                    args=(uniprot_id, current_request_id, self),
                    daemon=True
                )
                fetch_thread.start()

            except Exception as e:
                print(f"Failed to parse UniRef100 header: {e}")

        return {
            'filename': f'{MSAHandler.current_protein}.a3m',
            'seq1': seq1,
            'seq2': seq2,
            'seq2_header': seq2_header,
            'uniprot_id': uniprot_id,
            'request_id': current_request_id,
            'seq1_length': len(seq1.replace('-', '')),
            'seq2_length': len(seq2.replace('-', '')),
            'current_index': MSAHandler.current_sequence_index,
            'total_sequences': total_sequences
        }

    def send_uniprot_update(self, request_id, protein_name, organism):
        """
        Send UniProt data update to client via SSE-style response.
        This is called from the background thread.
        """
        # We can't send another response on the same connection, so we'll need
        # the frontend to poll or use a different approach. Let's store it and
        # create a new endpoint for the frontend to fetch.
        MSAHandler.latest_uniprot_data = {
            'request_id': request_id,
            'protein_name': protein_name,
            'organism': organism
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
