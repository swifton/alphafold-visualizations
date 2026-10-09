import sys

import matplotlib.pyplot as plt
import numpy as np

def build_matrix_from_file(filename):
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
                    n = len(first_line)
                    matrix = np.ones((n, n), dtype=float)  # initialize to ones
    if first_line is None:
        raise ValueError("No valid lines found in file.")
    diff_count = np.zeros(n, dtype=float)
    diff_matrix = np.zeros((n, n), dtype=float)
    for line in lines[1:]:
        if len(line) != len(first_line):
            continue
        diff_indices = [i for i in range(n) if line[i] != first_line[i]]
        same_indices = [i for i in range(n) if line[i] == first_line[i]]
        for i in range(n):
            if line[i] != first_line[i]:
                diff_count[i] += 1
        # Fill diff_matrix: for each i in diff_indices, for each j in same_indices
        for i in diff_indices:
            for j in same_indices:
                diff_matrix[i, j] += 1
        for i in range(len(same_indices)):
            for j in range(i+1, len(same_indices)):
                matrix[same_indices[i]][same_indices[j]] += 1
                matrix[same_indices[j]][same_indices[i]] += 1
    return np.array(matrix), diff_count, diff_matrix

def max_row_col_matrix(matrix):
    n = matrix.shape[0]
    new_matrix = np.zeros_like(matrix)
    for i in range(n):
        for j in range(n):
            row_max = np.max(matrix[i, :])
            col_max = np.max(matrix[:, j])
            new_matrix[i, j] = max(row_max, col_max)
    return new_matrix

def main():
    matrix, diff_count, diff_matrix = build_matrix_from_file("lamprey.a3m")
    n = matrix.shape[0]
    norm_matrix = np.zeros_like(matrix)
    for i in range(n):
        for j in range(n):
            denom = max(diff_count[i], diff_count[j])
            if denom > 0:
                norm_matrix[i, j] = matrix[i, j] / denom
            else:
                norm_matrix[i, j] = 0
    # Print pairs of indices where the score is above 450 in the original matrix
    for i in range(n):
        for j in range(i+1, n):
            if matrix[i, j] > 450:
                print(f"({i}, {j}): {matrix[i, j]}")
    plt.imshow(diff_matrix, cmap='coolwarm', interpolation='nearest')
    plt.colorbar(label='Normalized Count')
    plt.title('Matrix Visualization (Element-wise Division by diff_count)')
    plt.show()
    # Optionally, plot or print diff_matrix
    # print('diff_matrix:', diff_matrix)

if __name__ == "__main__":
    main()
