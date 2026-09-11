'use client';

export type WorldAvatarImageIdentity = { id: string; avatarUrl: string };

export type WorldAvatarImageLoader = {
  /** The caller owns the returned bitmap and must close it after use. */
  load: (identity: WorldAvatarImageIdentity, signal?: AbortSignal) => Promise<ImageBitmap | null>;
  dispose: () => void;
};

type ImageSize = { width: number; height: number };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_AXIS = 2048;
const MAX_IMAGE_PIXELS = 4_000_000;
const MAX_BITMAP_AXIS = 512;
const MAX_ACTIVE = 2;
const MAX_QUEUED = 193;
const DEADLINE_MS = 10_000;
const QUEUE_DEADLINE_MS = 60_000;
const MAX_HEADER_SEGMENTS = 4096;
const MAX_STREAM_CHUNKS = 4096;
// The same actual z-base-32 alphabet used by runtime-config.schema.ts. The more
// permissive isPubkyIdentifier utility also accepts letters outside this alphabet.
const PUBKY_ID = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/;
const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** A literal match prevents URL normalization, redirects, or alternate image routes. */
export function getWorldAvatarImageUrl(identity: WorldAvatarImageIdentity): string | null {
  if (!identity || typeof identity.id !== 'string' || !PUBKY_ID.test(identity.id)) return null;
  if (typeof identity.avatarUrl !== 'string') return null;
  const canonical = `https://nexus.pubky.app/static/avatar/${identity.id}`;
  if (identity.avatarUrl === canonical) return canonical;
  if (!identity.avatarUrl.startsWith(`${canonical}?v=`)) return null;
  const version = identity.avatarUrl.slice(canonical.length + 3);
  return /^(?:0|[1-9][0-9]{0,15})$/.test(version) && Number.isSafeInteger(Number(version)) ? identity.avatarUrl : null;
}

function validSize({ width, height }: ImageSize): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_AXIS &&
    height <= MAX_IMAGE_AXIS &&
    width * height <= MAX_IMAGE_PIXELS
  );
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset < 0 || offset + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index++) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function uint24(view: DataView, offset: number): number {
  return view.getUint8(offset) + view.getUint8(offset + 1) * 256 + view.getUint8(offset + 2) * 65_536;
}

/** Read only the bounded TIFF orientation entry; no metadata leaves this browser. */
function exifOrientation(bytes: Uint8Array, offset: number, length: number): number {
  const end = offset + length;
  if (ascii(bytes, offset, 'Exif\0\0')) offset += 6;
  if (offset + 8 > end) return 1;
  const little = ascii(bytes, offset, 'II');
  if (!little && !ascii(bytes, offset, 'MM')) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(offset + 2, little) !== 42) return 1;
  const directory = offset + view.getUint32(offset + 4, little);
  if (directory < offset + 8 || directory + 2 > end) return 1;
  const count = view.getUint16(directory, little);
  if (count > 256 || directory + 2 + count * 12 + 4 > end) return 1;
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return 1;
    const orientation = view.getUint16(entry + 8, little);
    return orientation >= 1 && orientation <= 8 ? orientation : 1;
  }
  return 1;
}

function orientedSize(size: ImageSize, orientation: number): ImageSize {
  return orientation >= 5 ? { width: size.height, height: size.width } : size;
}

function pngSize(bytes: Uint8Array, view: DataView): ImageSize | null {
  if (bytes.length < 45 || !ascii(bytes, 0, '\x89PNG\r\n\x1a\n')) return null;
  if (view.getUint32(8) !== 13 || !ascii(bytes, 12, 'IHDR')) return null;
  const size = { width: view.getUint32(16), height: view.getUint32(20) };
  if (!validSize(size)) return null;
  const depth = bytes[24];
  const color = bytes[25];
  const validDepth =
    (color === 0 && [1, 2, 4, 8, 16].includes(depth)) ||
    (color === 3 && [1, 2, 4, 8].includes(depth)) ||
    ([2, 4, 6].includes(color) && [8, 16].includes(depth));
  if (!validDepth || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) return null;
  let offset = 33;
  let hasImage = false;
  let hasExif = false;
  let orientation = 1;
  for (let segment = 0; segment < MAX_HEADER_SEGMENTS && offset + 12 <= bytes.length; segment++) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    const type = offset + 4;
    if (ascii(bytes, type, 'IEND')) {
      return hasImage && length === 0 && end === bytes.length ? orientedSize(size, orientation) : null;
    }
    if (
      ascii(bytes, type, 'IHDR') ||
      ascii(bytes, type, 'acTL') ||
      ascii(bytes, type, 'fcTL') ||
      ascii(bytes, type, 'fdAT')
    ) {
      return null;
    }
    if (ascii(bytes, type, 'IDAT')) hasImage = true;
    else if (ascii(bytes, type, 'eXIf')) {
      if (hasExif) return null;
      hasExif = true;
      orientation = exifOrientation(bytes, offset + 8, length);
    } else if ((bytes[type] & 0x20) === 0 && !ascii(bytes, type, 'PLTE')) return null;
    offset = end;
  }
  return null;
}

