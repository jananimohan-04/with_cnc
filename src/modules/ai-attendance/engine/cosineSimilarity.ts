export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || !vecA.length || !vecB.length) return 0.0;
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < len; i++) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA < 1e-6 || normB < 1e-6) return 0.0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeVector(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const mag = Math.sqrt(sumSq) || 1e-6;
  return vec.map((v) => v / mag);
}

export interface CandidateEmployee {
  id: string;
  employee_name: string;
  employee_code: string;
  department?: string;
  face_embeddings?: number[][];
}

export interface MatchOutcome {
  matched: boolean;
  employee: CandidateEmployee | null;
  confidence: number;
  similarity: number;
  ambiguous?: boolean;
  message?: string;
}

export function findBestMatch(
  queryVector: number[],
  employees: CandidateEmployee[],
  threshold = 0.72,
  margin = 0.08
): MatchOutcome {
  if (!queryVector || !queryVector.length || !employees || !employees.length) {
    return { matched: false, employee: null, confidence: 0, similarity: 0, message: 'No registered face embeddings found' };
  }

  const scores: { employee: CandidateEmployee; bestSim: number }[] = [];

  for (const emp of employees) {
    const vectors = emp.face_embeddings || [];
    if (!vectors.length) continue;

    let maxSim = 0;
    for (const storedVec of vectors) {
      const sim = cosineSimilarity(queryVector, storedVec);
      if (sim > maxSim) maxSim = sim;
    }

    if (maxSim > 0) {
      scores.push({ employee: emp, bestSim: maxSim });
    }
  }

  if (!scores.length) {
    return { matched: false, employee: null, confidence: 0, similarity: 0, message: 'No match detected' };
  }

  // Sort descending by similarity
  scores.sort((a, b) => b.bestSim - a.bestSim);
  const best = scores[0];
  const confidence = Math.round(best.bestSim * 10000) / 10000;

  if (best.bestSim < threshold) {
    return { matched: false, employee: null, confidence, similarity: best.bestSim, message: 'Confidence below identification threshold' };
  }

  // Ambiguity check: winner-take-all margin
  if (scores.length >= 2 && best.bestSim - scores[1].bestSim < margin) {
    return {
      matched: false,
      employee: null,
      confidence,
      similarity: best.bestSim,
      ambiguous: true,
      message: 'Ambiguous match detected between two staff profiles',
    };
  }

  return {
    matched: true,
    employee: best.employee,
    confidence,
    similarity: best.bestSim,
    message: 'Face verified successfully',
  };
}
