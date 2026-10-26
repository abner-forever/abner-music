export async function readPlaylistArtwork(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type))
    throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('封面图片不能超过 10 MB');

  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    try {
      await image.decode();
    } catch {
      throw new Error('图片无法读取，请选择有效的图片');
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('暂时无法处理封面图片，请重试');
    context.fillStyle = '#f7f8f2';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(source);
  }
}
