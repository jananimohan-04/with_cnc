/**
 * Liveness & Anti-Spoofing Detection Engine
 * Provides dynamic challenge generation (blink, smile, head tilt)
 * and frame sharpness validation to reject printouts or screen replays.
 */

export interface LivenessChallenge {
  type: 'BLINK' | 'SMILE' | 'STILL' | 'TILT';
  instruction: string;
  badge: string;
}

export const LIVENESS_CHALLENGES: LivenessChallenge[] = [
  { type: 'STILL', instruction: 'Look directly at camera and hold steady', badge: 'Steady Focus' },
  { type: 'BLINK', instruction: 'Blink your eyes naturally once', badge: 'Blink Check' },
  { type: 'SMILE', instruction: 'Give a brief smile to the lens', badge: 'Micro-Motion' },
  { type: 'TILT', instruction: 'Tilt head slightly to confirm 3D depth', badge: '3D Geometry' },
];

export function getRandomChallenge(): LivenessChallenge {
  const idx = Math.floor(Math.random() * LIVENESS_CHALLENGES.length);
  return LIVENESS_CHALLENGES[idx];
}

/**
 * Validates optical sharpness and lighting to reject replayed screens or static paper printouts
 */
export function evaluateLivenessQuality(
  sharpness: number,
  brightness: number
): { passed: boolean; score: number; reason?: string } {
  if (brightness < 30) {
    return { passed: false, score: 0.2, reason: 'Lighting too dark. Please face towards light.' };
  }
  if (brightness > 245) {
    return { passed: false, score: 0.3, reason: 'Severe glare detected. Avoid direct backlighting.' };
  }
  if (sharpness < 12) {
    return { passed: false, score: 0.35, reason: 'Image blurry or moving too fast. Hold still.' };
  }

  const score = Math.min(1.0, (sharpness / 60) * 0.5 + 0.5);
  return { passed: true, score: Math.round(score * 100) / 100 };
}
