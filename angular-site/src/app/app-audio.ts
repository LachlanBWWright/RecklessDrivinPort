import { parseSndHeader, sndToWav, tryPlaySndResource } from './snd-codec';
import type { App } from './app';

export function setAudioPlayerVolume(app: App, pct: number): void {
  app.audioPlayerVolume.set(pct);
  if (app._audioGainNode) {
    app._audioGainNode.gain.value = Math.max(0, Math.min(1, pct / 100));
  }
}

export function ensureAudioCtx(app: App): AudioContext {
  if (!app._audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      throw new Error('AudioContext not supported in this browser');
    }
    app._audioCtx = new Ctx();
    app._audioGainNode = app._audioCtx.createGain();
    app._audioGainNode.gain.value = Math.max(0, Math.min(1, app.audioPlayerVolume() / 100));
    app._audioGainNode.connect(app._audioCtx.destination);
  }
  return app._audioCtx;
}

export function createSourceFromBuffer(
  app: App,
  buffer: AudioBuffer,
  offsetSeconds: number,
): AudioBufferSourceNode {
  const ctx = ensureAudioCtx(app);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(app._audioGainNode ?? ctx.destination);
  source.onended = () => {
    if (app._audioSource === source) {
      app.audioPlaying.set(false);
      app._audioSource = null;
      app._audioPauseOffset = 0;
      app._updateAudioProgressRaf();
    }
  };
  source.start(0, offsetSeconds);
  return source;
}

export function startAudioBuffer(app: App, buffer: AudioBuffer, offset = 0): void {
  if (app._audioSource) {
    try {
      app._audioSource.stop();
    } catch {
      /* ignore */
    }
    app._audioSource = null;
  }
  const ctx = ensureAudioCtx(app);
  app._audioSource = createSourceFromBuffer(app, buffer, offset);
  app._audioStartTime = ctx.currentTime - offset;
  app._audioPauseOffset = offset;
  app.audioPlaying.set(true);
  app.audioDuration.set(buffer.duration);
  app.audioCurrentTime.set(offset);
  app._updateAudioProgressRaf();
}

export async function togglePlayPause(app: App): Promise<void> {
  const bytes = app.selectedAudioBytes();
  if (!bytes) return;
  const ctx = ensureAudioCtx(app);
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
  if (ctx.state === 'suspended') {
    app.snackBar.open('⚠ Click/interact with the page first to allow audio playback.', 'OK', {
      duration: 4000,
    });
    return;
  }
  if (app.audioPlaying()) {
    app.stopAudio();
    return;
  }
  try {
    const sndInfo = parseSndHeader(bytes);
    if (sndInfo) {
      const wavBytes = sndToWav(bytes);
      try {
        const ab = new Uint8Array(wavBytes).buffer;
        const audioBuf = await ctx.decodeAudioData(ab);
        app._lastAudioBuffer = audioBuf;
        app._startAudioBuffer(audioBuf, app._audioPauseOffset);
        return;
      } catch {
        app._lastAudioBuffer = null;
        const played = tryPlaySndResource(bytes, ctx);
        if (!played) {
          app.snackBar.open('⚠ Cannot play: compressed or unsupported snd format', 'OK', {
            duration: 4000,
          });
          return;
        }
        app.snackBar.open('Playing using legacy one-shot player — pause/seek unavailable.', 'OK', {
          duration: 4000,
        });
        return;
      }
    }
    const played = tryPlaySndResource(bytes, ctx);
    if (!played) {
      app.snackBar.open('⚠ Cannot play: compressed or unsupported snd format', 'OK', {
        duration: 4000,
      });
    }
  } catch (err) {
    app.snackBar.open(`⚠ Audio error: ${err instanceof Error ? err.message : String(err)}`, 'OK', {
      duration: 4000,
    });
  }
}

export function stopAudio(app: App): void {
  if (app._audioSource) {
    try {
      app._audioSource.stop();
    } catch {
      /* ignore */
    }
    app._audioSource = null;
  }
  app.audioPlaying.set(false);
  app._audioPauseOffset = 0;
  app.audioCurrentTime.set(0);
  app._updateAudioProgressRaf();
}

export function seekAudio(app: App, seconds: number): void {
  if (!app._lastAudioBuffer) return;
  const clamped = Math.max(0, Math.min(app._lastAudioBuffer.duration, seconds));
  if (app._audioSource) {
    try {
      app._audioSource.stop();
    } catch {
      /* ignore */
    }
  }
  app._startAudioBuffer(app._lastAudioBuffer, clamped);
}

export function updateAudioProgressRaf(app: App): void {
  if (app._audioRaf !== null) {
    cancelAnimationFrame(app._audioRaf);
    app._audioRaf = null;
  }
  if (!app.audioPlaying()) return;
  app._audioRaf = requestAnimationFrame(() => {
    if (app._audioCtx && app._audioSource) {
      const time = Math.max(0, app._audioCtx.currentTime - app._audioStartTime);
      app.audioCurrentTime.set(time);
    }
    updateAudioProgressRaf(app);
  });
}
