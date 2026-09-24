/**
 * GLSL for InkTrack's comic look. Everything is single-pass and forward
 * rendered — no post-processing — so it stays cheap on tile-based mobile GPUs.
 *
 *  toon      : 3-band cel shading (lit / mid / shadow) + screen-space halftone
 *              dots in the darker bands + optional flat "shine" highlight.
 *  outline   : inverted-hull ink lines, extruded along smoothed normals by a
 *              constant number of *screen pixels*.
 */

const commonVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vFogDepth;
  varying vec3 vViewDir;
`;

export const toonVertex = /* glsl */ `
  ${commonVertex}
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vNormal = normalize(mat3(modelMatrix) * n);
    vColor = vec3(1.0);
    #ifdef USE_COLOR
      vColor = color;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor *= instanceColor;
    #endif
    vUv = uv;
    vViewDir = cameraPosition - world.xyz;
    vec4 mv = viewMatrix * world;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const toonFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  uniform float uOpacity;
  uniform vec3 uLightDir;
  uniform vec3 uMidTint;
  uniform vec3 uShadowTint;
  uniform vec2 uBands;
  uniform vec3 uInk;
  uniform float uHalftoneSize;
  uniform float uHalftone;
  uniform vec3 uFogColor;
  uniform vec2 uFogRange;
  uniform float uShine;
  #ifdef USE_MAP
    uniform sampler2D map;
  #endif
  ${commonVertex}

  void main() {
    vec3 base = uColor * vColor;
    #ifdef USE_MAP
      base *= texture2D(map, vUv).rgb;
    #endif
    vec3 N = normalize(vNormal);
    #ifdef DOUBLE_SIDED
      if (!gl_FrontFacing) N = -N;
    #endif

    // Half-Lambert, quantised into three flat bands.
    float l = dot(N, uLightDir) * 0.5 + 0.5;
    float lit = step(uBands.x, l);
    float mid = step(uBands.y, l);
    vec3 shade = mix(uShadowTint, mix(uMidTint, vec3(1.0), lit), mid);
    vec3 col = base * shade;

    #ifdef USE_HALFTONE
      // Screen-space dot screen at 45°, dots grow as light falls off — like a
      // printed comic's shadow tint. Pure ALU, no texture fetch.
      float shadowAmt = 1.0 - smoothstep(uBands.y - 0.22, uBands.x + 0.02, l);
      vec2 p = gl_FragCoord.xy / uHalftoneSize;
      p = vec2(p.x + p.y, p.y - p.x) * 0.70710678;
      float d = length(fract(p) - 0.5);
      float radius = sqrt(shadowAmt) * 0.6 * uHalftone;
      float aa = 0.75 / uHalftoneSize;
      float dotMask = (1.0 - smoothstep(radius - aa, radius + aa, d)) * step(0.02, shadowAmt);
      col = mix(col, col * uInk, dotMask);
    #endif

    #ifdef USE_SHINE
      vec3 V = normalize(vViewDir);
      vec3 H = normalize(uLightDir + V);
      float spec = step(0.985 - 0.02 * uShine, dot(N, H));
      float rim = step(0.78, 1.0 - max(dot(N, V), 0.0)) * lit;
      col = mix(col, vec3(1.0), spec * 0.9 + rim * 0.25);
    #endif

    col += uEmissive;
    float fog = smoothstep(uFogRange.x, uFogRange.y, vFogDepth);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export const outlineVertex = /* glsl */ `
  attribute vec3 outlineNormal;
  uniform float uOutlinePx;
  uniform float uPxToWorld;
  uniform float uThickness;
  uniform float uMaxDist;
  varying float vFogDepth;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = outlineNormal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vec3 wn = normalize(mat3(modelMatrix) * n);
    float dist = distance(world.xyz, cameraPosition);
    // Constant pixel width up close, thinning out with distance past uMaxDist.
    float w = uOutlinePx * uThickness * uPxToWorld * clamp(dist, 0.5, uMaxDist);
    world.xyz += wn * w;
    vec4 mv = viewMatrix * world;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const outlineFragment = /* glsl */ `
  uniform vec3 uInkColor;
  uniform float uOpacity;
  uniform vec3 uFogColor;
  uniform vec2 uFogRange;
  varying float vFogDepth;
  void main() {
    float fog = smoothstep(uFogRange.x, uFogRange.y, vFogDepth);
    gl_FragColor = vec4(mix(uInkColor, uFogColor, fog), uOpacity);
  }
`;
