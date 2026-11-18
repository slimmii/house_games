import * as THREE from 'three';
import { LOW_QUALITY } from './quality';

const query = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
/**
 * `?style=splat`: the toy-lit scene drawn at 8-bit console resolution in a
 * 216-colour palette, then rebuilt on screen from soft overlapping blobs, the
 * way a Gaussian-splat capture looks.
 */
export const SPLAT_STYLE = query.get('style') === 'splat';
/** Blob rows down the screen (`?splat=60..300`). The scene itself renders at this height. */
const ROWS = THREE.MathUtils.clamp(Number(query.get('splat')) || 170, 60, 300);

const quadVertex = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

/**
 * One texel per blob: tone-mapped colour snapped to a small palette, sixteen
 * dithered brightness steps times a coarse grid of boosted tints. Alpha
 * carries the direction of a colour edge through the cell (0 = no edge), so
 * the blob can stretch along it.
 */
const cellFragment = /* glsl */`
${THREE.ShaderChunk.tonemapping_pars_fragment}
uniform sampler2D tScene;
const float PI = 3.141592653589793;
const float LUMA_STEPS = 15.0;
const float TINT_STEPS = 8.0;
const float SATURATION = 1.5;
const float EDGE = 0.035;
const vec3 LUMA = vec3( 0.299, 0.587, 0.114 );
const float BAYER[16] = float[16]( 0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5. );

vec3 display( ivec2 cell ) {
  vec3 color = texelFetch( tScene, clamp( cell, ivec2( 0 ), textureSize( tScene, 0 ) - 1 ), 0 ).rgb;
  #if TONE == 1
    color = NeutralToneMapping( color );
  #elif TONE == 2
    color = AgXToneMapping( color );
  #else
    color *= toneMappingExposure;
  #endif
  return sRGBTransferOETF( vec4( clamp( color, 0.0, 1.0 ), 1.0 ) ).rgb;
}
float luma( ivec2 cell ) { return dot( display( cell ), LUMA ); }

void main() {
  ivec2 cell = ivec2( gl_FragCoord.xy );
  vec3 color = display( cell );
  // Brightness and boosted tint snap separately, both dithered: two white
  // surfaces a shade apart still differ in dot density, and a faint tint
  // shows as scattered dots instead of flipping the whole surface.
  float brightness = dot( color, LUMA );
  float threshold = ( BAYER[ ( cell.y & 3 ) * 4 + ( cell.x & 3 ) ] + 0.5 ) / 16.0;
  vec3 tint = floor( ( color - brightness ) * SATURATION * TINT_STEPS + threshold ) / TINT_STEPS;
  brightness = floor( brightness * LUMA_STEPS + threshold ) / LUMA_STEPS;
  vec2 gradient = vec2(
    luma( cell + ivec2( 1, 0 ) ) - luma( cell - ivec2( 1, 0 ) ),
    luma( cell + ivec2( 0, 1 ) ) - luma( cell - ivec2( 0, 1 ) ) );
  float along = 0.0;
  if ( length( gradient ) > EDGE ) {
    // The edge runs across the gradient; fold the angle into 0..PI.
    float angle = mod( atan( gradient.y, gradient.x ) + PI * 0.5, PI );
    along = ( 1.0 + floor( angle / PI * 253.0 + 0.5 ) ) / 255.0;
  }
  gl_FragColor = vec4( clamp( brightness + tint, 0.0, 1.0 ), along );
}`;

/**
 * Each screen pixel composites the blobs of the 3x3 cells around it over a
 * smooth copy of the cell colours, back to front: first the cells on one
 * colour of a checkerboard, then the other. Blob centres are jittered inside
 * their cell and fade out before the edge of that window, so no blob is cut off.
 */