function jpegSize(bytes: Uint8Array, view: DataView): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let size: ImageSize | null = null;
  let components = 0;
  let inScan = false;
  let hasScan = false;
  let hasExif = false;
  let orientation = 1;
  let segments = 0;
  while (segments < MAX_HEADER_SEGMENTS && offset < bytes.length) {
    if (inScan) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
    }
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    segments++;
    if (marker === 0xd9) {
      return size && hasScan && offset === bytes.length ? orientedSize(size, orientation) : null;
    }
    if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) return null;
    // No deferred dimensions, hierarchical images, or alternate frames.
    if (marker === 0xdc || marker === 0xde || marker === 0xdf || marker === 1) return null;
    inScan = false;
    if (offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xcc) {
      if (![0xc0, 0xc1, 0xc2].includes(marker) || size || length < 11 || bytes[offset + 2] !== 8) return null;
      components = bytes[offset + 7];
      if (components < 1 || components > 4 || length !== 8 + components * 3) return null;
      size = { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      if (!validSize(size)) return null;
    } else if (marker === 0xda) {
      const scanComponents = bytes[offset + 2];
      if (!size || scanComponents < 1 || scanComponents > components || length !== 6 + scanComponents * 2) {
        return null;
      }
      inScan = true;
      hasScan = true;
    } else if (marker === 0xe1 && length >= 8 && ascii(bytes, offset + 2, 'Exif\0\0')) {
      if (hasExif) return null;
      hasExif = true;
      orientation = exifOrientation(bytes, offset + 2, length - 2);
    }
    offset = end;
  }
  return null;
}

function webpSize(bytes: Uint8Array, view: DataView): ImageSize | null {
  if (bytes.length < 26 || !ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WEBP')) return null;
  if (view.getUint32(4, true) + 8 !== bytes.length) return null;
  let offset = 12;
  let canvas: ImageSize | null = null;
  let image: ImageSize | null = null;
  let hasExif = false;
  let orientation = 1;
  for (let segment = 0; segment < MAX_HEADER_SEGMENTS && offset + 8 <= bytes.length; segment++) {
    const length = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    const end = payload + length;
    const paddedEnd = end + (length % 2);
    if (paddedEnd > bytes.length || (paddedEnd !== end && bytes[end] !== 0)) return null;
    if (ascii(bytes, offset, 'ANIM') || ascii(bytes, offset, 'ANMF')) return null;
    if (ascii(bytes, offset, 'VP8X')) {
      if (offset !== 12 || canvas || length !== 10 || (bytes[payload] & 0xc3) !== 0) return null;
      if (uint24(view, payload + 1) !== 0) return null;
      canvas = { width: uint24(view, payload + 4) + 1, height: uint24(view, payload + 7) + 1 };
      if (!validSize(canvas)) return null;
    } else if (ascii(bytes, offset, 'VP8 ')) {
      if (image || length < 10 || (bytes[payload] & 1) !== 0 || !ascii(bytes, payload + 3, '\x9d\x01\x2a')) {
        return null;
      }
      const width = view.getUint16(payload + 6, true);
      const height = view.getUint16(payload + 8, true);
      if ((width & 0xc000) !== 0 || (height & 0xc000) !== 0) return null;
      image = { width, height };
      if (!validSize(image)) return null;
    } else if (ascii(bytes, offset, 'VP8L')) {
      if (image || length < 5 || bytes[payload] !== 0x2f) return null;
      const packed = view.getUint32(payload + 1, true);
      if (packed >>> 29 !== 0) return null;
      image = { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
      if (!validSize(image)) return null;
    } else if (ascii(bytes, offset, 'EXIF')) {
      if (hasExif) return null;
      hasExif = true;
      orientation = exifOrientation(bytes, payload, length);
    }
    offset = paddedEnd;
  }
  if (offset !== bytes.length || !image) return null;
  if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) return null;
  return orientedSize(image, orientation);
}

/** Preflight bounded static containers before allocating a browser image decoder. */
export function readWorldAvatarImageDimensions(bytes: Uint8Array, mimeType: string): ImageSize | null {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !RASTER_TYPES.has(mimeType)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png') return pngSize(bytes, view);
  if (mimeType === 'image/jpeg') return jpegSize(bytes, view);
  return webpSize(bytes, view);
}

async function readBoundedBytes(response: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!response.body || signal.aborted) return null;
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  let completed = false;
  try {
    // One fixed allocation also bounds overhead from many tiny stream chunks.
    const bytes = new Uint8Array(MAX_IMAGE_BYTES);
    let length = 0;
    for (let chunk = 0; chunk < MAX_STREAM_CHUNKS && !signal.aborted; chunk++) {
      const result = await reader.read();
      if (signal.aborted) return null;
      if (result.done) {
        completed = true;
        return bytes.slice(0, length);
      }
      if (length + result.value.byteLength > MAX_IMAGE_BYTES) return null;
      bytes.set(result.value, length);
      length += result.value.byteLength;
    }
    return null;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!completed) cancel();
    reader.releaseLock();
  }
}

