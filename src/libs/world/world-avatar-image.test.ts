import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorldAvatarImageLoader,
  getWorldAvatarImageUrl,
  readWorldAvatarImageDimensions,
  type WorldAvatarImageIdentity,
  type WorldAvatarImageLoader,
} from '@/libs/world/world-avatar-image';
import { asOpaque } from '@/test-utils/type-assertions';

const ID = 'ybndrfg8ejkmcpqxot1uwisza345h769'.repeat(2).slice(0, 52);
const URL = `https://nexus.pubky.app/static/avatar/${ID}`;
const MAX_BYTES = 2 * 1024 * 1024;
// An actual white pixel, rather than a photograph or face-specific fixture.
const WHITE_PIXEL = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+i9ioAAAAASUVORK5CYII='),
  (character) => character.charCodeAt(0),
);

function identity(version?: number): WorldAvatarImageIdentity {
  return { id: ID, avatarUrl: version === undefined ? URL : `${URL}?v=${version}` };
}

function join(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function text(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

// Minimal container fixtures exercise preflight, not the browser's raster codec.
function pngChunk(type: string, data = new Uint8Array()): Uint8Array<ArrayBuffer> {
  const chunk = new Uint8Array(data.length + 12);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(text(type), 4);
  chunk.set(data, 8);
  return chunk;
}

function png(width = 128, height = 128, extra: Uint8Array[] = []): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  return join(
    text('\x89PNG\r\n\x1a\n'),
    pngChunk('IHDR', header),
    ...extra,
    pngChunk('IDAT', new Uint8Array([1])),
    pngChunk('IEND'),
  );
}

function exif(orientation: number): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  data.set(text('II'));
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x0112, true);
  view.setUint16(12, 3, true);
  view.setUint32(14, 1, true);
  view.setUint16(18, orientation, true);
  return data;
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(payload.length + 4);
  result.set([0xff, marker]);
  new DataView(result.buffer).setUint16(2, payload.length + 2);
  result.set(payload, 4);
  return result;
}

function jpeg(width = 128, height = 128, orientation = 1, progressive = false): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array([8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]);
  return join(
    text('\xff\xd8'),
    jpegSegment(0xe1, join(text('Exif\0\0'), exif(orientation))),
    jpegSegment(progressive ? 0xc2 : 0xc0, frame),
    jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])),
    // Includes stuffed FF and a restart marker inside entropy-coded data.
    new Uint8Array([1, 2, 0xff, 0, 3, 0xff, 0xd0, 4, 0xff, 0xd9]),
  );
}

function webpChunk(type: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(8 + payload.length + (payload.length % 2));
  result.set(text(type));
  new DataView(result.buffer).setUint32(4, payload.length, true);
  result.set(payload, 8);
  return result;
}

function riff(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = join(text('RIFF\0\0\0\0WEBP'), ...chunks);
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  return result;
}

function lossless(width = 128, height = 128): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(5);
  payload[0] = 0x2f;
  new DataView(payload.buffer).setUint32(1, width - 1 + ((height - 1) << 14), true);
  return webpChunk('VP8L', payload);
}

function lossy(width = 128, height = 128): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array([0x10, 0, 0, 0x9d, 1, 0x2a, 0, 0, 0, 0]);
  const view = new DataView(payload.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return webpChunk('VP8 ', payload);
}

function extended(width = 128, height = 128, animated = false): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(10);
  const view = new DataView(payload.buffer);
  payload[0] = animated ? 2 : 0;
  view.setUint32(4, width - 1, true);
  // The following height starts one byte before that uint32 ends.
  payload[7] = (height - 1) & 255;
  payload[8] = ((height - 1) >> 8) & 255;
  payload[9] = ((height - 1) >> 16) & 255;
  return webpChunk('VP8X', payload);
}

