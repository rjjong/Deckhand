// SPDX-License-Identifier: AGPL-3.0-or-later
// Local performance helpers. All catalog rows and the original pixel sampling are retained.

const RGB_NORMALIZATION = new Float32Array(3 * 256);
const RGB_MEAN = [0.485, 0.456, 0.406];
const RGB_STD = [0.229, 0.224, 0.225];
for (let channel = 0; channel < 3; channel++) {
  for (let byte = 0; byte < 256; byte++) {
    RGB_NORMALIZATION[channel * 256 + byte] = (byte / 255 - RGB_MEAN[channel]) / RGB_STD[channel];
  }
}

export function normalizeRgba(data, plane, tensor) {
  for (let i = 0, pixel = 0; i < plane; i++, pixel += 4) {
    tensor[i] = RGB_NORMALIZATION[data[pixel]];
    tensor[plane + i] = RGB_NORMALIZATION[256 + data[pixel + 1]];
    tensor[plane * 2 + i] = RGB_NORMALIZATION[512 + data[pixel + 2]];
  }
  return tensor;
}

export function rectifyRgba(source, width, height, target, outWidth, outHeight, matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  for (let y = 0; y < outHeight; y++) {
    const rowX = b * y + c,
      rowY = e * y + f,
      rowW = h * y + i;
    for (let x = 0; x < outWidth; x++) {
      const denominator = g * x + rowW;
      const sx = Math.min(Math.max((a * x + rowX) / denominator, 0), width - 1);
      const sy = Math.min(Math.max((d * x + rowY) / denominator, 0), height - 1);
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, width - 1),
        y1 = Math.min(y0 + 1, height - 1);
      const tx = sx - x0,
        ty = sy - y0;
      const p00 = (y0 * width + x0) * 4,
        p10 = (y0 * width + x1) * 4;
      const p01 = (y1 * width + x0) * 4,
        p11 = (y1 * width + x1) * 4;
      const offset = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const top = source[p00 + channel] * (1 - tx) + source[p10 + channel] * tx;
        const bottom = source[p01 + channel] * (1 - tx) + source[p11 + channel] * tx;
        target[offset + channel] = top * (1 - ty) + bottom * ty;
      }
      target[offset + 3] = 255;
    }
  }
}

export function searchPackedCatalog(embeddings, query, rows, dims, lookup) {
  let bestIndex = -1,
    bestScore = -Infinity;
  for (let row = 0; row < rows; row++) {
    const offset = row * dims;
    let a = 0,
      b = 0,
      c = 0,
      d = 0,
      col = 0;
    // Four independent sums shorten the dependency chain without expanding the f16 catalog.
    for (; col + 3 < dims; col += 4) {
      a += lookup[embeddings[offset + col]] * query[col];
      b += lookup[embeddings[offset + col + 1]] * query[col + 1];
      c += lookup[embeddings[offset + col + 2]] * query[col + 2];
      d += lookup[embeddings[offset + col + 3]] * query[col + 3];
    }
    let score = a + b + c + d;
    for (; col < dims; col++) score += lookup[embeddings[offset + col]] * query[col];
    if (score > bestScore) {
      bestScore = score;
      bestIndex = row;
    }
  }
  return { bestIndex, bestScore };
}

export function outputsAgree(reference, candidate) {
  const names = Object.keys(reference);
  if (names.length !== Object.keys(candidate).length) return false;
  return names.every((name) => {
    const a = reference[name],
      b = candidate[name];
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (
        !Number.isFinite(a[i]) ||
        !Number.isFinite(b[i]) ||
        Math.abs(a[i] - b[i]) > 0.005 + Math.abs(a[i]) * 0.01
      )
        return false;
    }
    return true;
  });
}

export async function runModel(ort, session, values, size) {
  const tensor = new ort.Tensor('float32', values, [1, 3, size, size]);
  let outputs;
  try {
    outputs = await session.run({ [session.inputNames[0]]: tensor });
    return Object.fromEntries(
      Object.entries(outputs).map(([name, value]) => [name, Float32Array.from(value.data)]),
    );
  } finally {
    tensor.dispose?.();
    for (const output of Object.values(outputs || {})) output.dispose?.();
  }
}

async function benchmark(ort, session, inputs, size, now) {
  const results = [],
    times = [];
  // Compile and warm the graph before measuring. Include CPU readback in GPU timings.
  for (let index = -1; index < inputs.length; index++) {
    const start = now();
    const copied = await runModel(ort, session, inputs[Math.max(0, index)], size);
    if (index >= 0) {
      times.push(now() - start);
      results.push(copied);
    }
  }
  return { results, ms: times.reduce((a, b) => a + b, 0) / times.length };
}

export async function selectInferenceSession({
  ort,
  buffer,
  inputs,
  size,
  webgpu,
  now = () => performance.now(),
  timeoutMs = 8000,
}) {
  const cpu = await ort.InferenceSession.create(buffer, { executionProviders: ['wasm'] });
  let reference;
  try {
    reference = await benchmark(ort, cpu, inputs, size, now);
  } catch (error) {
    await cpu.release();
    throw error;
  }
  let selected = cpu,
    provider = 'WASM',
    candidate = null;
  const timings = { wasmMs: reference.ms, webgpuMs: null, reason: 'unavailable' };
  if (webgpu) {
    let expired = false,
      timer;
    const trial = (async () => {
      const session = await ort.InferenceSession.create(buffer, { executionProviders: ['webgpu'] });
      let keep = false;
      try {
        if (expired) return null;
        const measured = await benchmark(ort, session, inputs, size, now);
        if (expired) return null;
        keep = true;
        return { session, measured };
      } finally {
        if (!keep) await session.release();
      }
    })();
    try {
      const result = await Promise.race([
        trial,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new Error('GPU benchmark timed out'));
          }, timeoutMs);
        }),
      ]);
      candidate = result.session;
      timings.webgpuMs = result.measured.ms;
      const accurate = reference.results.every((output, i) =>
        outputsAgree(output, result.measured.results[i]),
      );
      timings.reason = accurate ? 'slower' : 'accuracy';
      if (accurate && result.measured.ms < reference.ms * 0.9) {
        selected = candidate;
        provider = 'WebGPU';
        timings.reason = 'faster';
      } else {
        await candidate.release();
        candidate = null;
      }
    } catch {
      timings.reason = expired ? 'timeout' : 'unsupported';
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    inputNames: cpu.inputNames,
    outputNames: cpu.outputNames,
    timings,
    get provider() {
      return provider;
    },
    async run(feeds) {
      try {
        return await selected.run(feeds);
      } catch (error) {
        if (selected === cpu) throw error;
        // A driver/device failure must not prevent scanning on the CPU.
        selected = cpu;
        provider = 'WASM';
        timings.reason = 'runtime-fallback';
        await candidate?.release().catch(() => {});
        candidate = null;
        return cpu.run(feeds);
      }
    },
    async release() {
      await candidate?.release();
      await cpu.release();
    },
  };
}
