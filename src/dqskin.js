// Dual-quaternion skinning (the user's call, 2026-11-11: arms that bend at their joints, not like a rubber tube). Linear blend
// skinning averages each point's bones' matrices: where two bones turn apart (the elbow bent, the arm raised from the shoulder,
// the forearm twisted) the average of two rotations is no rotation at all but a squeeze, and the joint loses its volume, the
// elbow pinching flat and the shoulder collapsing. Dual quaternions blend the bones' rigid motions as motions: the joint turns
// round itself and keeps its thickness.
//
// A material is patched (onBeforeCompile) to skin so: each of its point's four bone matrices made a unit dual quaternion (its
// rotation as a quaternion, its translation as the dual part), the four signed to one hemisphere and blended by the weights,
// normalised, and the point and its normal moved by the blend. The bones' matrices must be rigid (rotation and translation, no
// scale): the fighters' are (rig.js frames), but for a severed part's, shrunk into its joint, whose points are skinned linearly
// as before (dqRigid). Shadows, drawn with the plain depth material, stay linear.

/** The shader's helpers: a bone matrix's dual quaternion, and the blended motion applied to a point and to a direction. */
const DQ_HELPERS = `
vec4 dqRotation( mat4 m ) {
	float trace = m[0][0] + m[1][1] + m[2][2];
	if ( trace > 0.0 ) {
		float s = sqrt( trace + 1.0 ) * 2.0;
		return vec4( ( m[1][2] - m[2][1] ) / s, ( m[2][0] - m[0][2] ) / s, ( m[0][1] - m[1][0] ) / s, 0.25 * s );
	}
	if ( m[0][0] > m[1][1] && m[0][0] > m[2][2] ) {
		float s = sqrt( 1.0 + m[0][0] - m[1][1] - m[2][2] ) * 2.0;
		return vec4( 0.25 * s, ( m[1][0] + m[0][1] ) / s, ( m[2][0] + m[0][2] ) / s, ( m[1][2] - m[2][1] ) / s );
	}
	if ( m[1][1] > m[2][2] ) {
		float s = sqrt( 1.0 + m[1][1] - m[0][0] - m[2][2] ) * 2.0;
		return vec4( ( m[1][0] + m[0][1] ) / s, 0.25 * s, ( m[2][1] + m[1][2] ) / s, ( m[2][0] - m[0][2] ) / s );
	}
	float s = sqrt( 1.0 + m[2][2] - m[0][0] - m[1][1] ) * 2.0;
	return vec4( ( m[2][0] + m[0][2] ) / s, ( m[2][1] + m[1][2] ) / s, 0.25 * s, ( m[0][1] - m[1][0] ) / s );
}
vec4 dqTranslation( mat4 m, vec4 q ) {
	vec3 t = m[3].xyz;
	return 0.5 * vec4( t * q.w + cross( t, q.xyz ), -dot( t, q.xyz ) );
}
void dqBlend( mat4 a, mat4 b, mat4 c, mat4 d, vec4 w, out vec4 real, out vec4 dual ) {
	vec4 qa = dqRotation( a ), qb = dqRotation( b ), qc = dqRotation( c ), qd = dqRotation( d );
	float sb = dot( qa, qb ) < 0.0 ? -1.0 : 1.0;
	float sc = dot( qa, qc ) < 0.0 ? -1.0 : 1.0;
	float sd = dot( qa, qd ) < 0.0 ? -1.0 : 1.0;
	real = w.x * qa + w.y * sb * qb + w.z * sc * qc + w.w * sd * qd;
	dual = w.x * dqTranslation( a, qa ) + w.y * sb * dqTranslation( b, qb ) + w.z * sc * dqTranslation( c, qc ) + w.w * sd * dqTranslation( d, qd );
	float len = length( real );
	real /= len;
	dual /= len;
}
// Whether all four of a point's bones are rigid (unit scale): a bone whose part was cut off is shrunk into its joint
// (render.js severedBones: scaled to 1e-4), which a dual quaternion cannot carry, so such a point is skinned linearly.
bool dqRigid( mat4 a, mat4 b, mat4 c, mat4 d, vec4 w ) {
	vec4 scale = vec4( length( a[0].xyz ), length( b[0].xyz ), length( c[0].xyz ), length( d[0].xyz ) );
	return all( lessThan( abs( scale - 1.0 ) * step( 1e-6, w ), vec4( 0.01 ) ) );
}
vec3 dqRotate( vec4 r, vec3 v ) {
	return v + 2.0 * cross( r.xyz, cross( r.xyz, v ) + r.w * v );
}
vec3 dqMove( vec4 r, vec4 d, vec3 p ) {
	return dqRotate( r, p ) + 2.0 * ( r.w * d.xyz - d.w * r.xyz + cross( r.xyz, d.xyz ) );
}
`;

// The linear chunks' places taken: the normal (and tangent) turned by the blend's rotation, the point moved by its motion; both
// in the bind matrix's space, as three's own skinning is.
const DQ_NORMAL = `
#ifdef USE_SKINNING
	if ( dqRigid( boneMatX, boneMatY, boneMatZ, boneMatW, skinWeight ) ) {
		vec4 dqReal, dqDual;
		dqBlend( boneMatX, boneMatY, boneMatZ, boneMatW, skinWeight, dqReal, dqDual );
		objectNormal = ( bindMatrixInverse * vec4( dqRotate( dqReal, ( bindMatrix * vec4( objectNormal, 0.0 ) ).xyz ), 0.0 ) ).xyz;
		#ifdef USE_TANGENT
			objectTangent = ( bindMatrixInverse * vec4( dqRotate( dqReal, ( bindMatrix * vec4( objectTangent, 0.0 ) ).xyz ), 0.0 ) ).xyz;
		#endif
	} else {
		mat4 skinMatrix = bindMatrixInverse * ( skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW ) * bindMatrix;
		objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
		#ifdef USE_TANGENT
			objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
		#endif
	}
#endif
`;
const DQ_POSITION = `
#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	if ( dqRigid( boneMatX, boneMatY, boneMatZ, boneMatW, skinWeight ) ) {
		vec4 dqPointReal, dqPointDual;
		dqBlend( boneMatX, boneMatY, boneMatZ, boneMatW, skinWeight, dqPointReal, dqPointDual );
		transformed = ( bindMatrixInverse * vec4( dqMove( dqPointReal, dqPointDual, skinVertex.xyz ), 1.0 ) ).xyz;
	} else {
		vec4 skinned = boneMatX * skinVertex * skinWeight.x + boneMatY * skinVertex * skinWeight.y + boneMatZ * skinVertex * skinWeight.z + boneMatW * skinVertex * skinWeight.w;
		transformed = ( bindMatrixInverse * skinned ).xyz;
	}
#endif
`;

/** Patch a skinned material to skin by dual quaternions (once; its other patches kept, run first). Returns the material. */
export function dualQuaternionSkinning(material) {
  if (!material || material.onBeforeCompile?.dualQuaternion) return material;
  const previous = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey?.() ?? '';
  const patched = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', `#include <skinning_pars_vertex>\n#ifdef USE_SKINNING\n${DQ_HELPERS}\n#endif`)
      .replace('#include <skinnormal_vertex>', DQ_NORMAL)
      .replace('#include <skinning_vertex>', DQ_POSITION);
  };
  patched.dualQuaternion = true;
  patched.previous = previous;
  material.onBeforeCompile = patched;
  // (three caches programs by onBeforeCompile's source text: keyed apart from the linear.)
  material.customProgramCacheKey = () => `${baseKey}|dualQuaternion`;
  material.needsUpdate = true;
  return material;
}