function response(bytes: Uint8Array = WHITE_PIXEL, headers: Record<string, string> = {}): Response {
  return new Response(join(bytes), { headers: { 'content-type': 'image/png', ...headers } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function bitmap(width = 1, height = 1): ImageBitmap {
  return asOpaque<ImageBitmap>({ width, height, close: vi.fn() });
}

describe('world avatar URL boundary', () => {
  it('accepts only the exact identity and bounded canonical version', () => {
    expect(ID).toHaveLength(52);
    expect(getWorldAvatarImageUrl(identity())).toBe(URL);
    expect(getWorldAvatarImageUrl(identity(0))).toBe(`${URL}?v=0`);
    expect(getWorldAvatarImageUrl(identity(1_789_171_234_567))).toBe(`${URL}?v=1789171234567`);
    expect(getWorldAvatarImageUrl(identity(Number.MAX_SAFE_INTEGER))).not.toBeNull();
  });

  it.each([
    'https://nexus.pubky.app.example.com/static/avatar/ID',
    'https://nexus.staging.pubky.app/static/avatar/ID',
    'http://nexus.pubky.app/static/avatar/ID',
    'https://name:secret@nexus.pubky.app/static/avatar/ID',
    'https://nexus.pubky.app:443/static/avatar/ID',
    'https://nexus.pubky.app/static/avatar/ID/',
    'https://nexus.pubky.app/static/avatar/../avatar/ID',
    'https://nexus.pubky.app/static/avatar/ID#face',
    'https://nexus.pubky.app/static/avatar/ID?v=1&size=512',
    'https://nexus.pubky.app/static/avatar/ID?v=1&v=2',
    'https://nexus.pubky.app/static/avatar/ID?v=01',
    'https://nexus.pubky.app/static/avatar/ID?v=-1',
    'https://nexus.pubky.app/static/avatar/ID?v=1e3',
    'https://nexus.pubky.app/static/avatar/ID?v=9007199254740992',
    'https://nexus.pubky.app/static/avatar/ID?v=%31',
    'https://nexus.pubky.app/static/avatar/ID?',
    ' https://nexus.pubky.app/static/avatar/ID',
    'blob:https://nexus.pubky.app/ID',
    'data:image/png;base64,AAAA',
    '/static/avatar/ID',
  ])('rejects %s', (url) => {
    expect(getWorldAvatarImageUrl({ id: ID, avatarUrl: url.replace('ID', ID) })).toBeNull();
  });

  it('rejects another account, encoded paths, and characters excluded from actual z-base32', () => {
    expect(getWorldAvatarImageUrl({ id: 'b'.repeat(52), avatarUrl: URL })).toBeNull();
    expect(getWorldAvatarImageUrl({ id: ID, avatarUrl: URL.replace(ID, `%79${ID.slice(1)}`) })).toBeNull();
    for (const id of ['0'.repeat(52), '2'.repeat(52), 'l'.repeat(52), 'v'.repeat(52), ID.toUpperCase(), ID.slice(1)]) {
      expect(getWorldAvatarImageUrl({ id, avatarUrl: `https://nexus.pubky.app/static/avatar/${id}` })).toBeNull();
    }
  });
});

describe('world avatar static image preflight', () => {
  it.each([
    ['PNG', png(320, 240), 'image/png'],
    ['baseline JPEG', jpeg(320, 240), 'image/jpeg'],
    ['progressive JPEG', jpeg(320, 240, 1, true), 'image/jpeg'],
    ['lossy WebP', riff(lossy(320, 240)), 'image/webp'],
    ['lossless WebP', riff(lossless(320, 240)), 'image/webp'],
    ['extended WebP', riff(extended(320, 240), lossless(320, 240)), 'image/webp'],
  ])('reads %s dimensions before browser decoding', (_name, bytes, mimeType) => {
    expect(readWorldAvatarImageDimensions(bytes as Uint8Array, mimeType as string)).toEqual({
      width: 320,
      height: 240,
    });
  });

  it('accounts for EXIF rotation without changing the allowed source area', () => {
    for (const orientation of [5, 6, 7, 8]) {
      expect(readWorldAvatarImageDimensions(jpeg(1200, 800, orientation), 'image/jpeg')).toEqual({
        width: 800,
        height: 1200,
      });
    }
    expect(readWorldAvatarImageDimensions(png(600, 400, [pngChunk('eXIf', exif(6))]), 'image/png')).toEqual({
      width: 400,
      height: 600,
    });
    expect(readWorldAvatarImageDimensions(riff(lossless(600, 400), webpChunk('EXIF', exif(6))), 'image/webp')).toEqual({
      width: 400,
      height: 600,
    });
  });

  it('rejects zero or excessive dimensions, a mismatched MIME type, unsupported formats, and excessive bytes', () => {
    for (const [width, height] of [
      [0, 128],
      [128, 0],
      [2049, 1],
      [1, 2049],
      [2048, 2048],
    ]) {
      expect(readWorldAvatarImageDimensions(png(width, height), 'image/png')).toBeNull();
      expect(readWorldAvatarImageDimensions(jpeg(width, height), 'image/jpeg')).toBeNull();
    }
    expect(readWorldAvatarImageDimensions(png(2000, 2000), 'image/png')).toEqual({ width: 2000, height: 2000 });
    expect(readWorldAvatarImageDimensions(WHITE_PIXEL, 'image/jpeg')).toBeNull();
    expect(readWorldAvatarImageDimensions(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png')).toBeNull();
    expect(readWorldAvatarImageDimensions(text('GIF89a'), 'image/gif')).toBeNull();
    expect(readWorldAvatarImageDimensions(new Uint8Array(MAX_BYTES + 1), 'image/png')).toBeNull();
  });

  it('does not allow animated containers or a larger hidden WebP frame', () => {
    for (const type of ['acTL', 'fcTL', 'fdAT']) {
      expect(readWorldAvatarImageDimensions(png(128, 128, [pngChunk(type)]), 'image/png')).toBeNull();
    }
    expect(readWorldAvatarImageDimensions(riff(extended(128, 128, true), lossless()), 'image/webp')).toBeNull();
    expect(
      readWorldAvatarImageDimensions(riff(lossless(), webpChunk('ANMF', new Uint8Array(16))), 'image/webp'),
    ).toBeNull();
    expect(readWorldAvatarImageDimensions(riff(extended(128, 128), lossless(2000, 2000)), 'image/webp')).toBeNull();
    expect(readWorldAvatarImageDimensions(riff(extended(128, 128), lossy(9000, 1)), 'image/webp')).toBeNull();
    expect(readWorldAvatarImageDimensions(riff(lossless(), lossless()), 'image/webp')).toBeNull();
  });

  it('rejects truncated or conflicting frame headers instead of trusting the first signature', () => {
    for (const [bytes, mime] of [
      [png(), 'image/png'],
      [jpeg(), 'image/jpeg'],
      [riff(lossless()), 'image/webp'],
    ] as const) {
      expect(readWorldAvatarImageDimensions(bytes.slice(0, -1), mime)).toBeNull();
      expect(readWorldAvatarImageDimensions(join(bytes, new Uint8Array([0])), mime)).toBeNull();
    }
    expect(
      readWorldAvatarImageDimensions(png(128, 128, [pngChunk('IHDR', new Uint8Array(13))]), 'image/png'),
    ).toBeNull();
    const deferredDimensions = join(
      jpeg().slice(0, -2),
      jpegSegment(0xdc, new Uint8Array([0x7f, 0xff])),
      text('\xff\xd9'),
    );
    expect(readWorldAvatarImageDimensions(deferredDimensions, 'image/jpeg')).toBeNull();
    const badLength = png();
    new DataView(badLength.buffer).setUint32(33, MAX_BYTES);
    expect(readWorldAvatarImageDimensions(badLength, 'image/png')).toBeNull();
  });
});

describe('world avatar browser image loader', () => {
  const loaders: WorldAvatarImageLoader[] = [];
  function loader() {
    const value = createWorldAvatarImageLoader();
    loaders.push(value);
    return value;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => response()),
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (_blob: Blob, options: ImageBitmapOptions) => bitmap(options.resizeWidth, options.resizeHeight)),
    );
  });

  afterEach(() => {
    loaders.splice(0).forEach((value) => value.dispose());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts non-face artwork without recognition and gives the caller ownership', async () => {
    const images = loader();
    const controller = new AbortController();
    const result = await images.load(identity(7), controller.signal);
    expect(result).toMatchObject({ width: 1, height: 1 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${URL}?v=7`, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: 'from-image',
      resizeWidth: 1,
      resizeHeight: 1,
      resizeQuality: 'high',
    });
    controller.abort();
    images.dispose();
    expect(result!.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    result!.close();
  });

  it('preserves portrait aspect and caps its decoded bitmap at 512 pixels', async () => {
    vi.mocked(fetch).mockResolvedValue(response(jpeg(1200, 800, 6), { 'content-type': 'image/jpeg' }));
    const result = await loader().load(identity());
    expect(result).toMatchObject({ width: 341, height: 512 });
    result!.close();
  });

  it('does not fetch invalid identities, already aborted calls, or when the browser cannot decode bitmaps', async () => {
    const images = loader();
    const controller = new AbortController();
    controller.abort();
    expect(await images.load({ id: ID, avatarUrl: 'https://example.com/face.png' })).toBeNull();
    expect(await images.load(identity(), controller.signal)).toBeNull();
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await images.load(identity())).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized response before reading its body', async () => {
    const incoming = response(WHITE_PIXEL, { 'content-length': String(MAX_BYTES + 1) });
    const cancel = vi.spyOn(incoming.body!, 'cancel');
    const reader = vi.spyOn(incoming.body!, 'getReader');
    vi.mocked(fetch).mockResolvedValue(incoming);
    expect(await loader().load(identity())).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(reader).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('enforces the actual streamed byte limit even when Content-Length lies', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(body, { headers: { 'content-type': 'image/png', 'content-length': '100' } }),
    );
    expect(await loader().load(identity())).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('leaves masks in place for unsupported, mismatched, oversized, redirected, and failed images', async () => {
    const images = loader();
    for (const incoming of [
      response(text('<svg/>'), { 'content-type': 'image/svg+xml' }),
      response(text('GIF89a'), { 'content-type': 'image/gif' }),
      response(jpeg(), { 'content-type': 'image/png' }),
      response(png(3000, 3000)),
      new Response(null, { status: 404 }),
    ]) {
      vi.mocked(fetch).mockResolvedValueOnce(incoming);
      expect(await images.load(identity())).toBeNull();
    }
    const redirected = response();
    Object.defineProperty(redirected, 'redirected', { value: true });
    vi.mocked(fetch).mockResolvedValueOnce(redirected);
    expect(await images.load(identity())).toBeNull();
    vi.mocked(fetch).mockRejectedValueOnce('CORS rejected');
    expect(await images.load(identity())).toBeNull();
    expect(createImageBitmap).not.toHaveBeenCalled();
    vi.mocked(createImageBitmap).mockRejectedValueOnce('Codec rejected');
    expect(await images.load(identity())).toBeNull();
    const ignoredResize = bitmap(2048, 2048);
    vi.mocked(createImageBitmap).mockResolvedValueOnce(ignoredResize);
    expect(await images.load(identity())).toBeNull();
    expect(ignoredResize.close).toHaveBeenCalledOnce();
  });

  it('holds at most two network/decode jobs, including canceled decodes that have not finished', async () => {
    const decoding = Array.from({ length: 4 }, () => deferred<ImageBitmap>());
    let next = 0;
    vi.mocked(createImageBitmap).mockImplementation(() => decoding[next++].promise);
    const images = loader();
    const cancelSecond = new AbortController();
    const requests = [
      images.load(identity(0)),
      images.load(identity(1), cancelSecond.signal),
      images.load(identity(2)),
      images.load(identity(3)),
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    const first = bitmap();
    decoding[0].resolve(first);
    expect(await requests[0]).toBe(first);
    await vi.advanceTimersByTimeAsync(0);
    expect(createImageBitmap).toHaveBeenCalledTimes(3);
    cancelSecond.abort();
    expect(await requests[1]).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    const stale = bitmap();
    decoding[1].resolve(stale);
    await vi.advanceTimersByTimeAsync(0);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(createImageBitmap).toHaveBeenCalledTimes(4);
    decoding[2].resolve(bitmap());
    decoding[3].resolve(bitmap());
    const remaining = await Promise.all([requests[2], requests[3]]);
    remaining.forEach((result) => result!.close());
    first.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes an aborted queued identity before it reaches the network', async () => {
    const incoming = Array.from({ length: 3 }, () => deferred<Response>());
    let next = 0;
    vi.mocked(fetch).mockImplementation(() => incoming[next++].promise);
    const images = loader();
    const cancelQueued = new AbortController();
    const first = images.load(identity(1));
    const second = images.load(identity(2));
    const queued = images.load(identity(3), cancelQueued.signal);
    const fourth = images.load(identity(4));
    cancelQueued.abort();
    expect(await queued).toBeNull();
    incoming[0].resolve(response());
    (await first)!.close();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([`${URL}?v=1`, `${URL}?v=2`, `${URL}?v=4`]);
    incoming[1].resolve(response());
    incoming[2].resolve(response());
    (await second)!.close();
    (await fourth)!.close();
  });

  it('caps the queue at 193 and immediately settles all remaining work when disposed', async () => {
    const incoming = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(incoming.promise);
    const images = loader();
    const requests = Array.from({ length: 195 }, (_, index) => images.load(identity(index)));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await images.load(identity(196))).toBeNull();
    images.dispose();
    expect(await Promise.all(requests)).toEqual(Array(195).fill(null));
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options!.signal!.aborted)).toBe(true);
    expect(await images.load(identity())).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    incoming.resolve(new Response(null, { status: 404 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('closes an in-flight bitmap that completes after disposal', async () => {
    const decoding = deferred<ImageBitmap>();
    vi.mocked(createImageBitmap).mockReturnValue(decoding.promise);
    const images = loader();
    const request = images.load(identity());
    await vi.advanceTimersByTimeAsync(0);
    expect(createImageBitmap).toHaveBeenCalledOnce();
    images.dispose();
    expect(await request).toBeNull();
    const stale = bitmap();
    decoding.resolve(stale);
    await vi.advanceTimersByTimeAsync(0);
    expect(stale.close).toHaveBeenCalledOnce();
  });

  it('gives a queued image its own ten-second active deadline when a slot opens', async () => {
    const incoming = Array.from({ length: 3 }, () => deferred<Response>());
    let next = 0;
    vi.mocked(fetch).mockImplementation(() => incoming[next++].promise);
    const images = loader();
    const first = images.load(identity(1));
    const second = images.load(identity(2));
    const queued = images.load(identity(3));
    let queuedSettled = false;
    void queued.then(() => {
      queuedSettled = true;
    });
    await vi.advanceTimersByTimeAsync(5_000);
    incoming[0].resolve(response());
    (await first)!.close();
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(await second).toBeNull();
    expect(queuedSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await queued).toBeNull();
    incoming[1].resolve(new Response(null, { status: 404 }));
    incoming[2].resolve(new Response(null, { status: 404 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires active fetches after ten seconds and bounds queue waiting to sixty seconds', async () => {
    const incoming = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(incoming.promise);
    const images = loader();
    const requests = [images.load(identity(1)), images.load(identity(2)), images.load(identity(3))];
    let queuedSettled = false;
    void requests[2].then(() => {
      queuedSettled = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await Promise.all(requests.slice(0, 2))).toEqual([null, null]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options!.signal!.aborted)).toBe(true);
    await vi.advanceTimersByTimeAsync(49_999);
    expect(queuedSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await requests[2]).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    incoming.resolve(new Response(null, { status: 404 }));
    await vi.advanceTimersByTimeAsync(0);
  });

  it('cancels a body stalled in the middle of a read when its deadline expires', async () => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(WHITE_PIXEL.slice(0, 8));
          },
          cancel,
        }),
        { headers: { 'content-type': 'image/png' } },
      ),
    );
    const request = loader().load(identity());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await request).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
