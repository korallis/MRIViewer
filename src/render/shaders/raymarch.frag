// Single-pass volume raymarcher: MIP / DVR / shaded ISO (PLAN §7.2).
// Ray-setup ideas after Will Usher's WebGL raycaster (MIT) and three.js
// VolumeShader.js (MIT); implementation original.
precision highp float;
precision highp sampler3D;

uniform sampler3D u_data;   // R16F, intensities normalized [0,1]
uniform sampler2D u_lut;    // 256x1 RGBA transfer function (alpha = opacity ramp)
uniform vec2 u_clim;        // window low/high in normalized units
uniform vec3 u_dims;        // voxel dimensions
uniform vec3 u_clipMin;     // clip box in texture space — shrinks the ray interval
uniform vec3 u_clipMax;
uniform int u_mode;         // 0=MIP 1=DVR 2=ISO
uniform float u_isoThreshold;
uniform float u_quality;    // 1 = ~1 voxel/step; <1 = coarser (interaction)
uniform float u_invert;
uniform float u_opacity;    // global DVR opacity scale (0..1)

flat in vec3 v_eyeTex;
in vec3 v_posTex;
in vec3 v_orthoDirTex;
out vec4 fragColor;

const int MAX_STEPS = 2048;

vec2 intersectBox(vec3 o, vec3 d, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / d;
  vec3 t0 = (bmin - o) * inv;
  vec3 t1 = (bmax - o) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

// Interleaved gradient noise — hides fixed-step banding (mandatory, PLAN §7.2).
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float windowed(vec3 p) {
  float v = texture(u_data, p).r;
  float w = clamp((v - u_clim.x) / (u_clim.y - u_clim.x), 0.0, 1.0);
  return mix(w, 1.0 - w, u_invert);
}

vec4 lut(float w) {
  return texture(u_lut, vec2((w * 255.0 + 0.5) / 256.0, 0.5));
}

vec3 gradientAt(vec3 p) {
  vec3 d = 1.5 / u_dims;
  return normalize(vec3(
    windowed(p - vec3(d.x, 0.0, 0.0)) - windowed(p + vec3(d.x, 0.0, 0.0)),
    windowed(p - vec3(0.0, d.y, 0.0)) - windowed(p + vec3(0.0, d.y, 0.0)),
    windowed(p - vec3(0.0, 0.0, d.z)) - windowed(p + vec3(0.0, 0.0, d.z))
  ) + vec3(1e-6));
}

void main() {
  vec3 dir;
  vec3 origin;
  if (isOrthographic) {
    dir = normalize(v_orthoDirTex);
    origin = v_posTex - dir * 4.0; // start well outside the unit box
  } else {
    dir = normalize(v_posTex - v_eyeTex);
    origin = v_eyeTex;
  }

  vec2 t = intersectBox(origin, dir, u_clipMin, u_clipMax);
  if (t.x > t.y) discard;
  t.x = max(t.x, 0.0); // camera may be inside the volume

  vec3 dtv = 1.0 / (u_dims * abs(dir) + 1e-6);
  float dt = min(dtv.x, min(dtv.y, dtv.z)) / u_quality;
  float tt = t.x + dt * ign(gl_FragCoord.xy);

  if (u_mode == 0) {
    // ---- MIP: must traverse the FULL ray (no early exit), then refine.
    float maxVal = 0.0;
    float maxT = -1.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (tt >= t.y) break;
      float w = windowed(origin + tt * dir);
      if (w > maxVal) {
        maxVal = w;
        maxT = tt;
      }
      tt += dt;
    }
    if (maxT >= 0.0) {
      float t0 = maxT - 0.5 * dt;
      for (int j = 0; j < 8; j++) {
        maxVal = max(maxVal, windowed(origin + (t0 + float(j) * dt * 0.125) * dir));
      }
    }
    fragColor = vec4(lut(maxVal).rgb * maxVal, maxVal); // premultiplied
  } else if (u_mode == 1) {
    // ---- DVR: front-to-back premultiplied compositing, early termination.
    vec4 acc = vec4(0.0);
    for (int i = 0; i < MAX_STEPS; i++) {
      if (tt >= t.y) break;
      float w = windowed(origin + tt * dir);
      if (w > 0.003) {
        vec4 c = lut(w);
        // Opacity correction keeps appearance stable across step sizes.
        float a = 1.0 - pow(1.0 - c.a * u_opacity, 1.0 / u_quality);
        acc.rgb += (1.0 - acc.a) * a * c.rgb;
        acc.a += (1.0 - acc.a) * a;
        if (acc.a >= 0.95) break;
      }
      tt += dt;
    }
    fragColor = acc;
  } else {
    // ---- ISO: threshold crossing + half-step-back refinement + Blinn-Phong.
    float hit = -1.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (tt >= t.y) break;
      if (windowed(origin + tt * dir) >= u_isoThreshold) {
        hit = tt;
        break;
      }
      tt += dt;
    }
    if (hit < 0.0) discard;
    float t0 = max(hit - dt, t.x);
    for (int j = 0; j < 8; j++) {
      float tj = t0 + float(j) * dt * 0.125;
      if (windowed(origin + tj * dir) >= u_isoThreshold) {
        hit = tj;
        break;
      }
    }
    vec3 p = origin + hit * dir;
    vec3 N = gradientAt(p);
    vec3 V = -dir;
    if (dot(N, V) < 0.0) N = -N; // flip toward viewer
    vec3 L = V;                  // headlight
    vec3 H = normalize(L + V);
    float diff = clamp(dot(N, L), 0.0, 1.0);
    float spec = pow(max(dot(N, H), 0.0), 40.0);
    vec3 base = lut(u_isoThreshold).rgb;
    vec3 shaded = base * (0.25 + 0.65 * diff) + vec3(0.3) * spec;
    fragColor = vec4(shaded, 1.0);
  }

  if (fragColor.a < 0.02) discard;
}
