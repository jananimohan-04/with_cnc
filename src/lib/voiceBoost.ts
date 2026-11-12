// The assistant's spoken voice, made louder. An audio element's own volume stops at 100%, so a quiet voice stays quiet.
// Playing it through a gain stage (about 3x) with a compressor (so loud peaks do not crackle) makes it clearly louder.
// Only for audio that comes from this app (the server voice); the browser's built-in voices and Google's online voice
// cannot be amplified by a web page, so those follow the PC / browser volume.

let ctx: AudioContext | null = null;

export function boostAudio(a: HTMLAudioElement, gain = 3): void {
  a.volume = 1;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const src = ctx.createMediaElementSource(a);   // an element can be attached only once
    const g = ctx.createGain();
    g.gain.value = gain;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    src.connect(g); g.connect(comp); comp.connect(ctx.destination);
  } catch { /* the normal volume is used */ }
}
