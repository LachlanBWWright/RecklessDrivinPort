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
  const entries = entriesResult.match(
    (result) => result.entries ?? [],
    () => null,
  );
  if (!entries) return;

  host.audioEntries.set(entries.map((entry) => ({ id: entry.id, sizeBytes: entry.size })));
  if (entries.length > 0 && host.selectedAudioId() === null) {
    host.selectedAudioId.set(entries[0].id);
    await loadSelectedAudioBytes(host, entries[0].id);
  }
  void loadAudioDurations(host, entries.map((entry) => entry.id));
}

async function loadAudioDurations(host: App, ids: number[]) {
  for (const id of ids) {
    const durationMs = (await getAudioBytes(host, id)).match(
      ({ bytes }) => {
        if (!bytes) return null;
        return parseSndHeaderSafe(new Uint8Array(bytes)).match(
          (sndInfo) =>
            !sndInfo || sndInfo.sampleRate <= 0 ? null : (sndInfo.numFrames / sndInfo.sampleRate) * 1000,
          () => null,
        );
      },
      () => null,
    );
    if (durationMs === null) continue;

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
  host.selectedAudioBytes.set(
    (await getAudioBytes(host, id)).match(
      ({ bytes }) => (bytes ? new Uint8Array(bytes) : null),
      () => null,
    ),
  );
}

export function exportAudioWav(host: App) {
  const id = host.selectedAudioId();
  const bytes = host.selectedAudioBytes();
  if (id === null || !bytes) return;

  const wavBytes = sndToWavSafe(bytes).match(
    (value) => value,
    () => null,
  );
  if (!wavBytes) return;

  const blob = new Blob([new Uint8Array(wavBytes).buffer], { type: 'audio/wav' });
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
    const resumeResult = await resultFromPromise(ctx.resume(), 'Failed to resume audio context');
    resumeResult.match(
      () => undefined,
      () => undefined,
    );
  }
  if (ctx.state === 'suspended') {
    host.snackBar.open('⚠ Click/interact with the page first to allow audio playback.', 'OK', {
      duration: 4000,
    });
    return;
  }

  const sndInfo = parseSndHeaderSafe(bytes).match(
    (value) => value,
    (error) => {
      host.snackBar.open(`⚠ Audio error: ${error}`, 'OK', { duration: 4000 });
      return null;
    },
  );
  if (sndInfo === null) return;

  const tryLegacyPlayback = (errorMessage?: string) => {
    host._lastAudioBuffer = null;
    tryPlaySndResourceSafe(bytes, ctx).match(
      (played) => {
        if (!played) {
          host.snackBar.open(`⚠ Audio error: ${errorMessage ?? 'Unsupported snd format'}`, 'OK', {
            duration: 4000,
          });
          return;
        }
        host.snackBar.open('Playing using legacy one-shot player — pause/seek unavailable.', 'OK', {
          duration: 4000,
        });
      },
      (error) => {
        host.snackBar.open(`⚠ Audio error: ${errorMessage ?? error}`, 'OK', {
          duration: 4000,
        });
      },
    );
  };

  if (!sndInfo) {
    tryLegacyPlayback('Cannot play: compressed or unsupported snd format');
    return;
  }

  const wavBytes = sndToWavSafe(bytes).match(
    (value) => value,
    (error) => {
      tryLegacyPlayback(error);
      return null;
    },
  );
  if (!wavBytes) {
    return;
  }

  const audioBufferResult = await resultFromPromise(
    ctx.decodeAudioData(new Uint8Array(wavBytes).buffer),
    'Unsupported snd format',
  );
  const audioBuffer = audioBufferResult.match(
    (value) => value,
    (error) => {
      tryLegacyPlayback(error);
      return null;
    },
  );
  if (!audioBuffer) {
    return;
  }

  host._lastAudioBuffer = audioBuffer;
  startAudioBuffer(host, audioBuffer, 0);
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
  const arrayBuffer = arrayBufferResult.match(
    (value) => value,
    (error) => {
      host.editorError.set(error);
      return null;
    },
  );
  if (!arrayBuffer) {
    host.workerBusy.set(false);
    return;
  }

  const sndBytes = wavToSnd(new Uint8Array(arrayBuffer)).match(
    (value) => value,
    (error) => {
      failEditor(host, error);
      return null;
    },
  );
  if (!sndBytes) {
    host.workerBusy.set(false);
    return;
  }

  const saveResult = await resultFromPromise(
    host.runtime.dispatchWorker('PUT_PACK_ENTRY_RAW', {
      packId: 134,
      entryId: id,
      bytes: sndBytes.buffer,
    }),
    'WAV upload failed',
  );
  const saveSucceeded = saveResult.match(
    () => true,
    (error) => {
      host.editorError.set(error);
      return false;
    },
  );
  if (!saveSucceeded) {
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
    const arrayBuffer = arrayBufferResult.match(
      (value) => value,
      (error) => {
        host.editorError.set(error);
        host.snackBar.open(`✗ ${error}`, 'Dismiss', {
          duration: 5000,
          panelClass: 'snack-error',
        });
        return null;
      },
    );
    if (!arrayBuffer) {
      host.workerBusy.set(false);
      return;
    }

    const sndBytes = wavToSnd(new Uint8Array(arrayBuffer)).match(
      (value) => value,
      (error) => {
        failEditor(host, error);
        return null;
      },
    );
    if (!sndBytes) {
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

    const buffer = sndBytes.buffer.slice(sndBytes.byteOffset, sndBytes.byteOffset + sndBytes.byteLength);
    const addSoundResult = await resultFromPromise(
      host.runtime.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId: 134, entryId: nextId, bytes: buffer }, [buffer]),
      'Failed to add sound',
    );
    const saveError = addSoundResult.match(
      () => null,
      (error) => error,
    );
    if (saveError) {
      host.editorError.set(saveError);
      host.snackBar.open(`✗ ${saveError}`, 'Dismiss', {
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
