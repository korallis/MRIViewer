// Box geometry is [-0.5,0.5]^3 in local space; texture space = local + 0.5.
// The mesh matrix maps local box coords → world (RAS mm), so marching in
// texture space needs zero per-step transforms (PLAN §7.2).
flat out vec3 v_eyeTex;
out vec3 v_posTex;
out vec3 v_orthoDirTex;

void main() {
  v_posTex = position + 0.5;
  mat4 invModel = inverse(modelMatrix);
  v_eyeTex = (invModel * vec4(cameraPosition, 1.0)).xyz + 0.5;
  // Camera forward in world = -(row 2 of viewMatrix rotation).
  vec3 fwdWorld = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  v_orthoDirTex = (invModel * vec4(fwdWorld, 0.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