const splatFragment = /* glsl */`
uniform sampler2D tCells;
uniform vec2 grid;
varying vec2 vUv;
const float PI = 3.141592653589793;
const float JITTER = 0.6;

vec3 hash3( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yxz + 33.33 );
  return fract( ( p3.xxy + p3.yzz ) * p3.zyx );
}

void main() {
  vec2 point = vUv * grid;
  ivec2 base = ivec2( floor( point ) );
  ivec2 last = ivec2( grid ) - 1;
  vec3 color = texture2D( tCells, vUv ).rgb;
  for ( int board = 0; board < 2; board ++ ) {
    for ( int j = - 1; j <= 1; j ++ ) {
      for ( int i = - 1 + ( ( base.x + base.y + j + board + 1 ) & 1 ); i <= 1; i += 2 ) {
        ivec2 cell = base + ivec2( i, j );
        vec2 id = vec2( cell );
        vec3 random = hash3( id );
        vec2 offset = point - ( id + 0.5 + ( random.xy - 0.5 ) * JITTER );
        float reach = dot( offset, offset );
        if ( reach > 1.44 ) continue;
        vec4 texel = texelFetch( tCells, clamp( cell, ivec2( 0 ), last ), 0 );
        // Mostly small blobs with a few large, fainter ones over them.
        float sigma = mix( 0.32, 0.52, random.z * random.z );
        float distance2 = reach;
        if ( texel.a > 0.0 ) {
          // On an edge the blob lies along it, long and thin; elsewhere it is round.
          float angle = ( texel.a * 255.0 - 1.0 ) / 253.0 * PI;
          vec2 axis = vec2( cos( angle ), sin( angle ) );
          vec2 local = vec2( dot( offset, axis ), dot( offset, vec2( - axis.y, axis.x ) ) ) * vec2( 1.0 / 1.7, 1.7 );
          distance2 = dot( local, local );
        }
        float alpha = mix( 1.0, 0.7, random.z ) * exp( - 0.5 * distance2 / ( sigma * sigma ) ) * ( 1.0 - smoothstep( 0.72, 1.44, reach ) );
        color = mix( color, texel.rgb, alpha );
      }
    }
  }
  gl_FragColor = vec4( color, 1.0 );
}`;

const TONE_DEFINE = new Map<THREE.ToneMapping, number>([[THREE.NeutralToneMapping, 1], [THREE.AgXToneMapping, 2]]);

/**
 * Three passes: the scene at blob resolution, a palette pass at the same
 * resolution, and one full-screen pass that draws the blobs. The scene pass
 * shades roughly 30 times fewer pixels than a native frame.
 */
export class SplatRenderer {
  private readonly sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    // Multisampling steadies thin railings and edges, which would otherwise flicker at this size.
    samples: LOW_QUALITY ? 0 : 4,
  });
  private readonly cellTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly cellMaterial = new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: cellFragment,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    defines: { TONE: 0 },
    uniforms: { tScene: { value: this.sceneTarget.texture }, toneMappingExposure: { value: 1 } },
  });
  private readonly splatMaterial = new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: splatFragment,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { tCells: { value: this.cellTarget.texture }, grid: { value: new THREE.Vector2(1, 1) } },
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.cellMaterial);
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();

  constructor() {
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(this.size);
    const columns = Math.max(1, Math.round(ROWS * this.size.x / Math.max(this.size.y, 1)));
    if (this.sceneTarget.width !== columns || this.sceneTarget.height !== ROWS) {
      this.sceneTarget.setSize(columns, ROWS);
      this.cellTarget.setSize(columns, ROWS);
      this.splatMaterial.uniforms.grid.value.set(columns, ROWS);
    }
    const tone = TONE_DEFINE.get(renderer.toneMapping) ?? 0;
    if (this.cellMaterial.defines.TONE !== tone) {
      this.cellMaterial.defines.TONE = tone;
      this.cellMaterial.needsUpdate = true;
    }
    this.cellMaterial.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    this.quad.material = this.cellMaterial;
    renderer.setRenderTarget(this.cellTarget);
    renderer.render(this.quadScene, this.quadCamera);
    this.quad.material = this.splatMaterial;
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.cellTarget.dispose();
    this.cellMaterial.dispose();
    this.splatMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
