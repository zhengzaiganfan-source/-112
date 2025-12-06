import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VaseProps, VaseShapeType, RepairStage } from '../types';

// --- SHAPE GENERATION UTILS ---
const getVaseCurve = (type: VaseShapeType) => {
    let points: THREE.Vector2[] = [];
    switch (type) {
        case 'meiping': // Plum Vase
            points = [
                new THREE.Vector2(0.01, -4.8), new THREE.Vector2(1.4, -4.8), new THREE.Vector2(1.8, -4.5),
                new THREE.Vector2(2.2, -3.5), new THREE.Vector2(3.0, -1.5), new THREE.Vector2(3.6, 0.5),
                new THREE.Vector2(3.7, 1.8), new THREE.Vector2(3.0, 3.0), new THREE.Vector2(1.6, 4.0),
                new THREE.Vector2(1.3, 4.6), new THREE.Vector2(1.5, 4.8)
            ];
            break;
        case 'yuhuchun': // Pear Vase
            points = [
                new THREE.Vector2(0.01, -4.8), new THREE.Vector2(1.6, -4.8), new THREE.Vector2(2.0, -4.0),
                new THREE.Vector2(3.2, -2.5), new THREE.Vector2(3.5, -1.0), new THREE.Vector2(3.0, 1.0),
                new THREE.Vector2(1.5, 2.5), new THREE.Vector2(1.2, 3.5), new THREE.Vector2(2.0, 4.8)
            ];
            break;
        case 'tianqiuping': // Celestial Sphere
            points = [
                new THREE.Vector2(0.01, -4.8), new THREE.Vector2(1.5, -4.8), new THREE.Vector2(2.5, -4.0),
                new THREE.Vector2(3.5, -2.5), new THREE.Vector2(3.5, -0.5), new THREE.Vector2(2.5, 1.5),
                new THREE.Vector2(1.2, 2.0), new THREE.Vector2(1.2, 4.8)
            ];
            break;
        case 'hulu': // Gourd
            points = [
                new THREE.Vector2(0.01, -4.8), new THREE.Vector2(1.5, -4.8), new THREE.Vector2(2.8, -3.0),
                new THREE.Vector2(2.8, -1.5), new THREE.Vector2(1.5, 0.0), new THREE.Vector2(2.2, 1.5),
                new THREE.Vector2(2.0, 3.0), new THREE.Vector2(0.8, 4.0), new THREE.Vector2(0.8, 4.8)
            ];
            break;
        case 'guanyin': // Guanyin
            points = [
                new THREE.Vector2(0.01, -4.8), new THREE.Vector2(1.8, -4.8), new THREE.Vector2(1.6, -4.0),
                new THREE.Vector2(2.0, -2.0), new THREE.Vector2(2.8, 0.0), new THREE.Vector2(3.0, 1.5),
                new THREE.Vector2(2.5, 3.0), new THREE.Vector2(1.8, 4.0), new THREE.Vector2(2.0, 4.8)
            ];
            break;
        case 'bangchui': // Rouleau
            points = [
                new THREE.Vector2(0.01, -4.8), new THREE.Vector2(1.8, -4.8), new THREE.Vector2(1.8, 2.5),
                new THREE.Vector2(1.8, 3.5), new THREE.Vector2(1.5, 4.0), new THREE.Vector2(1.5, 4.6),
                new THREE.Vector2(1.8, 4.8)
            ];
            break;
        default: break;
    }
    return new THREE.SplineCurve(points);
};

// --- SHADERS ---

