const { createCanvas } = require('canvas');

function getFontName(font) {
  if (font === 'GenShinGothic' || font === 'NotoS') return { fontName: 'sans-serif', fallback: 'sans-serif' };
  if (font === 'OpenSerif' || font === 'Georgia' || font === 'Merriweather') return { fontName: 'serif', fallback: 'serif' };
  return { fontName: 'sans-serif', fallback: 'sans-serif' };
}

function drawCarouselBait(ctx, v, width, height) {
    const scaleFactor = width / 300;
    const padding = 16 * scaleFactor;
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${10 * scaleFactor}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4 * scaleFactor;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1 * scaleFactor;
    
    ctx.fillText('Свайп вправо ➡️', width - padding, height - padding - (40 * scaleFactor));
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
}

function createOverlayImage(variation, canvasW = 720, canvasH = 1280) {
  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');

  // Background tint if required 
  // In the original it had a linear gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasH);
  gradient.addColorStop(0, 'rgba(0,0,0,0.4)');
  gradient.addColorStop(0.5, 'transparent');
  gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Text setup
  const v = variation;
  const scaleFactor = canvasW / 300;
  const fontSize = v.fontSize * scaleFactor;
  const padding = 16 * scaleFactor;
  const cornerRadius = 12 * scaleFactor;

  const x = (v.posX / 100) * canvasW;
  const y = (v.posY / 100) * canvasH;

  const isSerif = v.font === 'Georgia' || v.font === 'Merriweather' || v.font === 'OpenSerif';
  const fontStyle = isSerif ? 'italic ' : '';

  const { fontName, fallback } = getFontName(v.font);

  ctx.font = `${fontStyle}${v.fontWeight} ${fontSize}px ${fontName}, ${fallback}`;
  ctx.textAlign = v.textAlign;
  ctx.textBaseline = 'middle';

  const lineHeight = fontSize * 1.25;
  const containerWidth = canvasW * 0.90;
  const maxWidth = containerWidth - (padding * 2);

  const words = v.hookText.split(' ');
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const _width = ctx.measureText(currentLine + ' ' + word).width;
    if (_width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);

  const totalTextHeight = lines.length * lineHeight;

  let maxLineWidth = 0;
  lines.forEach(line => {
    const m = ctx.measureText(line);
    if (m.width > maxLineWidth) maxLineWidth = m.width;
  });

  const bgW = maxLineWidth + (padding * 2);
  const bgH = totalTextHeight + (padding * 2);
  const bgY = y - (bgH / 2);
  let bgX = x - (bgW / 2);

  let drawX = x;
  if (v.textAlign === 'left') {
    drawX = bgX + padding;
  } else if (v.textAlign === 'right') {
    drawX = bgX + bgW - padding;
  } else {
    drawX = bgX + (bgW / 2);
  }

  const roundedRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  if (v.backgroundColor !== 'transparent') {
    roundedRect(bgX, bgY, bgW, bgH, cornerRadius);
    if (v.backgroundColor === 'glass') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    } else {
      ctx.fillStyle = v.backgroundColor;
    }
    ctx.fill();

    if (v.backgroundColor === 'glass') {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();
    }
  }

  // Draw Text Line by Line
  let startY = y - (totalTextHeight / 2) + (lineHeight / 2);
  lines.forEach(line => {
    if (v.textShadow || v.backgroundColor === 'transparent') {
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 8 * scaleFactor;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2 * scaleFactor;
    }

    ctx.fillStyle = v.textColor;
    ctx.fillText(line, drawX, startY);

    if (v.textShadow || v.backgroundColor === 'transparent') {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    startY += lineHeight;
  });

  if (v.showCarouselBait) {
    drawCarouselBait(ctx, v, canvasW, canvasH);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { createOverlayImage };