async function fetchAvatar(url: string, signal: AbortSignal): Promise<ImageBitmap | null> {
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    signal,
  });
  const mimeType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
  const contentLength = response.headers.get('content-length');
  const invalidLength =
    contentLength !== null &&
    (!/^[0-9]{1,10}$/.test(contentLength) || Number(contentLength) === 0 || Number(contentLength) > MAX_IMAGE_BYTES);
  if (signal.aborted || !response.ok || response.redirected || !RASTER_TYPES.has(mimeType) || invalidLength) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  const bytes = await readBoundedBytes(response, signal);
  if (!bytes || signal.aborted) return null;
  const size = readWorldAvatarImageDimensions(bytes, mimeType);
  if (!size) return null;
  const scale = Math.min(1, MAX_BITMAP_AXIS / Math.max(size.width, size.height));
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }), {
    imageOrientation: 'from-image',
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
  });
  if (signal.aborted || bitmap.width !== width || bitmap.height !== height) {
    bitmap.close();
    return null;
  }
  return bitmap;
}

type Job = {
  url: string;
  controller: AbortController;
  resolve: (bitmap: ImageBitmap | null) => void;
  cancel: () => void;
  signal?: AbortSignal;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
};

/** No persistent cache: bounded requests become caller-owned, downsampled bitmaps. */
export function createWorldAvatarImageLoader(): WorldAvatarImageLoader {
  const queue: Job[] = [];
  const pending = new Set<Job>();
  let active = 0;
  let disposed = false;

  function settle(job: Job, bitmap: ImageBitmap | null) {
    if (job.settled || disposed || job.controller.signal.aborted) {
      bitmap?.close();
      bitmap = null;
    }
    if (job.settled) return;
    job.settled = true;
    if (job.timer !== null) clearTimeout(job.timer);
    job.signal?.removeEventListener('abort', job.cancel);
    pending.delete(job);
    job.resolve(bitmap);
  }

  async function run(job: Job) {
    active++;
    if (job.timer !== null) clearTimeout(job.timer);
    job.timer = setTimeout(job.cancel, DEADLINE_MS);
    try {
      settle(job, await fetchAvatar(job.url, job.controller.signal));
    } catch {
      settle(job, null);
    } finally {
      // createImageBitmap cannot be aborted. A canceled decode retains its slot
      // until it finishes, then closes its result instead of exceeding this cap.
      active--;
      pump();
    }
  }

  function pump() {
    while (!disposed && active < MAX_ACTIVE && queue.length > 0) {
      const job = queue.shift()!;
      if (!job.settled) void run(job);
    }
  }

  return {
    load(identity, signal) {
      const url = getWorldAvatarImageUrl(identity);
      if (
        disposed ||
        signal?.aborted ||
        !url ||
        typeof fetch !== 'function' ||
        typeof createImageBitmap !== 'function' ||
        queue.length >= MAX_QUEUED
      ) {
        return Promise.resolve(null);
      }
      return new Promise<ImageBitmap | null>((resolve) => {
        const job: Job = {
          url,
          controller: new AbortController(),
          resolve,
          signal,
          timer: null,
          settled: false,
          cancel: () => {
            if (job.settled) return;
            job.controller.abort();
            const index = queue.indexOf(job);
            if (index !== -1) queue.splice(index, 1);
            settle(job, null);
            pump();
          },
        };
        pending.add(job);
        queue.push(job);
        signal?.addEventListener('abort', job.cancel, { once: true });
        job.timer = setTimeout(job.cancel, QUEUE_DEADLINE_MS);
        if (signal?.aborted) job.cancel();
        else pump();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of pending) job.cancel();
      queue.length = 0;
    },
  };
}
