/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store';
import * as THREE from 'three';
import { useRef, useMemo, useEffect } from 'react';

export function Effects() {
  const lasers = useGameStore(state => state.lasers);
  const particles = useGameStore(state => state.particles);

  return (
    <>
      {lasers.map(laser => (
        <Laser key={laser.id} start={laser.start} end={laser.end} color={laser.color} />
      ))}
      {particles.map(p => (
        <ParticleBurst key={p.id} position={p.position} color={p.color} />
      ))}
    </>
  );
}

function Laser({ start, end, color }: { start: [number, number, number], end: [number, number, number], color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  
  const { position, length, e } = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const length = s.distanceTo(e);
    const position = s.clone().lerp(e, 0.5);
    
    return { position, length, e };
  }, [start, end]);

  useEffect(() => {
    if (ref.current) {
      ref.current.lookAt(e);
    }
  }, [e]);

  useFrame((_, delta) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, mat.opacity - delta * 4);
    }
  });

  return (
    <mesh ref={ref} position={position}>
      <boxGeometry args={[0.08, 0.08, length]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={1} />
    </mesh>
  );
}

function ParticleBurst({ position, color }: { position: [number, number, number], color: string }) {
  const group = useRef<THREE.Group>(null);
  
  const particles = useMemo(() => {
    return Array.from({ length: 15 }).map(() => ({
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      )
    }));
  }, []);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.children.forEach((child, i) => {
        child.position.addScaledVector(particles[i].velocity, delta);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - delta * 3);
        child.scale.setScalar(Math.max(0.001, child.scale.x - delta * 2));
      });
    }
  });

  return (
    <group ref={group} position={position}>
      {particles.map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshBasicMaterial color={color} transparent opacity={1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
