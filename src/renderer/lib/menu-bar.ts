// One template image keeps lyrics, controls and the app icon in a stable order.
export function renderMenuBar(lyric: string, playing: boolean) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  context.font = font;
  let text = lyric.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim();
  const characters = Array.from(text);
  while (context.measureText(text).width > 220 && characters.length) {
    characters.pop();
    text = characters.join('') + '…';
  }
  const textWidth = text ? Math.ceil(context.measureText(text).width) + 12 : 0;
  const width = textWidth + 110;
  canvas.width = width * 2;
  canvas.height = 44;
  context.scale(2, 2);
  context.fillStyle = '#000';
  context.strokeStyle = '#000';
  context.font = font;
  context.textBaseline = 'middle';
  context.fillText(text, 0, 11);
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  function triangle(x: number, reverse = false) {
    context.beginPath();
    context.moveTo(x + (reverse ? 7 : 0), 6.5);
    context.lineTo(x + (reverse ? 0 : 7), 11);
    context.lineTo(x + (reverse ? 7 : 0), 15.5);
    context.closePath();
    context.fill();
    context.stroke();
  }
  function bar(x: number, height = 10) {
    context.beginPath();
    context.moveTo(x, 11 - height / 2);
    context.lineTo(x, 11 + height / 2);
    context.stroke();
  }
  const start = textWidth;
  bar(start + 8);
  triangle(start + 11, true);
  if (playing) {
    context.lineWidth = 2.4;
    bar(start + 39);
    bar(start + 44);
    context.lineWidth = 1.6;
  } else triangle(start + 38);
  triangle(start + 65);
  bar(start + 75);
  // A smaller, rounded waveform mark, optically aligned with the controls.
  context.lineWidth = 1.5;
  for (const [index, height] of [4, 9, 12, 7].entries()) bar(start + 92 + index * 3, height);
  return { image: canvas.toDataURL('image/png'), width };
}
