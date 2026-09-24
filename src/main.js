import './ui/base.css';
import * as THREE from 'three';
import { PHYSICS } from './config/physics.js';
import { CollisionWorld, DRIVABLE } from './physics/CollisionWorld.js';
import { CarPhysics } from './physics/CarPhysics.js';
import { Input } from './input/Input.js';
import { GameLoop } from './core/GameLoop.js';
import { ChaseCamera } from './rendering/ChaseCamera.js';

// ── Phase 1 sandbox: placeholder box car on a flat plane ──────────────────
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ff);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 60, 20);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 2000);
const chase = new ChaseCamera(camera);

// Ground: visual plane + grid, collision as a 10 m tiled plane.
const SIZE = 1000;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshLambertMaterial({ color: 0x7fbf6a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(SIZE, SIZE / 10, 0x223322, 0x4d7a45));

const world = new CollisionWorld();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
for (let x = -SIZE / 2; x < SIZE / 2; x += 10) {
  for (let z = -SIZE / 2; z < SIZE / 2; z += 10) {
    a.set(x, 0, z); b.set(x, 0, z + 10); c.set(x + 10, 0, z + 10); d.set(x + 10, 0, z);
    world.addTriangle(a, b, c, DRIVABLE);
    world.addTriangle(a, c, d, DRIVABLE);
  }
}
world.build();

// Placeholder car: a box body plus a nose marker so heading is readable.
const carMesh = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.8), new THREE.MeshLambertMaterial({ color: 0x1d3557 }));
cabin.position.set(0, 0.55, -0.3);
const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.4), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
nose.position.set(0, 0.1, 2.0);
carMesh.add(body, cabin, nose);
scene.add(carMesh);

// Some landmarks so motion and turning are visible.
const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.6, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xff8800 }), 80);
const m = new THREE.Matrix4();
for (let i = 0; i < 80; i++) {
  const ang = (i / 80) * Math.PI * 2;
  const r = 40 + (i % 2) * 25;
  m.makeTranslation(Math.cos(ang) * r, 0.8, Math.sin(ang) * r);
  cones.setMatrixAt(i, m);
}
scene.add(cones);

const car = new CarPhysics(world);
const spawnPos = new THREE.Vector3(0, PHYSICS.car.rideHeight, 0);
car.reset(spawnPos, new THREE.Quaternion());
chase.snap(car.position, car.quaternion);

const input = new Input();
input.onAction((action) => {
  if (action === 'reset') car.reset(spawnPos, new THREE.Quaternion());
});

const hud = document.getElementById('ui');
hud.style.cssText = 'position:fixed;left:12px;top:12px;font:bold 18px monospace;color:#111;background:#fff;border:3px solid #111;padding:6px 10px;pointer-events:none';

const prevPos = new THREE.Vector3();
const prevQuat = new THREE.Quaternion();

const loop = new GameLoop({
  tickRate: PHYSICS.tickRate,
  fixedUpdate(dt) {
    prevPos.copy(car.position);
    prevQuat.copy(car.quaternion);
    car.step(dt, input.sample());
    if (car.position.y < -30) car.reset(spawnPos, new THREE.Quaternion());
  },
  frame(dt, alpha) {
    carMesh.position.lerpVectors(prevPos, car.position, alpha);
    carMesh.quaternion.slerpQuaternions(prevQuat, car.quaternion, alpha);
    chase.update(dt, carMesh.position, carMesh.quaternion, { speed: car.speed, grounded: car.grounded, velocity: car.velocity });
    renderer.render(scene, camera);
    hud.textContent = `${Math.round(Math.abs(car.speed) * 3.6)} km/h  ·  ${loop.fps.toFixed(0)} fps`;
  },
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  chase.aspect = camera.aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
loop.start();

// Debug handle for automated verification.
window.__INKTRACK__ = { car, input, loop, THREE };
