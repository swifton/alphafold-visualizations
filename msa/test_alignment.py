#!/usr/bin/env python3
"""
Test the align_sequences function
"""
from server import align_sequences


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
    print()

    print("Test 3: Seq1 longer than Seq2 (deletions in Seq2)")
    seq1 = "ACDEFG"
    seq2 = "ACDE"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print()

    print("Test 4: Seq2 longer than Seq1 (insertions in Seq2)")
    seq1 = "ACDE"
    seq2 = "ACDEFG"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print()

    print("Test 5: Gaps in the middle")
    seq1 = "ABC---DEF"
    seq2 = "ABCGGGDEF"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print()

    print("Test 6: Gaps in seq2")
    seq1 = "ABCDEFGHI"
    seq2 = "ABC---GHI"
    alignment = align_sequences(seq1, seq2)
    print(f"Seq1: {seq1}")
    print(f"Seq2: {seq2}")
    print(f"Alignment: {alignment}")
    print()


if __name__ == '__main__':
    test_alignment()
