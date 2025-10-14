#!/usr/bin/env python3
"""
Minimal web server for MSA visualization
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os


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
            # API endpoint to get MSA file content
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Read the first sequence line (line 3, index 2)
            first_sequence = ""
            total_lines = 0
            with open('lamprey.a3m', 'r') as f:
                for i, line in enumerate(f):
                    total_lines += 1
                    if i == 2:  # Third line (index 2)
                        first_sequence = line.rstrip('\n')
                        break

            response = {
                'filename': 'lamprey.a3m',
                'sequence': first_sequence,
                'sequence_length': len(first_sequence),
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
