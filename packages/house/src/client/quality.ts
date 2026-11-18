/**
 * Render quality tier. `high` is the default; `low` targets old integrated GPUs
 * (for example a 2015 Intel MacBook Pro): no MSAA, no environment reflections,
 * cheaper texture filtering and a lower dynamic-resolution floor.
 *
 * Order of precedence: `?quality=low|high` (also remembered), then a tier
 * remembered after the game found itself too slow (see `rememberLowQuality`),
 * then a guess from the GPU name.
 */
export type QualityTier = 'low' | 'high';

const STORAGE_KEY = 'little-rotors-quality';
const query = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

function stored(): QualityTier | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'low' || value === 'high' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Integrated Intel GPUs and software rasterisers. Apple, NVIDIA and AMD GPUs stay on `high`. */
function gpuLooksWeak(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /Intel|SwiftShader|llvmpipe|softpipe|Software/i.test(name);
  } catch {
    return false;
  }
}

function chooseTier(): QualityTier {
  const forced = query.get('quality');
  if (forced === 'low' || forced === 'high') {
    // Remember an explicit choice, so `?quality=high` once undoes an automatic downgrade.
    try { localStorage.setItem(STORAGE_KEY, forced); } catch { /* not persisted */ }
    return forced;
  }
  return stored() ?? (gpuLooksWeak() ? 'low' : 'high');
}

export const QUALITY: QualityTier = chooseTier();
export const LOW_QUALITY = QUALITY === 'low';
/** True when the URL picked the tier, so automatic downgrades leave it alone. */
export const QUALITY_FORCED = query.has('quality');

/**
 * Called when the game stays slow at its lowest resolution. Antialiasing can
 * only change with a new WebGL context, so the next page load starts on `low`.
 */
export function rememberLowQuality(): void {
  try { localStorage.setItem(STORAGE_KEY, 'low'); } catch { /* private mode: retry next time */ }
}
