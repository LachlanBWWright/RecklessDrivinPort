import { ensureAudioCtx, startAudioBuffer } from './app-audio';
import { failEditor } from './app-loaders';
import { sndToWav, parseSndHeader, tryPlaySndResource, wavToSnd } from './snd-codec';
import { resultFromPromise, resultFromThrowable } from './result-helpers';

import type { App } from './app';

const parseSndHeaderSafe = resultFromThrowable(parseSndHeader, 'Failed to parse sound header');
const sndToWavSafe = resultFromThrowable(sndToWav, 'Failed to convert snd to wav');
const tryPlaySndResourceSafe = resultFromThrowable(tryPlaySndResource, 'Failed to play sound');

const getAudioBytes = async (host: App, id: number) =>
  resultFromPromise(
    host.runtime.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_PACK_ENTRY_RAW', {
      packId: 134,
      entryId: id,
    }),
    `Failed to load sound #${id}`,
  );

export async function loadAudioEntries(host: App) {
  const entriesResult = await resultFromPromise(
    host.runtime.dispatchWorker<{ entries: { id: number; size: number }[] | null }>('LIST_PACK_ENTRIES', {
      packId: 134,
    }),
    'Failed to load sound entries',
  );
  if (entriesResult.isErr()) return;

  const entries = entriesResult.value.entries ?? [];
  host.audioEntries.set(entries.map((entry) => ({ id: entry.id, sizeBytes: entry.size })));
  if (entries.length > 0 && host.selectedAudioId() === null) {
    host.selectedAudioId.set(entries[0].id);
    await loadSelectedAudioBytes(host, entries[0].id);
  }
  void loadAudioDurations(host, entries.map((entry) => entry.id));
}

async function loadAudioDurations(host: App, ids: number[]) {
  for (const id of ids) {
    const bytesResult = await getAudioBytes(host, id);
    if (bytesResult.isErr() || !bytesResult.value.bytes) continue;

    const sndInfoResult = parseSndHeaderSafe(new Uint8Array(bytesResult.value.bytes));
    if (sndInfoResult.isErr() || !sndInfoResult.value || sndInfoResult.value.sampleRate <= 0) continue;

    const durationMs = (sndInfoResult.value.numFrames / sndInfoResult.value.sampleRate) * 1000;
    host.audioEntries.update((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, durationMs } : entry)),
    );
  }
}

export async function selectAudioEntry(host: App, id: number) {
  host.selectedAudioId.set(id);
  host.media.stopAudio();
  host._lastAudioBuffer = null;
  host.audioCurrentTime.set(0);
  host.audioDuration.set(0);
  await loadSelectedAudioBytes(host, id);
}

export async function loadSelectedAudioBytes(host: App, id: number) {
  const bytesResult = await getAudioBytes(host, id);
  host.selectedAudioBytes.set(
    bytesResult.isOk() && bytesResult.value.bytes ? new Uint8Array(bytesResult.value.bytes) : null,
  );
}

