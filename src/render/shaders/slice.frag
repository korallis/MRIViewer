// MPR slice: samples the SAME 3D texture as the raymarcher at a fixed
// coordinate along one axis (PLAN §7.4). Optional thick-slab MIP.
precision highp float;
precision highp sampler3D;

uniform sampler3D u_data;
uniform sampler2D u_lut;
uniform vec2 u_clim;
uniform float u_invert;
uniform int u_uAxis;
uniform float u_uSign;
uniform int u_vAxis;
uniform float u_vSign;
uniform int u_sliceAxis;
uniform float u_slice;      // [0,1] along the slice axis
uniform float u_slabHalf;   // half slab thickness in texture units (0 = single slice)
uniform float u_dimSlice;   // voxel count along the slice axis

in vec2 vUv;
out vec4 fragColor;

float windowed(vec3 p) {
  float v = texture(u_data, p).r;
  float w = clamp((v - u_clim.x) / (u_clim.y - u_clim.x), 0.0, 1.0);
  return mix(w, 1.0 - w, u_invert);
}

void main() {
  vec3 tc = vec3(0.0);
  tc[u_uAxis] = u_uSign > 0.0 ? vUv.x : 1.0 - vUv.x;
  tc[u_vAxis] = u_vSign > 0.0 ? vUv.y : 1.0 - vUv.y;
  tc[u_sliceAxis] = u_slice;

  float w;
  if (u_slabHalf <= 0.0) {
    w = windowed(tc);
  } else {
    // Thick-slab MIP across up to 16 samples.
    w = 0.0;
    float step = max(u_slabHalf / 8.0, 1.0 / max(u_dimSlice, 1.0));
    for (float o = -u_slabHalf; o <= u_slabHalf; o += step) {
      vec3 p = tc;
      p[u_sliceAxis] = clamp(u_slice + o, 0.0, 1.0);
      w = max(w, windowed(p));
    }
  }
  fragColor = vec4(texture(u_lut, vec2((w * 255.0 + 0.5) / 256.0, 0.5)).rgb, 1.0);
}
