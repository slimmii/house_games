import * as THREE from 'three';
import daylight from '../shared/daylight.json';
import { SPLAT_STYLE, SplatRenderer } from './splatStyle';

/** `?style=comic`: unbaked, shadowless toon lighting with ink outlines. */
const comicQuery = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
/**
 * Styles: `toy` (default, live smooth shading), `classic` (baked), `comic` (toon + ink).
 * `?style=splat` is the toy style drawn through the 8-bit blob pass of splatStyle.ts.
 */
export const STYLE: 'toy' | 'classic' | 'comic' = (['classic', 'comic'] as const).find(s => s === comicQuery.get('style')) ?? 'toy';
export const COMIC_STYLE = STYLE === 'comic';
export const TOY_STYLE = STYLE === 'toy';
/** Toy style draws thin outlines only with `?outline=on`. */
export const TOY_OUTLINES = TOY_STYLE && comicQuery.get('outline') === 'on';
/** MSAA samples for the comic scene buffer (`?aa=0|2|4`). Ink lines hide most stair-stepping. */
const COMIC_SAMPLES = Number(comicQuery.get('aa') ?? 0);
/** Environment reflections cost a cubemap lookup per pixel; off unless `?env=on`. */
export const COMIC_REFLECTIONS = comicQuery.get('env') === 'on';

/**
 * Tone curve and exposure for the current style. Toy uses the Khronos neutral
 * curve, which keeps material colours as authored; AgX (classic, comic)
 * desaturates by about a quarter. `?tone=agx|neutral` overrides for comparison.
 */
export function configureToneMapping(renderer: THREE.WebGLRenderer): void {
  const tone = comicQuery.get('tone');
  const neutral = tone === 'neutral' || (tone !== 'agx' && TOY_STYLE);
  renderer.toneMapping = neutral ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
  renderer.toneMappingExposure = COMIC_STYLE ? daylight.comic.exposure : TOY_STYLE ? daylight.toy.exposure : daylight.exposure;
}

const glslVec3 = (values: readonly number[]) => `vec3(${values.map(value => value.toFixed(4)).join(', ')})`;
const unit = (values: readonly number[]) => new THREE.Vector3().fromArray(values).normalize().toArray();

let installed = false;

/**
 * Replace every lit material's diffuse light with a cheap direction-based toon
 * ramp: a sky/ground hemisphere plus a banded key and fill light, computed
 * from the surface normal alone. Walls facing different ways, floors and
 * ceilings each get their own tone, so rooms read in 3D without shadow maps,
 * scene lights or a bake. Patches the shared shader chunk, so drones, doors,
 * paint and furniture all follow without per-material hooks. Call before the
 * first frame.
 */
export function installComicShading(): void {
  if (installed) return;
  installed = true;
  const comic = daylight.comic;
  THREE.ShaderChunk.lights_fragment_end += `
{
  vec3 comicNormal = normalize( inverseTransformDirection( normal, viewMatrix ) );
  vec3 comicHemi = mix( ${glslVec3(comic.groundColor)}, ${glslVec3(comic.skyColor)}, comicNormal.y * 0.5 + 0.5 );
  float comicKey = max( dot( comicNormal, ${glslVec3(unit(comic.keyDirection))} ), 0.0 );
  float comicFill = max( dot( comicNormal, ${glslVec3(unit(comic.fillDirection))} ), 0.0 );
  // Two hard-ish steps per light give the drawn, banded look.
  float comicKeyBand = smoothstep( 0.10, 0.16, comicKey ) * 0.55 + smoothstep( 0.55, 0.61, comicKey ) * 0.45;
  float comicFillBand = smoothstep( 0.20, 0.26, comicFill );
  vec3 comicLight = comicHemi
    + ${glslVec3(comic.keyColor)} * comicKeyBand * ${comic.keyStrength.toFixed(3)}
    + ${glslVec3(comic.fillColor)} * comicFillBand * ${comic.fillStrength.toFixed(3)};
  reflectedLight.directDiffuse = vec3( 0.0 );
  reflectedLight.directSpecular = vec3( 0.0 );
  reflectedLight.indirectDiffuse = material.diffuseColor * comicLight;
  reflectedLight.indirectSpecular *= ${comic.reflections.toFixed(3)};
}
`;
}

const outlineVertex = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

const outlineFragment = /* glsl */`
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform float strength;
uniform float fadeStart;
uniform float fadeEnd;
uniform vec3 inkColor;
varying vec2 vUv;

float viewDistance( vec2 uv ) {
  return -perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, cameraNear, cameraFar );
}

void main() {
  vec4 color = texture2D( tColor, vUv );
  float d = viewDistance( vUv );
  float l = viewDistance( vUv - vec2( texel.x, 0.0 ) );
  float r = viewDistance( vUv + vec2( texel.x, 0.0 ) );
  float u = viewDistance( vUv + vec2( 0.0, texel.y ) );
  float b = viewDistance( vUv - vec2( 0.0, texel.y ) );
  // Silhouettes: a jump in distance between neighbouring pixels.
  float jump = max( max( abs( l - d ), abs( r - d ) ), max( abs( u - d ), abs( b - d ) ) ) / d;
  // Creases (wall meets ceiling): 1/distance is linear across any flat plane,
  // so its second derivative is zero on planes and spikes at folds.
  float id = 1.0 / d;
  float crease = ( abs( 1.0 / l + 1.0 / r - 2.0 * id ) + abs( 1.0 / u + 1.0 / b - 2.0 * id ) ) / id;
  float edge = max( smoothstep( 0.035, 0.09, jump ), smoothstep( 0.004, 0.012, crease ) );
  edge *= 1.0 - smoothstep( fadeStart, fadeEnd, d );
  color.rgb = mix( color.rgb, inkColor, edge * strength );
  gl_FragColor = color;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Renders the scene into an MSAA target with a depth texture, then draws one
 * full-screen pass that inks silhouettes and creases. Tone mapping and output
 * colour conversion happen in that final pass.
 */
/** The full-screen pass for the current style, if it uses one. */
export function createOutlinePass(): ComicRenderer | SplatRenderer | undefined {
  if (SPLAT_STYLE) return new SplatRenderer();
  if (COMIC_STYLE) return new ComicRenderer();
  if (TOY_OUTLINES) return new ComicRenderer(daylight.toy.outlineStrength);
  return undefined;
}

export class ComicRenderer {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: COMIC_SAMPLES,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  private readonly material = new THREE.ShaderMaterial({
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      texel: { value: new THREE.Vector2() },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 100 },
      strength: { value: daylight.comic.outlineStrength },
      fadeStart: { value: 30 },
      fadeEnd: { value: 70 },
      inkColor: { value: new THREE.Color().fromArray(daylight.comic.inkColor) },
    },
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();

  constructor(strength = daylight.comic.outlineStrength) {
    this.material.uniforms.strength.value = strength;
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.material.uniforms.tColor.value = this.target.texture;
    this.material.uniforms.tDepth.value = this.target.depthTexture;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y);
      this.material.uniforms.texel.value.set(1 / this.size.x, 1 / this.size.y);
    }
    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
