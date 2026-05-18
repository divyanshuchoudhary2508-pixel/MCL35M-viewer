/**
 * viewer.js — McLaren MCL35M 3D Viewer
 * Handles scene setup, model loading, camera controls, and animation.
 */

(function () {
  'use strict';

  // ── Element refs ──
  const canvas   = document.getElementById('three-canvas');
  const loaderEl = document.getElementById('loader');
  const progFill = document.getElementById('prog-fill');
  const progLabel = document.getElementById('prog-label');
  const errorMsg = document.getElementById('error-msg');
  const autoBtn  = document.getElementById('auto-rotate-btn');
  const resetBtn = document.getElementById('reset-btn');
  const rotIcon  = document.getElementById('rotate-icon');

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  function updateSize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── Scene ──
  const scene = new THREE.Scene();
  scene.background = null;

  // ── Camera ──
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
  camera.position.set(4, 1.8, 4);

  // ── Lighting ──
  // Ambient
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  // Key light (warm top-right)
  const keyLight = new THREE.DirectionalLight(0xfff0d0, 3.2);
  keyLight.position.set(6, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 50;
  scene.add(keyLight);

  // Fill light (cool left)
  const fillLight = new THREE.DirectionalLight(0xc0d8ff, 1.2);
  fillLight.position.set(-7, 4, -4);
  scene.add(fillLight);

  // Rim / backlight (orange glow from rear)
  const rimLight = new THREE.DirectionalLight(0xff7700, 2.5);
  rimLight.position.set(0, -1, -10);
  scene.add(rimLight);

  // Ground bounce
  const bounceLight = new THREE.DirectionalLight(0x304060, 0.6);
  bounceLight.position.set(0, -8, 0);
  scene.add(bounceLight);

  // Hemisphere fill
  scene.add(new THREE.HemisphereLight(0x334455, 0x111111, 0.8));

  // Reflective ground plane (subtle)
  const groundGeo = new THREE.PlaneGeometry(20, 20);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x111111, metalness: 0.3, roughness: 0.8, transparent: true, opacity: 0.6
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Camera orbit state ──
  const DEFAULT = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 5.5 };
  const spherical = { theta: DEFAULT.theta, phi: DEFAULT.phi, radius: DEFAULT.radius };
  const target = new THREE.Vector3(0, 0.15, 0);

  function updateCamera() {
    camera.position.set(
      target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
      target.y + spherical.radius * Math.cos(spherical.phi),
      target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta)
    );
    camera.lookAt(target);
  }
  updateCamera();

  // ── Mouse / touch controls ──
  let isDragging = false, isRightDrag = false;
  let prevMouse = { x: 0, y: 0 };
  let autoRotate = true;
  let autoRotateTimer = null;

  function pauseAutoRotate() {
    autoRotate = false;
    clearTimeout(autoRotateTimer);
    autoRotateTimer = setTimeout(() => { autoRotate = true; rotIcon.textContent = '⏸'; }, 4000);
  }

  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    isRightDrag = (e.button === 2);
    prevMouse = { x: e.clientX, y: e.clientY };
    pauseAutoRotate();
    e.preventDefault();
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mouseup', () => { isDragging = false; });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    prevMouse = { x: e.clientX, y: e.clientY };

    if (isRightDrag) {
      // Pan
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const right = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
      target.addScaledVector(right, -dx * spherical.radius * 0.001);
      target.y += dy * spherical.radius * 0.001;
    } else {
      // Orbit
      spherical.theta -= dx * 0.007;
      spherical.phi = Math.max(0.08, Math.min(Math.PI - 0.08, spherical.phi + dy * 0.007));
    }
    updateCamera();
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    spherical.radius = Math.max(1.2, Math.min(18, spherical.radius + e.deltaY * 0.006));
    updateCamera();
    pauseAutoRotate();
  }, { passive: false });

  // Touch
  let lastTouch = null, lastPinchDist = null;

  canvas.addEventListener('touchstart', e => {
    pauseAutoRotate();
    if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && lastTouch) {
      const dx = e.touches[0].clientX - lastTouch.x;
      const dy = e.touches[0].clientY - lastTouch.y;
      lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      spherical.theta -= dx * 0.012;
      spherical.phi = Math.max(0.08, Math.min(Math.PI - 0.08, spherical.phi + dy * 0.012));
      updateCamera();
    }
    if (e.touches.length === 2 && lastPinchDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      spherical.radius = Math.max(1.2, Math.min(18, spherical.radius * (lastPinchDist / dist)));
      lastPinchDist = dist;
      updateCamera();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => { lastTouch = null; lastPinchDist = null; });

  // ── UI Buttons ──
  autoBtn.addEventListener('click', () => {
    autoRotate = !autoRotate;
    rotIcon.textContent = autoRotate ? '⏸' : '▶';
    clearTimeout(autoRotateTimer);
  });

  resetBtn.addEventListener('click', () => {
    spherical.theta = DEFAULT.theta;
    spherical.phi = DEFAULT.phi;
    spherical.radius = DEFAULT.radius;
    target.set(0, 0.15, 0);
    updateCamera();
  });

  // ── Resize handler ──
  const resizeObserver = new ResizeObserver(() => updateSize());
  resizeObserver.observe(canvas.parentElement);
  updateSize();

  // ── Load GLTF model ──
  const gltfLoader = new THREE.GLTFLoader();

  // Set resource path so textures are found in textures/ subfolder
  // The gltf file references textures as "textures/filename.png"
  // so we set path to the same directory as scene.gltf
  gltfLoader.setPath('./');

  gltfLoader.load(
    'scene.gltf',

    // onLoad
    function (gltf) {
      const model = gltf.scene;

      // Enable shadows on all meshes
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // Boost material quality
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => { if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
            } else {
              if (child.material.map) child.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
          }
        }
      });

      // Centre and scale to fit
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 3.2 / maxDim;

      model.scale.setScalar(scale);
      model.position.copy(centre.multiplyScalar(-scale));
      // Sit the car just above the ground plane
      model.position.y = -size.y * scale * 0.1;

      scene.add(model);

      // Adjust ground plane to match car bottom
      ground.position.y = -(size.y * scale * 0.5) - (size.y * scale * 0.1);

      // Camera at nice initial angle
      spherical.radius = 5.5;
      target.set(0, 0, 0);
      updateCamera();

      // Fade out loader
      loaderEl.classList.add('hidden');
      setTimeout(() => { loaderEl.style.display = 'none'; }, 900);
    },

    // onProgress
    function (xhr) {
      if (xhr.lengthComputable) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        progFill.style.width = pct + '%';
        progLabel.textContent = pct + '%';
      }
    },

    // onError
    function (err) {
      console.error('GLTF load error:', err);
      loaderEl.style.display = 'none';
      errorMsg.classList.add('show');
    }
  );

  // ── Animate ──
  function animate() {
    requestAnimationFrame(animate);
    if (autoRotate) {
      spherical.theta += 0.0025;
      updateCamera();
    }
    renderer.render(scene, camera);
  }
  animate();

})();