const vertexShader = `
  uniform float uTime;
  uniform float uAssemblyProgress; 
  uniform float uExplodeForce;
  uniform float uPixelRatio;
  
  uniform float uBlueprintMix; 
  uniform float uCrackProgress; 
  uniform float uDustLevel;

  attribute vec3 aRandomPos;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aIsPattern; 

  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vPos;
  varying vec3 vNormal; 
  varying float vIsPattern;
  varying float vRandom; 
  varying vec3 vViewPosition;

  void main() {
    vIsPattern = aIsPattern;
    vRandom = fract(sin(dot(aRandomPos.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vNormal = normal;

    vec3 stablePos = position;
    vec3 scatteredPos = aRandomPos * uExplodeForce; 

    float t = smoothstep(0.0, 1.0, uAssemblyProgress);
    
    // Vortex effect
    float angle = atan(stablePos.x, stablePos.z);
    float radius = length(stablePos.xz);
    float spiral = (1.0 - t) * 5.0;
    
    vec3 vortexPos;
    vortexPos.x = radius * sin(angle + spiral);
    vortexPos.z = radius * cos(angle + spiral);
    vortexPos.y = stablePos.y + (1.0 - t) * 10.0;

    vec3 finalPos = mix(scatteredPos, stablePos, t);

    // CRACK DISPLACEMENT
    // Particles float slightly off surface when not repaired
    if (uCrackProgress < 0.95 && t > 0.9) {
        float crackNoise = sin(stablePos.y * 10.0 + stablePos.x * 10.0 + uTime);
        if (crackNoise > 0.0) {
             finalPos += normal * 0.15 * (1.0 - uCrackProgress); 
        }
    }

    vPos = finalPos;
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    vViewPosition = -mvPosition.xyz;
    
    // DYNAMIC SIZE
    float baseSize = aSize;
    
    if (uBlueprintMix > 0.5) {
        // Uniform size for blueprint grid
        baseSize = 1.0; 
    } else {
        // Grow particles as we repair cracks to simulate "filling in"
        // INCREASED DENSITY: Multiplier changed from 1.5 to 4.5 to close gaps and look solid
        baseSize = aSize * (1.0 + uCrackProgress * 4.5);
    }
    
    gl_PointSize = (baseSize * uPixelRatio * 1.8) / -mvPosition.z;
    
    vAlpha = 0.6 + 0.4 * t;
    // Solidify alpha when repaired to enhance solid object feel
    vAlpha = mix(vAlpha, 1.0, uCrackProgress);

    vColor = aColor;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uDustLevel; 
  uniform float uBlueprintMix; 
  uniform float uColorProgress; 
  uniform float uCrackProgress;

  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying float vIsPattern;
  varying float vRandom;
  varying vec3 vViewPosition;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    
    if (dist > 0.5) discard;

    vec3 finalColor = vColor;
    float finalAlpha = vAlpha;

    // === 1. BLUEPRINT MODE ===
    if (uBlueprintMix > 0.0) {
        // Standard Grid
        float gridY = step(0.9, fract(vPos.y * 1.5));
        float gridX = step(0.9, fract(atan(vPos.x, vPos.z) * 10.0));
        float isGrid = max(gridX, gridY);

        // Simple Scan Beam
        float scanPos = sin(uTime * 1.5) * 5.0;
        float beamWidth = 0.6;
        float beamDist = abs(vPos.y - scanPos);
        float beam = smoothstep(beamWidth, 0.0, beamDist);
        
        vec3 gridColor = vec3(0.0, 0.6, 1.0); // Standard Blue
        vec3 beamColor = vec3(1.0); // White beam
        
        // Base color is faint blue
        finalColor = mix(vColor, gridColor, isGrid);
        // Add beam brightness
        finalColor += beamColor * beam * 0.8;
        
        // Opacity
        float baseAlpha = 0.15;
        finalAlpha = (baseAlpha + isGrid * 0.5 + beam * 0.6) * uBlueprintMix;
    } 
    else {
        // === 2. PORCELAIN RENDER ===
        
        // A. Pattern Coloring (Blue & White)
        if (vIsPattern > 0.5) {
            vec3 paleBlue = vec3(0.8, 0.85, 0.9);
            vec3 deepBlue = vec3(0.1, 0.2, 0.7); 
            // Simulate hand-painted pigment density
            vec3 pigment = mix(deepBlue, deepBlue * 0.8, vRandom * 0.3);
            
            // Swipe to color
            finalColor = mix(paleBlue, pigment, uColorProgress);
        }

        // B. Dust Layer (Cleaning Stage)
        // More visible, darker, covers the pattern
        if (uDustLevel > 0.0) {
            // High frequency noise for dust texture
            float noise = fract(sin(dot(vPos.xy, vec2(12.9898, 78.233))) * 43758.5453);
            
            vec3 dustColor = vec3(0.35, 0.32, 0.28); // Darker, earthier dust
            
            // Dust mask: Reveals from top/randomly based on noise as dust level drops
            float dirtThreshold = 1.0 - uDustLevel;
            float dustMask = smoothstep(dirtThreshold, dirtThreshold + 0.2, noise * 0.5 + 0.5);
            
            // Apply dust
            finalColor = mix(finalColor, dustColor, dustMask);
        }

        // C. Specular Highlight (Glaze)
        // Only shiny if repaired and CLEAN
        if (uCrackProgress > 0.2) {
            vec3 viewDir = normalize(vViewPosition);
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
            vec3 halfVector = normalize(lightDir + viewDir);
            
            float NdotH = max(0.0, dot(normal, halfVector));
            
            // SHARPER SPECULAR: 128.0 for glassy wet look
            float specular = pow(NdotH, 128.0); 
            
            // Dust kills specular reflection (Matte dust vs Shiny glaze)
            // If dust level is high, shine is 0.
            float shinePower = (1.0 - uDustLevel) * uCrackProgress;
            
            // INCREASED INTENSITY: * 1.5 to make it pop
            finalColor += vec3(1.0) * specular * shinePower * 1.5;
            
            // Rim light
            float rim = 1.0 - max(0.0, dot(viewDir, normal));
            rim = pow(rim, 3.0);
            finalColor += vec3(0.5, 0.7, 1.0) * rim * 0.3 * shinePower;
        }
    }

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

const VaseParticles: React.FC<VaseProps> = ({ controlState, shapeType = 'meiping', isMenuMode = false, menuIndex = 0 }) => {
  const pointsRef = useRef<THREE.Points>(null);
  
  const uniforms = useRef({
    uTime: { value: 0 },
    uAssemblyProgress: { value: 1 },
    uExplodeForce: { value: 1.0 },
    uPixelRatio: { value: window.devicePixelRatio },
    uBlueprintMix: { value: 0 },
    uDustLevel: { value: 0 },
    uCrackProgress: { value: 1 },
    uColorProgress: { value: 1 },
  });

  const { positions, randomPositions, colors, sizes, isPattern } = useMemo(() => {
    const curve = getVaseCurve(shapeType as VaseShapeType);
    const particleCount = isMenuMode ? 8000 : 100000; 
    
    const posArray = new Float32Array(particleCount * 3);
    const randPosArray = new Float32Array(particleCount * 3);
    const colArray = new Float32Array(particleCount * 3);
    const sizeArray = new Float32Array(particleCount);
    const isPatternArray = new Float32Array(particleCount);

    const whiteColor = new THREE.Color('#f5f7fa'); 

    for (let i = 0; i < particleCount; i++) {
        const t = Math.random();
        const point = curve.getPointAt(t); 
        const radius = point.x;
        const y = point.y;
        
        const angle = Math.random() * Math.PI * 2;
        const finalRadius = radius + (Math.random() - 0.5) * 0.02;

        const x = Math.cos(angle) * finalRadius;
        const z = Math.sin(angle) * finalRadius;

        posArray[i * 3] = x;
        posArray[i * 3 + 1] = y;
        posArray[i * 3 + 2] = z;

        const r = 12.0 * Math.cbrt(Math.random()); 
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        randPosArray[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        randPosArray[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        randPosArray[i * 3 + 2] = r * Math.cos(phi);

        let isBlue = false;
        
        // QINGHUA PATTERN LOGIC
        if (y > 4.2 || y < -4.2) isBlue = true; // Rims
        if (y > -3.5 && y < 2.5) { // Body
             const freq = 3.0; 
             const u = angle * freq;
             const v = y * 1.5;
             const vineWave = Math.sin(u + Math.cos(v * 2.0));
             if (Math.abs(vineWave) < 0.15) isBlue = true;
             const flowerGrid = Math.sin(u * 2.0) * Math.sin(v * 2.0);
             if (flowerGrid > 0.6) isBlue = true;
             const leafNoise = Math.sin(u * 5.0 + v * 3.0);
             if (leafNoise > 0.8 && Math.abs(y) < 2.0) isBlue = true;
        }
        if (y > 2.8 && y < 4.2) { // Neck
             const leafSpike = Math.sin(angle * 12.0);
             if (leafSpike > 0.0 && y < 3.0 + leafSpike * 0.8) isBlue = true;
        }
        if (y < -3.5 && y > -4.5) { // Foot
             const wave = Math.sin(angle * 8.0 + y * 10.0);
             if (wave > 0.0) isBlue = true;
        }

        const color = isBlue ? new THREE.Color('#1a3c8e') : whiteColor; 
        colArray[i * 3] = color.r;
        colArray[i * 3 + 1] = color.g;
        colArray[i * 3 + 2] = color.b;
        
        isPatternArray[i] = isBlue ? 1.0 : 0.0;
        sizeArray[i] = isBlue ? (Math.random() * 1.0 + 0.8) : (Math.random() * 1.5 + 1.2);
    }

    return {
        positions: posArray,
        randomPositions: randPosArray,
        colors: colArray,
        sizes: sizeArray,
        isPattern: isPatternArray
    };
  }, [shapeType, isMenuMode]);

  useFrame((state) => {
    if (pointsRef.current) {
        uniforms.current.uTime.value = state.clock.elapsedTime;
        
        if (isMenuMode) {
            pointsRef.current.rotation.y += 0.005;
            uniforms.current.uAssemblyProgress.value = 1.0;
            uniforms.current.uColorProgress.value = 1.0;
            uniforms.current.uCrackProgress.value = 1.0;
            uniforms.current.uDustLevel.value = 0.0;
            uniforms.current.uBlueprintMix.value = 0.0;
            
            const isSelected = controlState.selectedVaseIndex === menuIndex;
            const targetScale = isSelected ? 1.3 : 0.9;
            pointsRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
        } else {
            pointsRef.current.rotation.y = controlState.rotationX * -0.5;
            pointsRef.current.rotation.x = controlState.rotationY * 0.2;

            uniforms.current.uAssemblyProgress.value = controlState.assemblyProgress;
            uniforms.current.uBlueprintMix.value = controlState.stage === RepairStage.BLUEPRINT ? controlState.blueprintOpacity : 0.0;
            
            // DUST STATE MACHINE
            let dust = 1.0;
            if (controlState.stage === RepairStage.CLEANING) {
                dust = 1.0 - controlState.cleanliness;
            } else if (controlState.stage > RepairStage.CLEANING) {
                dust = 0.0;
            } else if (controlState.stage < RepairStage.BLUEPRINT) {
                dust = 0.0;
            }
            uniforms.current.uDustLevel.value = dust;

            // CRACK STATE MACHINE
            let crack = 0.0;
            if (controlState.stage === RepairStage.CRACK_FIX) {
                crack = controlState.crackRepairProgress;
            } else if (controlState.stage > RepairStage.CRACK_FIX) {
                crack = 1.0;
            }
            uniforms.current.uCrackProgress.value = crack;

            // COLOR STATE MACHINE
            let col = 0.2; 
            if (controlState.stage === RepairStage.COLORING) {
                col = 0.2 + controlState.coloringProgress * 0.8;
            } else if (controlState.stage > RepairStage.COLORING) {
                col = 1.0;
            }
            uniforms.current.uColorProgress.value = col;
        }
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aRandomPos" count={randomPositions.length / 3} array={randomPositions} itemSize={3} />
        <bufferAttribute attach="attributes-aColor" count={colors.length / 3} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-aSize" count={sizes.length} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-aIsPattern" count={isPattern.length} array={isPattern} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        transparent={true}
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
};

export default VaseParticles;