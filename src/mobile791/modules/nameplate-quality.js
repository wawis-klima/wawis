const ANALYSIS_MAX_DIMENSION = 480;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Brak zdjęcia do kontroli jakości.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Nie udało się odczytać zdjęcia do kontroli jakości.'));
    };
    image.src = url;
  });
}

function calculateLaplacianVariance(gray, width, height) {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const index = row + x;
      const laplacian = (4 * gray[index])
        - gray[index - 1]
        - gray[index + 1]
        - gray[index - width]
        - gray[index + width];
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return Math.max(0, (sumSquares / count) - (mean * mean));
}

export async function analyzeNameplatePhotoQuality(file, context = {}) {
  const loaded = await loadImageFromFile(file);
  const image = loaded.image;
  try {
    const sourceWidth = Number(image.naturalWidth || image.width || 0);
    const sourceHeight = Number(image.naturalHeight || image.height || 0);
    if (!sourceWidth || !sourceHeight) throw new Error('Brak wymiarów zdjęcia tabliczki.');

    const scale = Math.min(1, ANALYSIS_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!ctx) throw new Error('Telefon nie udostępnił analizy obrazu.');
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const pixelCount = width * height;
    const gray = new Float32Array(pixelCount);

    let luminanceSum = 0;
    let luminanceSquares = 0;
    let darkPixels = 0;
    let clippedPixels = 0;
    let lowContrastWhitePixels = 0;

    for (let pixelIndex = 0, dataIndex = 0; pixelIndex < pixelCount; pixelIndex += 1, dataIndex += 4) {
      const red = pixels[dataIndex];
      const green = pixels[dataIndex + 1];
      const blue = pixels[dataIndex + 2];
      const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
      gray[pixelIndex] = luminance;
      luminanceSum += luminance;
      luminanceSquares += luminance * luminance;
      if (luminance < 45) darkPixels += 1;
      if (red > 251 && green > 251 && blue > 251) clippedPixels += 1;
      const channelSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (luminance > 244 && channelSpread < 10) lowContrastWhitePixels += 1;
    }

    const averageBrightness = luminanceSum / pixelCount;
    const brightnessVariance = Math.max(0, (luminanceSquares / pixelCount) - (averageBrightness * averageBrightness));
    const brightnessStdDev = Math.sqrt(brightnessVariance);
    const darkRatio = darkPixels / pixelCount;
    const clippedRatio = clippedPixels / pixelCount;
    const whiteRatio = lowContrastWhitePixels / pixelCount;
    const sharpness = calculateLaplacianVariance(gray, width, height);
    const cropAreaRatio = clamp(Number(context.cropAreaRatio || 1), 0, 1);
    const sourceCropWidth = Number(context.sourceCropWidth || sourceWidth);
    const sourceCropHeight = Number(context.sourceCropHeight || sourceHeight);

    const warnings = [];
    if (averageBrightness < 58 || darkRatio > 0.48) {
      warnings.push({ code: 'dark', label: 'Zdjęcie jest ciemne. Doświetl tabliczkę i zrób je ponownie.' });
    }
    if (sharpness < 42 && Math.min(width, height) >= 180) {
      warnings.push({ code: 'blur', label: 'Zdjęcie może być poruszone lub nieostre.' });
    }
    if ((clippedRatio > 0.34) || (whiteRatio > 0.24 && brightnessStdDev < 48)) {
      warnings.push({ code: 'glare', label: 'Na tabliczce może być mocny odblask. Zmień kąt telefonu.' });
    }
    if (cropAreaRatio < 0.035 || Math.min(sourceCropWidth, sourceCropHeight) < 420) {
      warnings.push({ code: 'small', label: 'Tabliczka zajmuje bardzo mały fragment zdjęcia. Podejdź bliżej.' });
    }
    if (Math.min(sourceWidth, sourceHeight) < 520) {
      warnings.push({ code: 'resolution', label: 'Zdjęcie ma niską rozdzielczość i drobny tekst może być nieczytelny.' });
    }

    return {
      ok: warnings.length === 0,
      warnings,
      metrics: {
        sourceWidth,
        sourceHeight,
        averageBrightness: Math.round(averageBrightness),
        darkRatio: Number(darkRatio.toFixed(3)),
        clippedRatio: Number(clippedRatio.toFixed(3)),
        sharpness: Math.round(sharpness),
        cropAreaRatio: Number(cropAreaRatio.toFixed(3)),
      },
    };
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}
