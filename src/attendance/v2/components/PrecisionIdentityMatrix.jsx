import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Precision Identity Matrix - 3D Biometric Planetary System
 * High-fidelity WebGL background matching enterprise telemetry specification:
 * - Primary holographic wireframe planet (Icosahedron) with inner core (Octahedron)
 * - 3 Concentric multi-angle tilted scanning rings (TorusGeometry)
 * - Secondary orbiting sensor sphere on left
 * - 220-Node dynamic neural constellation field with distance-reactive connecting lines
 * - Interactive cursor parallax
 */
export const PrecisionIdentityMatrix = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let frameId;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // --- 1. Scene & Camera Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 0, 110);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0xf8f9ff, 1); // Clean light theme white
    container.appendChild(renderer.domElement);

    // --- 2. Ambient & Directional Point Lights for Light Scene ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const blueLight = new THREE.PointLight(0x006194, 2.5, 300);
    blueLight.position.set(-60, 40, 50);
    scene.add(blueLight);

    const cyanLight = new THREE.PointLight(0x0284c7, 2.0, 300);
    cyanLight.position.set(70, -30, 40);
    scene.add(cyanLight);

    // Group for all rotating 3D biometric geometry
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // --- 3. Primary Holographic Biometric Planet & Inner Core ---
    const planetPos = new THREE.Vector3(42, 2, -15);

    const faceGeo = new THREE.IcosahedronGeometry(28, 3);
    const faceWireMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.38
    });
    const faceMesh = new THREE.Mesh(faceGeo, faceWireMat);
    faceMesh.position.copy(planetPos);
    worldGroup.add(faceMesh);

    // Inner glowing biometric core
    const innerCoreGeo = new THREE.OctahedronGeometry(12, 2);
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0x007bb9,
      wireframe: true,
      transparent: true,
      opacity: 0.48
    });
    const innerCore = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    innerCore.position.copy(planetPos);
    worldGroup.add(innerCore);

    // --- 4. Concentric Biometric Scanning Reticle Rings in Blue ---
    const ringsGroup = new THREE.Group();
    ringsGroup.position.copy(planetPos);

    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x006194,
      wireframe: true,
      transparent: true,
      opacity: 0.65
    });
    const ring1Geo = new THREE.TorusGeometry(36, 0.4, 16, 80);
    const ring1 = new THREE.Mesh(ring1Geo, ringMat1);
    ringsGroup.add(ring1);

    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    });
    const ring2Geo = new THREE.TorusGeometry(42, 0.3, 16, 90);
    const ring2 = new THREE.Mesh(ring2Geo, ringMat2);
    ring2.rotation.x = Math.PI / 4;
    ringsGroup.add(ring2);

    const ringMat3 = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      wireframe: true,
      transparent: true,
      opacity: 0.50
    });
    const ring3Geo = new THREE.TorusGeometry(48, 0.25, 16, 100);
    const ring3 = new THREE.Mesh(ring3Geo, ringMat3);
    ring3.rotation.y = Math.PI / 3;
    ringsGroup.add(ring3);

    worldGroup.add(ringsGroup);

    // --- 5. Floating Secondary Sensor Rings on the Left Side ---
    const leftSensorGroup = new THREE.Group();
    leftSensorGroup.position.set(-58, -12, -20);

    const leftTorusGeo = new THREE.TorusGeometry(18, 0.35, 16, 60);
    const leftTorusMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, wireframe: true, transparent: true, opacity: 0.45 });
    const leftTorus = new THREE.Mesh(leftTorusGeo, leftTorusMat);

    const leftIcosaGeo = new THREE.IcosahedronGeometry(9, 1);
    const leftIcosaMat = new THREE.MeshBasicMaterial({ color: 0x007bb9, wireframe: true, transparent: true, opacity: 0.40 });
    const leftIcosa = new THREE.Mesh(leftIcosaGeo, leftIcosaMat);

    leftSensorGroup.add(leftTorus);
    leftSensorGroup.add(leftIcosa);
    worldGroup.add(leftSensorGroup);

    // --- 6. Dynamic Constellation Particle Field & Neural Lines ---
    const particleCount = 220;
    const particlePositions = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);
    const particleVelocities = new Float32Array(particleCount * 3);

    const spreadX = 260;
    const spreadY = 160;
    const spreadZ = 70;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const x = (Math.random() - 0.5) * spreadX;
      const y = (Math.random() - 0.5) * spreadY;
      const z = (Math.random() - 0.5) * spreadZ;

      particlePositions[i3] = x;
      particlePositions[i3 + 1] = y;
      particlePositions[i3 + 2] = z;

      originalPositions[i3] = x;
      originalPositions[i3 + 1] = y;
      originalPositions[i3 + 2] = z;

      particleVelocities[i3] = (Math.random() - 0.5) * 0.12;
      particleVelocities[i3 + 1] = (Math.random() - 0.5) * 0.12;
      particleVelocities[i3 + 2] = (Math.random() - 0.5) * 0.08;
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    // Luminous soft circular blue sprite for points on white background
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(0, 97, 148, 0.95)');
    grad.addColorStop(0.35, 'rgba(2, 132, 199, 0.8)');
    grad.addColorStop(0.7, 'rgba(56, 189, 248, 0.3)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();

    const particleTexture = new THREE.CanvasTexture(canvas);
    const particleMaterial = new THREE.PointsMaterial({
      size: 5.5,
      map: particleTexture,
      transparent: true,
      opacity: 0.85,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(particlesGeometry, particleMaterial);
    worldGroup.add(particleSystem);

    // Connection lines
    const maxLines = particleCount * 5;
    const linePositions = new Float32Array(maxLines * 6);
    const linesGeometry = new THREE.BufferGeometry();
    linesGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));

    const linesMaterial = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.35,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    const connectionLines = new THREE.LineSegments(linesGeometry, linesMaterial);
    worldGroup.add(connectionLines);

    // --- 7. Mouse Parallax Interaction ---
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    const halfX = window.innerWidth / 2;
    const halfY = window.innerHeight / 2;

    const onMouseMove = (e) => {
      mouseX = (e.clientX - halfX) * 0.04;
      mouseY = (e.clientY - halfY) * 0.04;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // --- 8. Render & Animation Loop ---
    const startTime = performance.now();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const time = (performance.now() - startTime) * 0.001;

      // Rotate primary planetary mesh and inner core
      faceMesh.rotation.y = time * 0.08;
      faceMesh.rotation.x = time * 0.04;

      innerCore.rotation.y = -time * 0.12;
      innerCore.rotation.z = time * 0.06;

      // Rotate concentric scanning rings on independent axes
      ring1.rotation.z = time * 0.15;
      ring2.rotation.y = time * 0.12;
      ring3.rotation.x = time * 0.18;

      // Orbit and rotate secondary left sensor group
      leftSensorGroup.rotation.y = time * 0.1;
      leftSensorGroup.rotation.x = time * 0.05;
      leftSensorGroup.position.y = -12 + Math.sin(time * 0.8) * 3;

      // Interpolate smooth cursor parallax
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;
      worldGroup.rotation.y = targetX * 0.008;
      worldGroup.rotation.x = targetY * 0.008;

      // Update particle positions with bounce boundaries
      const posArray = particlesGeometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        posArray[i3] += particleVelocities[i3];
        posArray[i3 + 1] += particleVelocities[i3 + 1];
        posArray[i3 + 2] += particleVelocities[i3 + 2];

        if (Math.abs(posArray[i3]) > spreadX / 2) particleVelocities[i3] *= -1;
        if (Math.abs(posArray[i3 + 1]) > spreadY / 2) particleVelocities[i3 + 1] *= -1;
        if (Math.abs(posArray[i3 + 2]) > spreadZ / 2) particleVelocities[i3 + 2] *= -1;
      }
      particlesGeometry.attributes.position.needsUpdate = true;

      // Recalculate dynamic connecting lines
      let connected = 0;
      const lPos = linesGeometry.attributes.position.array;
      const maxDist = 26;

      for (let i = 0; i < particleCount && connected < maxLines; i++) {
        const i3 = i * 3;
        const px = posArray[i3];
        const py = posArray[i3 + 1];
        const pz = posArray[i3 + 2];

        for (let j = i + 1; j < particleCount && connected < maxLines; j++) {
          const j3 = j * 3;
          const dx = px - posArray[j3];
          const dy = py - posArray[j3 + 1];
          const dz = pz - posArray[j3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < maxDist) {
            const idx = connected * 6;

            lPos[idx] = px;
            lPos[idx + 1] = py;
            lPos[idx + 2] = pz;
            lPos[idx + 3] = posArray[j3];
            lPos[idx + 4] = posArray[j3 + 1];
            lPos[idx + 5] = posArray[j3 + 2];

            connected++;
          }
        }
      }

      linesGeometry.setDrawRange(0, connected * 2);
      linesGeometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    // --- 9. Clean Lifecycle Disposal ---
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      renderer.dispose();
      particlesGeometry.dispose();
      linesGeometry.dispose();
      faceGeo.dispose();
      faceWireMat.dispose();
      innerCoreGeo.dispose();
      innerCoreMat.dispose();
      ring1Geo.dispose();
      ring2Geo.dispose();
      ring3Geo.dispose();
      ringMat1.dispose();
      ringMat2.dispose();
      ringMat3.dispose();
      leftTorusGeo.dispose();
      leftTorusMat.dispose();
      leftIcosaGeo.dispose();
      leftIcosaMat.dispose();
      particleMaterial.dispose();
      linesMaterial.dispose();
      particleTexture.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none bg-[#f8f9ff]">
      {/* 3D WebGL Canvas Viewport */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Atmospheric Soft Light Vignette & Depth Glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0)_0%,rgba(240,245,255,0.4)_70%,rgba(230,240,255,0.85)_100%)]" />

      {/* Subtle Corner Optical Reticles */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-blue-400/40" />
      <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-blue-400/40" />
      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-blue-400/40" />
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-blue-400/40" />

      {/* Micro-telemetry Status Watermark */}
      <div className="absolute bottom-3 left-12 text-[9px] font-mono tracking-widest text-blue-900/40 uppercase hidden md:flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
        ARGUS // PRECISION IDENTITY MATRIX // SEC-SYS-R125 // PLANETARY RINGS ACTIVE
      </div>
    </div>
  );
};