export function exportAudioWav(host: App) {
  const id = host.selectedAudioId();
  const bytes = host.selectedAudioBytes();
  if (id === null || !bytes) return;

  const wavBytesResult = sndToWavSafe(bytes);
  if (wavBytesResult.isErr()) return;

  const blob = new Blob([new Uint8Array(wavBytesResult.value).buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sound-${id}.wav`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function playAudioEntry(host: App) {
  const bytes = host.selectedAudioBytes();
  if (!bytes) return;

  const ctx = ensureAudioCtx(host);
  if (ctx.state === 'suspended') {
    await resultFromPromise(ctx.resume(), 'Failed to resume audio context');
  }
  if (ctx.state === 'suspended') {
    host.snackBar.open('⚠ Click/interact with the page first to allow audio playback.', 'OK', {
      duration: 4000,
    });
    return;
  }

  const sndInfoResult = parseSndHeaderSafe(bytes);
  if (sndInfoResult.isErr()) {
    host.snackBar.open(`⚠ Audio error: ${sndInfoResult.error}`, 'OK', { duration: 4000 });
    return;
  }

  const tryLegacyPlayback = (errorMessage?: string) => {
    host._lastAudioBuffer = null;
    const legacyPlaybackResult = tryPlaySndResourceSafe(bytes, ctx);
    if (legacyPlaybackResult.isErr() || !legacyPlaybackResult.value) {
      const fallbackMessage = legacyPlaybackResult.isErr()
        ? legacyPlaybackResult.error
        : errorMessage ?? 'Unsupported snd format';
      host.snackBar.open(`⚠ Audio error: ${errorMessage ?? fallbackMessage}`, 'OK', {
        duration: 4000,
      });
      return;
    }
    host.snackBar.open('Playing using legacy one-shot player — pause/seek unavailable.', 'OK', {
      duration: 4000,
    });
  };

  if (!sndInfoResult.value) {
    tryLegacyPlayback('Cannot play: compressed or unsupported snd format');
    return;
  }

  const wavBytesResult = sndToWavSafe(bytes);
  if (wavBytesResult.isErr()) {
    tryLegacyPlayback(wavBytesResult.error);
    return;
  }

  const audioBufferResult = await resultFromPromise(
    ctx.decodeAudioData(new Uint8Array(wavBytesResult.value).buffer),
    'Unsupported snd format',
  );
  if (audioBufferResult.isErr()) {
    tryLegacyPlayback(audioBufferResult.error);
    return;
  }

  host._lastAudioBuffer = audioBufferResult.value;
  startAudioBuffer(host, audioBufferResult.value, 0);
}

export async function onAudioWavUpload(host: App, event: Event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) return;

  const file = input.files?.[0];
  if (!file) return;

  input.value = '';
  const id = host.selectedAudioId();
  if (id === null) return;

  host.workerBusy.set(true);

  const arrayBufferResult = await resultFromPromise(file.arrayBuffer(), 'Failed to read WAV file');
  if (arrayBufferResult.isErr()) {
    host.editorError.set(arrayBufferResult.error);
    host.workerBusy.set(false);
    return;
  }

  const sndBytesResult = wavToSnd(new Uint8Array(arrayBufferResult.value));
  if (sndBytesResult.isErr()) {
    failEditor(host, sndBytesResult.error);
    host.workerBusy.set(false);
    return;
  }

  const saveResult = await resultFromPromise(
    host.runtime.dispatchWorker('PUT_PACK_ENTRY_RAW', {
      packId: 134,
      entryId: id,
      bytes: sndBytesResult.value.buffer,
    }),
    'WAV upload failed',
  );
  if (saveResult.isErr()) {
    host.editorError.set(saveResult.error);
    host.workerBusy.set(false);
    return;
  }

  await loadSelectedAudioBytes(host, id);
  host.resourcesStatus.set(`Sound #${id} replaced from WAV.`);
  host.workerBusy.set(false);
}

export async function addAudioEntry(host: App) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.wav,audio/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    host.workerBusy.set(true);

    const arrayBufferResult = await resultFromPromise(file.arrayBuffer(), 'Failed to read sound file');
    if (arrayBufferResult.isErr()) {
      host.editorError.set(arrayBufferResult.error);
      host.snackBar.open(`✗ ${arrayBufferResult.error}`, 'Dismiss', {
        duration: 5000,
        panelClass: 'snack-error',
      });
      host.workerBusy.set(false);
      return;
    }

    const sndBytesResult = wavToSnd(new Uint8Array(arrayBufferResult.value));
    if (sndBytesResult.isErr()) {
      failEditor(host, sndBytesResult.error);
      host.workerBusy.set(false);
      return;
    }

    const existing = host.audioEntries().map((entry) => entry.id);
    const nextId = existing.length > 0 ? Math.max(...existing) + 1 : 128;
    if (nextId > 9999) {
      failEditor(host, 'Too many sound entries (max ID 9999)');
      host.workerBusy.set(false);
      return;
    }

    const bytes = sndBytesResult.value;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const saveResult = await resultFromPromise(
      host.runtime.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId: 134, entryId: nextId, bytes: buffer }, [buffer]),
      'Failed to add sound',
    );
    if (saveResult.isErr()) {
      host.editorError.set(saveResult.error);
      host.snackBar.open(`✗ ${saveResult.error}`, 'Dismiss', {
        duration: 5000,
        panelClass: 'snack-error',
      });
      host.workerBusy.set(false);
      return;
    }

    await loadAudioEntries(host);
    await selectAudioEntry(host, nextId);
    host.resourcesStatus.set(`New sound #${nextId} created.`);
    host.snackBar.open(`✓ Sound #${nextId} added`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    host.workerBusy.set(false);
  };
  input.click();
}
