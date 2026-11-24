export interface FaceVectorSample {
  embedding: number[]; // 128-dimensional unit normalized array
  qualityScore: number;
  capturedAt: string;
}

export interface FaceMatchResult {
  matched: boolean;
  confidence: number;
  similarity: number;
  employee_id?: string;
  employee_name?: string;
  employee_code?: string;
  ambiguous?: boolean;
  message?: string;
}

export interface LivenessState {
  blinkDetected: boolean;
  movementDetected: boolean;
  score: number;
  isLive: boolean;
}
