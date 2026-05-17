/**
 * Compute cosine similarity between two normalized vectors
 * Assumes vectors are already normalized (magnitude = 1)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }

  return dotProduct;
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(vector: number[]): Float32Array {
  let magnitude = 0;
  for (const val of vector) {
    magnitude += val * val;
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude === 0) {
    return new Float32Array(vector.length);
  }

  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / magnitude;
  }

  return normalized;
}

