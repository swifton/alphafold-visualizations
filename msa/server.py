#!/usr/bin/env python3
"""
Minimal web server for MSA visualization
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os


def align_sequences(seq1, seq2):
    """
    Align two sequences where seq2 may contain dashes for deletions.

    Returns a list of tuples where each tuple is:
    - (idx1, idx2): matching positions in both sequences
    - (idx1, -1): deletion in seq2 (gap in seq2)
    - (-1, idx2): insertion in seq2 (gap in seq1, represented by dash in seq1 if present)

    Args:
        seq1: Reference sequence (string)
        seq2: Aligned sequence (string), may contain dashes '-' for gaps

    Returns:
        List of tuples representing the alignment
    """
    alignment = []
    idx1 = 0  # Index in seq1
    idx2 = 0  # Index in seq2

    # Handle case where sequences are pre-aligned with dashes
    if '-' in seq1 or '-' in seq2:
        # Sequences are already aligned
        max_len = max(len(seq1), len(seq2))
        for i in range(max_len):
            char1 = seq1[i] if i < len(seq1) else '-'
            char2 = seq2[i] if i < len(seq2) else '-'

            if char1 == '-' and char2 == '-':
                # Both gaps, skip
                continue
            elif char1 == '-':
                # Gap in seq1, insertion in seq2
                alignment.append((-1, idx2))
                idx2 += 1
            elif char2 == '-':
                # Gap in seq2, deletion from seq1
                alignment.append((idx1, -1))
                idx1 += 1
            else:
                # Both have characters
                alignment.append((idx1, idx2))
                idx1 += 1
                idx2 += 1
    else:
        # Simple case: no dashes, sequences align position by position
        min_len = min(len(seq1), len(seq2))
        for i in range(min_len):
            alignment.append((i, i))

        # Handle extra characters in longer sequence
        if len(seq1) > len(seq2):
            for i in range(len(seq2), len(seq1)):
                alignment.append((i, -1))
        elif len(seq2) > len(seq1):
            for i in range(len(seq1), len(seq2)):
                alignment.append((-1, i))

    return alignment


class MSAHandler(BaseHTTPRequestHandler):
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

        elif self.path == '/api/msa':
            # API endpoint to get MSA file content with alignment
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Read line 3 (index 2) and line 7 (index 6)
            seq1 = ""
            seq2 = ""
            total_lines = 0
            with open('lamprey.a3m', 'r') as f:
                for i, line in enumerate(f):
                    total_lines += 1
                    if i == 2:  # Line 3 (index 2)
                        seq1 = line.rstrip('\n')
                    elif i == 6:  # Line 7 (index 6)
                        seq2 = line.rstrip('\n')
                        break

            # Compute alignment
            alignment = align_sequences(seq1, seq2)

            response = {
                'filename': 'lamprey.a3m',
                'seq1': seq1,
                'seq2': seq2,
                'alignment': alignment,
                'seq1_length': len(seq1.replace('-', '')),
                'seq2_length': len(seq2.replace('-', '')),
                'total_lines': total_lines
            }

            self.wfile.write(json.dumps(response).encode())

        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

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
