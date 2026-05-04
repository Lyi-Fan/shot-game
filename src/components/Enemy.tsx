/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { Text, Outlines } from '@react-three/drei';
import { sfx } from '../audio';

const ENEMY_SPEED = 12;
const CHASE_DIST = 50; 
const SHOOT_DIST = 100;
const SHOOT_COOLDOWN = 200; // Match player shoot cooldown

export function Enemy({ data }: { data: EnemyData }) {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);

  const lastShootTime = useRef(0);
  const lastFootstepTime = useRef(0);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);
  const state = useRef<'patrol' | 'chase'>('patrol');

  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  // Initialize patrol target
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 10,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 10
    );
  }, [data.position]);

  const [hitFlash, setHitFlash] = useState(0);
  
  useEffect(() => {
    if (data.health < 5 && data.health > 0) {
      setHitFlash(Date.now());
      sfx.playDamage(); // Also play a sound here if we want? The hit might be played by player though.
    }
  }, [data.health]);

  useFrame((state_fiber) => {
    if (hitFlash && Date.now() - hitFlash < 150) {
      if (coreRef.current) {
        (coreRef.current.material as THREE.MeshStandardMaterial).color.set('#ffffff');
        (coreRef.current.material as THREE.MeshStandardMaterial).emissive.set('#ffffff');
      }
    } else {
      if (coreRef.current && data.state === 'active') {
        (coreRef.current.material as THREE.MeshStandardMaterial).color.set('#718096'); // stone-500
        (coreRef.current.material as THREE.MeshStandardMaterial).emissive.set('#1a202c'); // off
      }
    }

    if (!body.current || gameState !== 'playing' || data.state === 'disabled') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      }
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    const enemyData = useGameStore.getState().enemies.find(e => e.id === data.id);
    if (enemyData) {
      enemyData.position = [currentPos.x, currentPos.y, currentPos.z];
    }
    
    let closestTargetPos: THREE.Vector3 | null = null;
    let closestDist = CHASE_DIST;

    // Check player
    if (playerState === 'active') {
      const playerPos = camera.position.clone();
      playerPos.y = pos.y; // Ignore height difference for distance
      const distToPlayer = currentPos.distanceTo(playerPos);
      if (distToPlayer < closestDist && distToPlayer <= CHASE_DIST) {
        closestDist = distToPlayer;
        closestTargetPos = playerPos;
      }
    }

    // Check other enemies
    const allEnemies = useGameStore.getState().enemies;
    allEnemies.forEach(e => {
      if (e.id !== data.id && e.state === 'active') {
        const ePos = new THREE.Vector3(e.position[0], pos.y, e.position[2]);
        const distToEnemy = currentPos.distanceTo(ePos);
        if (distToEnemy < closestDist && distToEnemy <= CHASE_DIST) {
          closestDist = distToEnemy;
          closestTargetPos = ePos;
        }
      }
    });

    // AI Logic
    if (closestTargetPos) {
      state.current = 'chase';
    } else if (state.current === 'chase') {
      state.current = 'patrol';
      patrolTarget.current.set(
        currentPos.x + (Math.random() - 0.5) * 40,
        currentPos.y,
        currentPos.z + (Math.random() - 0.5) * 40
      );
      lastPatrolChange.current = Date.now();
    }

    const direction = new THREE.Vector3();

    if (state.current === 'chase' && closestTargetPos) {
      // Check line of sight first!
      const idealRayDir = new THREE.Vector3().subVectors(closestTargetPos, currentPos).normalize();
      
      // Start slightly in front of the bot to avoid hitting self
      const startPos = new THREE.Vector3(currentPos.x, currentPos.y + 1.2, currentPos.z);
      const rayStartPos = startPos.clone().add(idealRayDir.clone().multiplyScalar(1.5));
      const losRay = new rapier.Ray(rayStartPos, idealRayDir);
      const losHit = world.castRay(losRay, SHOOT_DIST, false);
      
      let hasLineOfSight = false;
      if (losHit) {
        const rb = losHit.collider.parent();
        if (rb && rb.userData) {
          const hitName = (rb.userData as { name?: string }).name;
          if (hitName !== data.id && (hitName === 'player' || hitName?.startsWith('bot-'))) {
             hasLineOfSight = true;
          }
        }
      }

      // Movement Direction
      direction.copy(idealRayDir);

      // Obstacle avoidance: cast short ray forward (but slightly left/right)
      if (!hasLineOfSight) {
          const moveRay = new rapier.Ray(rayStartPos, direction);
          const moveHit = world.castRay(moveRay, 4, false);
          if (moveHit) {
              const hitName = (moveHit.collider.parent()?.userData as { name?: string })?.name;
              if (hitName !== 'player' && !hitName?.startsWith('bot-')) {
                  // We are hitting a wall. Steer left or right!
                  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); // 90 degree turn
              }
          }
      }

      const now = Date.now();
      if (hasLineOfSight && closestDist < SHOOT_DIST && now - lastShootTime.current > SHOOT_COOLDOWN) {
        // Add random spread so they miss sometimes
        const spread = 0.15;
        const rayDir = idealRayDir.clone();
        rayDir.x += (Math.random() - 0.5) * spread;
          rayDir.y += (Math.random() - 0.5) * spread;
          rayDir.z += (Math.random() - 0.5) * spread;
          rayDir.normalize();
          
          const ray = new rapier.Ray(rayStartPos, rayDir);
          
          // solid=false ensures we don't hit the internal of the bot's own collider
          const hit = world.castRay(ray, SHOOT_DIST, false);
          
          sfx.playLaser();

          if (hit) {
            const collider = hit.collider;
            const rb = collider.parent();
            if (rb && rb.userData) {
              const userData = rb.userData as { name?: string };
              if (userData.name === 'player') {
                // Hit player!
                hitPlayer();
                addParticles([camera.position.x, camera.position.y, camera.position.z], '#ff0000');
                addLaser(
                  [rayStartPos.x, rayStartPos.y, rayStartPos.z],
                  [camera.position.x, camera.position.y, camera.position.z],
                  '#ff0000'
                );
                lastShootTime.current = now;
              } else if (userData.name?.startsWith('bot-')) {
                // Hit another enemy!
                useGameStore.getState().hitEnemy(userData.name);
                const hitPoint = ray.pointAt(hit.timeOfImpact);
                addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                addLaser(
                  [rayStartPos.x, rayStartPos.y, rayStartPos.z],
                  [hitPoint.x, hitPoint.y, hitPoint.z],
                  '#ff0000'
                );
                lastShootTime.current = now;
              } else {
                // Hit wall or obstacle
                const hitPoint = ray.pointAt(hit.timeOfImpact);
                addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                addLaser(
                  [rayStartPos.x, rayStartPos.y, rayStartPos.z],
                  [hitPoint.x, hitPoint.y, hitPoint.z],
                  '#ff0000'
                );
                lastShootTime.current = now;
              }
            } else {
              // Hit wall or obstacle
              const hitPoint = ray.pointAt(hit.timeOfImpact);
              addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
              addLaser(
                [rayStartPos.x, rayStartPos.y, rayStartPos.z],
                [hitPoint.x, hitPoint.y, hitPoint.z],
                '#ff0000'
              );
              lastShootTime.current = now;
            }
          } else {
             // Missed everything (shot into sky)
             const endPos = new THREE.Vector3().copy(rayStartPos).add(rayDir.multiplyScalar(SHOOT_DIST));
             addLaser(
                [rayStartPos.x, rayStartPos.y, rayStartPos.z],
                [endPos.x, endPos.y, endPos.z],
                '#ff0000'
             );
             lastShootTime.current = now;
          }
        }
    } else {
      // Patrol
      const now = Date.now();
      // Change target if reached or if stuck for 4 seconds
      if (currentPos.distanceTo(patrolTarget.current) < 2 || now - lastPatrolChange.current > 4000) {
        patrolTarget.current.set(
          currentPos.x + (Math.random() - 0.5) * 60,
          currentPos.y,
          currentPos.z + (Math.random() - 0.5) * 60
        );
        lastPatrolChange.current = now;
      }
      direction.subVectors(patrolTarget.current, currentPos).normalize();
    }

    // Apply movement
    const velocity = body.current.linvel();
    body.current.setLinvel({
      x: direction.x * ENEMY_SPEED,
      y: velocity.y,
      z: direction.z * ENEMY_SPEED
    }, true);
    
    // Play footsteps
    const nowMove = Date.now();
    if (direction.lengthSq() > 0.1 && nowMove - lastFootstepTime.current > 400 && data.state === 'active') {
      sfx.playFootstep(currentPos.x, currentPos.y, currentPos.z);
      lastFootstepTime.current = nowMove;
    }

    // Rotate to face direction
    if (groupRef.current && direction.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(direction.x, direction.z);
      // Simple lerp for rotation
      const currentRotation = groupRef.current.rotation.y;
      // Handle angle wrap-around
      let diff = targetRotation - currentRotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * 0.1;
      
      // Bobbing effect
      groupRef.current.position.y = Math.sin(state_fiber.clock.elapsedTime * 6 + (data.id.charCodeAt(4) || 0)) * 0.1;
      
      if (coreRef.current && data.state === 'active') {
        coreRef.current.rotation.y += 0.05;
        coreRef.current.rotation.z += 0.02;
      }
    }
  });

  const color = data.state === 'disabled' ? '#444' : '#ff0055';

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      type="dynamic"
      friction={0}
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      <CapsuleCollider args={[0.7, 0.5]} position={[0, 1.2, 0]} />
      <group ref={groupRef} position={[0, 0, 0]}>
        {/* Head */}
        <mesh castShadow position={[0, 1.8, 0]}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshStandardMaterial 
            color={data.state === 'disabled' ? '#222' : '#2a2a2a'} 
            roughness={0.4} 
          />
          {data.state === 'active' && <Outlines thickness={0.03} color="#00e5ff" />}
        </mesh>
        
        {/* Eye / Visor (used to be core ref for color) */}
        <mesh ref={coreRef} position={[0, 1.8, 0.36]}>
          <boxGeometry args={[0.5, 0.2, 0.05]} />
          <meshStandardMaterial 
            color={data.state === 'disabled' ? '#111' : '#ffffff'} 
            emissive={data.state === 'disabled' ? '#000' : '#00e5ff'}
            emissiveIntensity={data.state === 'active' ? 4 : 0}
          />
        </mesh>

        {/* Body */}
        <mesh castShadow position={[0, 1.05, 0]}>
          <boxGeometry args={[0.8, 0.8, 0.4]} />
          <meshStandardMaterial color={data.state === 'disabled' ? '#222' : '#1f1f1f'} roughness={0.5} />
          {data.state === 'active' && <Outlines thickness={0.03} color="#00e5ff" />}
        </mesh>

        {/* Arms */}
        <mesh castShadow position={[-0.55, 1.05, 0]}>
          <boxGeometry args={[0.25, 0.8, 0.25]} />
          <meshStandardMaterial color={data.state === 'disabled' ? '#222' : '#1a1a1a'} roughness={0.5} />
          {data.state === 'active' && <Outlines thickness={0.03} color="#00e5ff" />}
        </mesh>
        {/* Gun Arm */}
        <mesh castShadow position={[0.55, 1.05, 0.2]}>
          <boxGeometry args={[0.25, 0.3, 0.8]} />
          <meshStandardMaterial color={data.state === 'disabled' ? '#222' : '#111111'} roughness={0.5} />
          {data.state === 'active' && <Outlines thickness={0.03} color="#00e5ff" />}
        </mesh>

        {/* Gun Barrel Tip glowing */}
        <mesh position={[0.55, 1.05, 0.65]}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshBasicMaterial color={data.state === 'disabled' ? '#111' : '#00e5ff'} />
        </mesh>

        {/* Base/Legs (hovering block) */}
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[0.6, 0.5, 0.3]} />
          <meshStandardMaterial color={data.state === 'disabled' ? '#111' : '#222222'} roughness={0.9} />
          {data.state === 'active' && <Outlines thickness={0.03} color="#00e5ff" />}
        </mesh>

        {/* Username/Health Label */}
        <Text
          position={[0, 2.4, 0]}
          fontSize={0.25}
          color={data.state === 'active' ? '#fbbf24' : '#666666'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#000000"
        >
          {data.state === 'active' ? '▮'.repeat(Math.max(0, data.health)) + '▯'.repeat(Math.max(0, 5 - Math.max(0, data.health))) : 'BROKEN'}
        </Text>
      </group>
    </RigidBody>
  );
}
