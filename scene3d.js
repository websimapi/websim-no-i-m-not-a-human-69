import * as THREE from 'three';
import { createControls, setupControlEventListeners, getMovementState, isMobile } from './controls3d.js';
import { createGround, createMoveIndicator, createBarn, createFoliage, createLighting } from './objects3d.js';
import { initializeColliders, resolveCollision } from './collision3d.js';

let scene, camera, renderer, controls, raycaster;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();
let animationFrameId = null;
let moveIndicator = null;
let isMovingToTarget = false;
let targetPosition = null;
let walkableObjects = [];
let removeEventListeners = null;
let interactRaycaster = null;
let interactiveTargets = [];
let doorOpening = false, doorOpened = false, doorAngle = 0;

const container = document.getElementById('scene-3d-container');
const canvas = document.getElementById('scene-3d-canvas');
const instructions = document.getElementById('scene-3d-instructions');

function onTargetSet(target, hitPoint) {
    targetPosition = target;
    isMovingToTarget = true;
    if (moveIndicator) {
        moveIndicator.position.set(hitPoint.x, 0.02, hitPoint.z);
        moveIndicator.visible = true;
        moveIndicator.scale.set(1,1,1);
    }
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    const player = controls.getObject();

    if (isMobile && isMovingToTarget && targetPosition) {
        const distance = player.position.distanceTo(targetPosition);
        if (moveIndicator && moveIndicator.visible) {
            const t = time * 0.004;
            const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.15;
            moveIndicator.scale.setScalar(THREE.MathUtils.clamp(distance * 0.12, 0.6, 2.2) * pulse);
        }
        
        if (distance < 0.3) {
            // Reached target
            isMovingToTarget = false;
            targetPosition = null;
            if (moveIndicator) moveIndicator.visible = false;
        } else {
            // Move towards target
            const direction = targetPosition.clone().sub(player.position).normalize();
            const moveSpeed = Math.min(distance * 3, 5); // Speed based on distance
            const moveVector = direction.multiplyScalar(moveSpeed * delta);
            const newPosition = resolveCollision(player.position, moveVector);
            if (newPosition.equals(player.position)) {
                isMovingToTarget = false; targetPosition = null; if (moveIndicator) moveIndicator.visible = false;
            } else {
                player.position.copy(newPosition);
            }
        }
    } else if (!isMobile) {
        // Desktop controls
        const movementState = getMovementState();
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(movementState.moveForward) - Number(movementState.moveBackward);
        direction.x = Number(movementState.moveRight) - Number(movementState.moveLeft);
        direction.normalize();

        if (movementState.moveForward || movementState.moveBackward) velocity.z -= direction.z * 40.0 * delta;
        if (movementState.moveLeft || movementState.moveRight) velocity.x -= direction.x * 40.0 * delta;

        const moveDeltaX = -velocity.x * delta, moveDeltaZ = -velocity.z * delta;
        const forward = new THREE.Vector3(); controls.getObject().getWorldDirection(forward); forward.y = 0; forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
        const desired = forward.multiplyScalar(moveDeltaZ).add(right.multiplyScalar(moveDeltaX));
        const resolved = resolveCollision(player.position, desired);
        player.position.copy(resolved);
    }

    // Keep player on ground
    if (controls) {
        player.position.y = 1.7;
    }

    // Door opening animation
    if (doorOpening && !doorOpened) {
        const target = -Math.PI * 0.65;
        doorAngle = THREE.MathUtils.damp(doorAngle, target, 6, delta);
        const pivot = interactiveTargets[0];
        if (pivot) pivot.rotation.y = doorAngle;
        if (Math.abs(doorAngle - target) < 0.02) { doorOpened = true; doorOpening = false; showBarnInteriorOverlay(); }
    }

    prevTime = time;
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export function initScene3D() {
    container.style.display = 'block';

    // Reset arrays
    walkableObjects = [];

    doorOpening = false; doorOpened = false; doorAngle = 0;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.Fog(0x111111, 0, 75);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Controls
    const controlsResult = createControls(camera, container, instructions);
    controls = controlsResult.controls;
    raycaster = controlsResult.raycaster;
    scene.add(controls.getObject());

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // Textures
    const textureLoader = new THREE.TextureLoader();

    // Lighting
    const lights = createLighting();
    lights.forEach(light => scene.add(light));

    // Ground
    const ground = createGround(textureLoader);
    scene.add(ground);
    walkableObjects.push(ground);

    // Move indicator
    moveIndicator = createMoveIndicator();
    scene.add(moveIndicator);

    // Barn
    const barnGroup = createBarn(textureLoader);
    scene.add(barnGroup);
    if (barnGroup.userData?.doorPivot) {
        interactiveTargets = [barnGroup.userData.doorPivot];
    }

    // Initialize collision system
    initializeColliders(barnGroup);

    // Foliage
    const foliageGroup = createFoliage();
    barnGroup.add(foliageGroup);

    // Event listeners
    removeEventListeners = setupControlEventListeners(
        container, controls, raycaster, camera, walkableObjects, onTargetSet, instructions
    );

    interactRaycaster = new THREE.Raycaster();
    const onMouseDown = () => {
        if (!interactiveTargets.length) return;
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        interactRaycaster.set(camera.position, dir);
        const hits = interactRaycaster.intersectObjects(interactiveTargets, true);
        if (hits.length && camera.position.distanceTo(hits[0].point) < 3.0 && !doorOpening && !doorOpened) {
            doorOpening = true;
        }
    };
    container.addEventListener('mousedown', onMouseDown);

    // Cleanup addition
    removeEventListeners = ((origRemove) => {
        return () => { if (origRemove) origRemove(); container.removeEventListener('mousedown', onMouseDown); };
    })(removeEventListeners);

    // Start
    prevTime = performance.now();
    animate();
    window.addEventListener('resize', onWindowResize);
}

export function stopScene3D() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (removeEventListeners) {
        removeEventListeners();
        removeEventListeners = null;
    }
    window.removeEventListener('resize', onWindowResize);
    if(controls) {
        controls.dispose();
        controls = null;
    }
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
    scene = null;
    camera = null;
    if (container) {
        container.style.display = 'none';
    }
}

function showBarnInteriorOverlay() {
    const overlay = document.getElementById('barn-interior-overlay');
    const btn = document.getElementById('barn-exit-btn');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    stopScene3D();
    const back = () => { overlay.style.display = 'none'; overlay.setAttribute('aria-hidden','true'); btn?.removeEventListener('click', back); initScene3D(); };
    btn?.addEventListener('click', back, { once: true });
}