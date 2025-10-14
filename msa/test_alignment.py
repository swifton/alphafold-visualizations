#!/usr/bin/env python3
"""
Test the align_sequences function
"""
from server import align_sequences


def print_alignment_visual(seq1, seq2, alignment):
    """Print a visual representation of the alignment"""
    line1 = []
    line2 = []
    match_line = []

    for idx1, idx2 in alignment:
        if idx1 == -1:
            line1.append('-')
            line2.append(seq2[idx2])
            match_line.append(' ')
        elif idx2 == -1:
            line1.append(seq1[idx1])
            line2.append('-')
            match_line.append(' ')
        else:
            line1.append(seq1[idx1])
            line2.append(seq2[idx2])
            match_line.append('|' if seq1[idx1] == seq2[idx2] else 'x')

    print(''.join(line1))
    print(''.join(match_line))
    print(''.join(line2))


def test_alignment():
    """Test various alignment scenarios"""

    print("Test 1: Sequences with dashes (pre-aligned)")
    seq1 = "SALTGAGGTHLCGSHLVEALYVVCGDRGFFYTPSKTGIVEQCCHRKCSIYDMENYCN"
    seq2 = "-------PQHLCGSHLVDALYLVCGDRGFFYNPKRDGIVEQCCHRPCSIFDLQNYCN"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"First 15 alignment tuples: {alignment[:15]}")
    print(f"Total alignment length: {len(alignment)}")
    print()

    print("Test 2: Identical sequences without dashes")
    seq1 = "ACDEFG"
    seq2 = "ACDEFG"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print_alignment_visual(seq1, seq2, alignment)
    print()

    print("Test 3: Gap in middle - ABCDEF vs ABEF (the key test!)")
    seq1 = "ABCDEF"
    seq2 = "ABEF"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print_alignment_visual(seq1, seq2, alignment)
    print()

    print("Test 4: Gap at start")
    seq1 = "ABCDEF"
    seq2 = "CDEF"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print_alignment_visual(seq1, seq2, alignment)
    print()

    print("Test 5: Gap at end")
    seq1 = "ABCDEF"
    seq2 = "ABCD"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print_alignment_visual(seq1, seq2, alignment)
    print()

    print("Test 6: Complex alignment with substitutions")
    seq1 = "ABCDEFGH"
    seq2 = "AXCDXFGH"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print_alignment_visual(seq1, seq2, alignment)
    print()

    print("Test 7: Sequences with dashes and gaps")
    seq1 = "ABCDEFGHI"
    seq2 = "ABC---GHI"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print_alignment_visual(seq1.replace('-', ''), seq2.replace('-', ''), alignment)
    print()


if __name__ == '__main__':
    test_alignment()
