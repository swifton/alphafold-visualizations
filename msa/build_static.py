#!/usr/bin/env python3
"""
Precompute every API response the frontend used to request at runtime and
write them, with the static assets, into a directory that can be served as-is
by GitHub Pages.

The matrix and distogram maths is imported from server.py rather than
reimplemented, so the static site and the local server stay in agreement.

Run from the msa/ directory:

    python3 build_static.py [--out dist]
"""
import argparse
import json
import os
import shutil

from server import get_distogram_data, get_matrix_data, get_available_proteins

EXAMPLES_DIR = 'examples'
STATIC_FILES = ('index.html', 'styles.css', 'script.js')
DEFAULT_PROTEIN = 'insulin'


def read_sequences(protein_name):
    """
    Extract the reference sequence and every comparison sequence from a .a3m.

    Mirrors the indexing the server used: the reference is at line index 2 and
    comparison sequences are at 4, 6, 8, ... each preceded by its header.
    Lowercase insertion columns are stripped here so the browser does not have
    to, which also makes the payload smaller.

    Returns:
        dict: reference sequence, stripped reference, headers and sequences.
    """
    a3m_path = os.path.join(EXAMPLES_DIR, protein_name, f'{protein_name}.a3m')
    with open(a3m_path, 'r', encoding='utf-8') as handle:
        lines = handle.read().splitlines()

    reference = lines[2] if len(lines) > 2 else ''
    headers = []
    sequences = []
    for index in range(4, len(lines), 2):
        headers.append(lines[index - 1])
        sequences.append(''.join(c for c in lines[index] if not c.islower()))

    return {
        'reference': reference,
        # What /api/reference-sequence used to return.
        'reference_stripped': reference.replace('-', ''),
        'headers': headers,
        'sequences': sequences,
        'total': len(sequences),
    }


def write_json(path, payload):
    """Write payload as compact JSON and report the resulting size."""
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, separators=(',', ':'))
    return os.path.getsize(path)


def build_protein(protein_name, out_dir):
    """Write every data file for one protein. Returns a size report."""
    protein_out = os.path.join(out_dir, 'data', protein_name)
    os.makedirs(protein_out, exist_ok=True)

    a3m_path = os.path.join(EXAMPLES_DIR, protein_name, f'{protein_name}.a3m')
    matrix_data = get_matrix_data(a3m_path)
    distogram_data = get_distogram_data(protein_name)

    sizes = {}
    sizes['matrix.json'] = write_json(
        os.path.join(protein_out, 'matrix.json'),
        {
            'success': True,
            'distogram_available': distogram_data is not None,
            **matrix_data,
        },
    )
    sizes['sequences.json'] = write_json(
        os.path.join(protein_out, 'sequences.json'),
        read_sequences(protein_name),
    )

    if distogram_data is not None:
        sizes['distogram.json'] = write_json(
            os.path.join(protein_out, 'distogram.json'),
            {'success': True, 'available': True, **distogram_data},
        )

    # The structure viewer loads this directly.
    pdb_src = os.path.join(EXAMPLES_DIR, protein_name, f'{protein_name}.pdb')
    if os.path.exists(pdb_src):
        pdb_dst = os.path.join(protein_out, f'{protein_name}.pdb')
        shutil.copyfile(pdb_src, pdb_dst)
        sizes[f'{protein_name}.pdb'] = os.path.getsize(pdb_dst)

    return sizes


def build(out_dir):
    """Build the whole static site into out_dir."""
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(os.path.join(out_dir, 'data'))

    for name in STATIC_FILES:
        shutil.copyfile(name, os.path.join(out_dir, name))

    proteins = get_available_proteins()
    if not proteins:
        raise SystemExit(f'No proteins found in {EXAMPLES_DIR}/')

    default = DEFAULT_PROTEIN if DEFAULT_PROTEIN in proteins else proteins[0]
    write_json(
        os.path.join(out_dir, 'data', 'manifest.json'),
        {'proteins': proteins, 'default': default},
    )

    total = 0
    for protein_name in proteins:
        print(f'\n{protein_name}:')
        for filename, size in build_protein(protein_name, out_dir).items():
            print(f'  {filename:24s} {size / 1024:8.0f} KB')
            total += size

    print(f'\nDefault protein: {default}')
    print(f'Total data: {total / 1024 / 1024:.1f} MB in {out_dir}/')


def main():
    """Parse arguments and build the site."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='dist', help='output directory')
    build(parser.parse_args().out)


if __name__ == '__main__':
    main()
