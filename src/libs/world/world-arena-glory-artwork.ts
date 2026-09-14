export const WORLD_ARENA_GLORY_SIZE = { width: 512, height: 768 } as const;

/** Shared, deterministic 2D artwork for the victory screen and the arena's cloth banners. */
export function paintWorldArenaGlory(canvas: HTMLCanvasElement, bitmap: ImageBitmap | null = null): boolean {
  canvas.width = WORLD_ARENA_GLORY_SIZE.width;
  canvas.height = WORLD_ARENA_GLORY_SIZE.height;
  try {
    if (
      bitmap &&
      (!Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height) || bitmap.width < 1 || bitmap.height < 1)
    ) {
      canvas.width = canvas.height = 0;
      return false;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      canvas.width = canvas.height = 0;
      return false;
    }
    context.fillStyle = '#682F35';
    context.fillRect(0, 0, 512, 768);
    context.strokeStyle = '#D5AD64';
    context.lineWidth = 12;
    context.strokeRect(24, 24, 464, 720);
    context.lineWidth = 2;
    context.strokeRect(42, 42, 428, 684);
    context.fillStyle = '#FFE3A2';
    context.font = '700 72px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText('GLORY', 256, 158);

    context.save();
    context.beginPath();
    context.arc(256, 403, 174, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#261F26';
    context.fillRect(82, 229, 348, 348);
    if (bitmap) {
      const side = Math.min(bitmap.width, bitmap.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 82, 229, 348, 348);
    } else {
      context.fillStyle = '#FFE3A2';
      context.beginPath();
      context.moveTo(153, 350);
      context.lineTo(203, 389);
      context.lineTo(256, 312);
      context.lineTo(309, 389);
      context.lineTo(359, 350);
      context.lineTo(336, 470);
      context.lineTo(176, 470);
      context.closePath();
      context.fill();
      context.fillRect(176, 485, 160, 14);
    }
    context.restore();
    context.beginPath();
    context.arc(256, 403, 174, 0, Math.PI * 2);
    context.lineWidth = 9;
    context.stroke();
    context.beginPath();
    context.moveTo(160, 636);
    context.lineTo(256, 677);
    context.lineTo(352, 636);
    context.lineWidth = 7;
    context.stroke();
    return true;
  } catch {
    // Resizing removes every profile pixel, including a partially drawn image.
    canvas.width = canvas.height = 0;
    return false;
  }
}
