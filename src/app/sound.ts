/** Tiny WebAudio cues (no assets). */

let ctx: AudioContext | null = null;

function tone(freq: number, startOffset: number, dur: number, gain = 0.08) {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    /* audio not available */
  }
}

export const sound = {
  capture: () => tone(880, 0, 0.12),
  complete: () => {
    tone(660, 0, 0.12);
    tone(990, 0.12, 0.2);
  },
  error: () => tone(220, 0, 0.3, 0.1),
  tick: () => tone(1200, 0, 0.04, 0.03),
};
