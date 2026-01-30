import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { GameAPI, GameInstance } from '../../core/types';
import {
  Particle,
  FloatingText,
  generateParticlesAt,
  createFloatingText,
  drawParticles,
  drawFloatingTexts,
  filterActiveParticles,
  filterActiveFloatingTexts,
} from '../../core/effects';

// Game constants
const STARTING_COINS = 20;
const COIN_RADIUS = 0.4;
const COIN_HEIGHT = 0.12;
const DROP_COOLDOWN = 200;
const SETTLE_TIMEOUT = 3000; // 3 seconds to settle before game over
const SETTLE_VELOCITY_THRESHOLD = 0.5; // coins considered settled below this speed

// Platform dimensions
const PLATFORM_WIDTH = 10;
const PLATFORM_DEPTH = 12;
const PLATFORM_HEIGHT = 0.3;

// Shelf dimensions (creates tiers)
const SHELF_HEIGHT = 0.6;

// Pusher dimensions
const PUSHER_WIDTH = PLATFORM_WIDTH - 0.5;
const PUSHER_HEIGHT = 0.8;
const PUSHER_DEPTH = 0.4;
const PUSHER_SPEED = 3;
const PUSHER_MIN_Z = -PLATFORM_DEPTH / 2 + 2;
const PUSHER_MAX_Z = -1;

// Bonus zone config
const BONUS_ZONE_WIDTH = 2;

// Tier configurations
interface TierConfig {
  name: string;
  coinValue: number;
  coinColor: number;
  coinEmissive: number;
  requiredScore: number;
}

const TIERS: TierConfig[] = [
  { name: 'Bronze', coinValue: 1, coinColor: 0xcd7f32, coinEmissive: 0x3d2510, requiredScore: 0 },
  { name: 'Silver', coinValue: 5, coinColor: 0xc0c0c0, coinEmissive: 0x404040, requiredScore: 50 },
  { name: 'Gold', coinValue: 25, coinColor: 0xffd700, coinEmissive: 0x4d4000, requiredScore: 200 },
  { name: 'Platinum', coinValue: 100, coinColor: 0xe5e4e2, coinEmissive: 0x454545, requiredScore: 1000 },
];

interface CoinData {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  tier: number;
  isGem: boolean;
  collected: boolean;
}

// Bonus zone type
type BonusZone = 'left' | 'right' | 'center';

export class CoinPusherGame implements GameInstance {
  private api: GameAPI;
  private container: HTMLElement;

  // Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  // Cannon.js
  private world!: CANNON.World;
  private pusherBody!: CANNON.Body;

  // Game objects
  private coins: CoinData[] = [];
  private pusherMesh!: THREE.Mesh;

  // Game state
  private score = 0;
  private coinsInHand = STARTING_COINS;
  private currentTier = 0;
  private isPaused = false;
  private isDestroyed = false;
  private animationFrameId = 0;
  private isGameOver = false;

  // Defeat condition tracking
  private outOfCoinsTime: number | null = null;
  private settleCheckStarted = false;

  // Pusher state
  private pusherDirection = 1;

  // Input state
  private dropX: number | null = null;
  private lastDropTime = 0;
  private isPointerDown = false;
  private pointerX = 0;

  // 2D overlay for effects
  private overlayCanvas!: HTMLCanvasElement;
  private overlayCtx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  // Collection tracking
  private lastCollectTime = 0;
  private collectStreak = 0;

  // Bonus zones - alternating bonuses
  private activeBonusZone: BonusZone = 'left';
  private bonusZoneTimer = 0;
  private leftBonusMesh!: THREE.Mesh;
  private rightBonusMesh!: THREE.Mesh;

  constructor(container: HTMLElement, api: GameAPI) {
    this.container = container;
    this.api = api;

    this.setupThreeJS();
    this.setupCannon();
    this.setupScene();
    this.setupOverlay();
    this.setupEventListeners();
  }

  private setupThreeJS() {
    const rect = this.container.getBoundingClientRect();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera - angled view looking down at the platform
    this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
    this.camera.position.set(0, 14, 12);
    this.camera.lookAt(0, 0, 1);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 15, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    this.scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);
  }

  private setupCannon() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -20, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();

    // Better solver for stacking
    (this.world.solver as any).iterations = 10;

    // Materials
    const coinMaterial = new CANNON.Material('coin');
    const platformMaterial = new CANNON.Material('platform');
    const pusherMaterial = new CANNON.Material('pusher');

    // Contact materials
    const coinPlatformContact = new CANNON.ContactMaterial(coinMaterial, platformMaterial, {
      friction: 0.4,
      restitution: 0.2,
    });
    this.world.addContactMaterial(coinPlatformContact);

    const coinCoinContact = new CANNON.ContactMaterial(coinMaterial, coinMaterial, {
      friction: 0.3,
      restitution: 0.3,
    });
    this.world.addContactMaterial(coinCoinContact);

    const coinPusherContact = new CANNON.ContactMaterial(coinMaterial, pusherMaterial, {
      friction: 0.5,
      restitution: 0.1,
    });
    this.world.addContactMaterial(coinPusherContact);

    // Store materials for later use
    (this.world as any).coinMaterial = coinMaterial;
    (this.world as any).platformMaterial = platformMaterial;
    (this.world as any).pusherMaterial = pusherMaterial;
  }

  private setupScene() {
    const platformMaterial = (this.world as any).platformMaterial;
    const pusherMaterial = (this.world as any).pusherMaterial;

    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a27,
      roughness: 0.8,
      metalness: 0.2,
    });

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.9 });

    // === TIERED PLATFORM DESIGN ===

    // Lower tier (main play area - front)
    const lowerTierDepth = PLATFORM_DEPTH * 0.5;
    const lowerTierZ = PLATFORM_DEPTH / 2 - lowerTierDepth / 2;

    const lowerPlatformGeom = new THREE.BoxGeometry(PLATFORM_WIDTH, PLATFORM_HEIGHT, lowerTierDepth);
    const lowerPlatformMesh = new THREE.Mesh(lowerPlatformGeom, platformMat);
    lowerPlatformMesh.position.set(0, -PLATFORM_HEIGHT / 2, lowerTierZ);
    lowerPlatformMesh.receiveShadow = true;
    this.scene.add(lowerPlatformMesh);

    const lowerPlatformBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(PLATFORM_WIDTH / 2, PLATFORM_HEIGHT / 2, lowerTierDepth / 2)),
      material: platformMaterial,
    });
    lowerPlatformBody.position.set(0, -PLATFORM_HEIGHT / 2, lowerTierZ);
    this.world.addBody(lowerPlatformBody);

    // Upper tier (back area where pusher operates)
    const upperTierDepth = PLATFORM_DEPTH * 0.5;
    const upperTierZ = -PLATFORM_DEPTH / 2 + upperTierDepth / 2;
    const upperTierY = SHELF_HEIGHT;

    const upperPlatformGeom = new THREE.BoxGeometry(PLATFORM_WIDTH, PLATFORM_HEIGHT, upperTierDepth);
    const upperPlatformMesh = new THREE.Mesh(upperPlatformGeom, platformMat);
    upperPlatformMesh.position.set(0, upperTierY - PLATFORM_HEIGHT / 2, upperTierZ);
    upperPlatformMesh.receiveShadow = true;
    this.scene.add(upperPlatformMesh);

    const upperPlatformBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(PLATFORM_WIDTH / 2, PLATFORM_HEIGHT / 2, upperTierDepth / 2)),
      material: platformMaterial,
    });
    upperPlatformBody.position.set(0, upperTierY - PLATFORM_HEIGHT / 2, upperTierZ);
    this.world.addBody(upperPlatformBody);

    // Ramp connecting upper to lower tier
    const rampDepth = 1.5;
    const rampAngle = Math.atan2(SHELF_HEIGHT, rampDepth);
    const rampLength = Math.sqrt(SHELF_HEIGHT * SHELF_HEIGHT + rampDepth * rampDepth);

    const rampGeom = new THREE.BoxGeometry(PLATFORM_WIDTH, 0.1, rampLength);
    const rampMesh = new THREE.Mesh(rampGeom, platformMat);
    rampMesh.position.set(0, SHELF_HEIGHT / 2, 0);
    rampMesh.rotation.x = rampAngle;
    rampMesh.receiveShadow = true;
    this.scene.add(rampMesh);

    const rampBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(PLATFORM_WIDTH / 2, 0.05, rampLength / 2)),
      material: platformMaterial,
    });
    rampBody.position.set(0, SHELF_HEIGHT / 2, 0);
    rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), rampAngle);
    this.world.addBody(rampBody);

    // Back wall
    const backWallGeometry = new THREE.BoxGeometry(PLATFORM_WIDTH, 2, 0.3);
    const backWallMesh = new THREE.Mesh(backWallGeometry, wallMat);
    backWallMesh.position.set(0, upperTierY + 1, -PLATFORM_DEPTH / 2);
    backWallMesh.receiveShadow = true;
    this.scene.add(backWallMesh);

    const backWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(PLATFORM_WIDTH / 2, 1, 0.15)),
      material: platformMaterial,
    });
    backWallBody.position.set(0, upperTierY + 1, -PLATFORM_DEPTH / 2);
    this.world.addBody(backWallBody);

    // Side walls (full length, stepped)
    const sideWallLowerGeom = new THREE.BoxGeometry(0.3, 1.5, lowerTierDepth);
    const sideWallUpperGeom = new THREE.BoxGeometry(0.3, 2, upperTierDepth + rampDepth);

    // Left wall
    const leftWallLower = new THREE.Mesh(sideWallLowerGeom, wallMat);
    leftWallLower.position.set(-PLATFORM_WIDTH / 2, 0.75, lowerTierZ);
    this.scene.add(leftWallLower);

    const leftWallLowerBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.15, 0.75, lowerTierDepth / 2)),
      material: platformMaterial,
    });
    leftWallLowerBody.position.set(-PLATFORM_WIDTH / 2, 0.75, lowerTierZ);
    this.world.addBody(leftWallLowerBody);

    const leftWallUpper = new THREE.Mesh(sideWallUpperGeom, wallMat);
    leftWallUpper.position.set(-PLATFORM_WIDTH / 2, upperTierY + 1, upperTierZ - rampDepth / 2);
    this.scene.add(leftWallUpper);

    const leftWallUpperBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.15, 1, (upperTierDepth + rampDepth) / 2)),
      material: platformMaterial,
    });
    leftWallUpperBody.position.set(-PLATFORM_WIDTH / 2, upperTierY + 1, upperTierZ - rampDepth / 2);
    this.world.addBody(leftWallUpperBody);

    // Right wall
    const rightWallLower = new THREE.Mesh(sideWallLowerGeom, wallMat);
    rightWallLower.position.set(PLATFORM_WIDTH / 2, 0.75, lowerTierZ);
    this.scene.add(rightWallLower);

    const rightWallLowerBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.15, 0.75, lowerTierDepth / 2)),
      material: platformMaterial,
    });
    rightWallLowerBody.position.set(PLATFORM_WIDTH / 2, 0.75, lowerTierZ);
    this.world.addBody(rightWallLowerBody);

    const rightWallUpper = new THREE.Mesh(sideWallUpperGeom, wallMat);
    rightWallUpper.position.set(PLATFORM_WIDTH / 2, upperTierY + 1, upperTierZ - rampDepth / 2);
    this.scene.add(rightWallUpper);

    const rightWallUpperBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.15, 1, (upperTierDepth + rampDepth) / 2)),
      material: platformMaterial,
    });
    rightWallUpperBody.position.set(PLATFORM_WIDTH / 2, upperTierY + 1, upperTierZ - rampDepth / 2);
    this.world.addBody(rightWallUpperBody);

    // === CENTER DIVIDER (creates left/right decision) ===
    const dividerHeight = 0.8;
    const dividerDepth = 3;
    const dividerZ = PLATFORM_DEPTH / 2 - 2;

    const dividerGeom = new THREE.BoxGeometry(0.3, dividerHeight, dividerDepth);
    const dividerMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7 });
    const dividerMesh = new THREE.Mesh(dividerGeom, dividerMat);
    dividerMesh.position.set(0, dividerHeight / 2, dividerZ);
    dividerMesh.castShadow = true;
    this.scene.add(dividerMesh);

    const dividerBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.15, dividerHeight / 2, dividerDepth / 2)),
      material: platformMaterial,
    });
    dividerBody.position.set(0, dividerHeight / 2, dividerZ);
    this.world.addBody(dividerBody);

    // === PUSHER ===
    const pusherGeometry = new THREE.BoxGeometry(PUSHER_WIDTH, PUSHER_HEIGHT, PUSHER_DEPTH);
    const pusherMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.5,
      metalness: 0.6,
    });
    this.pusherMesh = new THREE.Mesh(pusherGeometry, pusherMat);
    this.pusherMesh.position.set(0, upperTierY + PUSHER_HEIGHT / 2, PUSHER_MIN_Z);
    this.pusherMesh.castShadow = true;
    this.pusherMesh.receiveShadow = true;
    this.scene.add(this.pusherMesh);

    this.pusherBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(new CANNON.Vec3(PUSHER_WIDTH / 2, PUSHER_HEIGHT / 2, PUSHER_DEPTH / 2)),
      material: pusherMaterial,
    });
    this.pusherBody.position.set(0, upperTierY + PUSHER_HEIGHT / 2, PUSHER_MIN_Z);
    this.world.addBody(this.pusherBody);

    // === BONUS ZONES ===
    const bonusZoneDepth = 1.5;
    const bonusZoneZ = PLATFORM_DEPTH / 2 + 0.75;

    // Left bonus zone (2x multiplier when active)
    const leftBonusGeom = new THREE.BoxGeometry(BONUS_ZONE_WIDTH, 0.1, bonusZoneDepth);
    const leftBonusMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1e40af,
      roughness: 0.5,
    });
    this.leftBonusMesh = new THREE.Mesh(leftBonusGeom, leftBonusMat);
    this.leftBonusMesh.position.set(-PLATFORM_WIDTH / 4, 0.05, bonusZoneZ);
    this.scene.add(this.leftBonusMesh);

    // Right bonus zone (2x multiplier when active)
    const rightBonusMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x7f1d1d,
      roughness: 0.5,
    });
    this.rightBonusMesh = new THREE.Mesh(leftBonusGeom, rightBonusMat);
    this.rightBonusMesh.position.set(PLATFORM_WIDTH / 4, 0.05, bonusZoneZ);
    this.scene.add(this.rightBonusMesh);

    // Center collection tray
    const centerTrayGeom = new THREE.BoxGeometry(PLATFORM_WIDTH / 2 - BONUS_ZONE_WIDTH, 0.1, bonusZoneDepth);
    const centerTrayMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x115522,
      roughness: 0.5,
    });
    const centerTrayMesh = new THREE.Mesh(centerTrayGeom, centerTrayMat);
    centerTrayMesh.position.set(0, 0.05, bonusZoneZ);
    this.scene.add(centerTrayMesh);
  }

  private setupOverlay() {
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.top = '0';
    this.overlayCanvas.style.left = '0';
    this.overlayCanvas.style.width = '100%';
    this.overlayCanvas.style.height = '100%';
    this.overlayCanvas.style.pointerEvents = 'none';
    this.container.appendChild(this.overlayCanvas);

    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.overlayCtx = ctx;

    this.resizeOverlay();
  }

  private resizeOverlay() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.overlayCanvas.width = rect.width * dpr;
    this.overlayCanvas.height = rect.height * dpr;
    this.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.overlayCtx.scale(dpr, dpr);
  }

  private setupEventListeners() {
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerUp);
  }

  private handleResize = () => {
    const rect = this.container.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
    this.resizeOverlay();
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (this.isPaused || this.isGameOver) return;
    e.preventDefault();
    this.isPointerDown = true;
    this.updatePointerPosition(e);
    this.tryDropCoin();
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isPointerDown || this.isPaused || this.isGameOver) return;
    e.preventDefault();
    this.updatePointerPosition(e);
  };

  private handlePointerUp = () => {
    this.isPointerDown = false;
    this.dropX = null;
  };

  private updatePointerPosition(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;

    // Map to platform X range
    this.dropX = x * (PLATFORM_WIDTH / 2 - COIN_RADIUS - 0.3);
    this.pointerX = e.clientX - rect.left;
  }

  private tryDropCoin() {
    if (this.dropX === null || this.coinsInHand <= 0 || this.isGameOver) return;

    const now = performance.now();
    if (now - this.lastDropTime < DROP_COOLDOWN) return;

    this.lastDropTime = now;
    this.coinsInHand--;

    // Reset out of coins timer when we still have coins
    if (this.coinsInHand > 0) {
      this.outOfCoinsTime = null;
      this.settleCheckStarted = false;
    }

    // Drop coin just in front of the pusher on the upper tier
    const dropZ = this.pusherBody.position.z + PUSHER_DEPTH / 2 + COIN_RADIUS + 0.2;
    const dropY = SHELF_HEIGHT + 2;
    this.createCoin(this.dropX, dropY, dropZ, this.currentTier, false);

    this.api.sounds.drop();
    this.api.haptics.tap();
  }

  private createCoin(x: number, y: number, z: number, tier: number, isGem: boolean): CoinData {
    const tierConfig = TIERS[tier];
    const coinMaterial = (this.world as any).coinMaterial;

    // Three.js mesh
    const geometry = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, 24);
    const material = new THREE.MeshStandardMaterial({
      color: isGem ? 0xa855f7 : tierConfig.coinColor,
      emissive: isGem ? 0x4c1d95 : tierConfig.coinEmissive,
      roughness: 0.3,
      metalness: 0.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Cannon.js body
    const body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Cylinder(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, 12),
      material: coinMaterial,
      linearDamping: 0.1,
      angularDamping: 0.3,
    });
    body.position.set(x, y, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);

    this.world.addBody(body);

    const coinData: CoinData = {
      mesh,
      body,
      tier,
      isGem,
      collected: false,
    };

    this.coins.push(coinData);
    return coinData;
  }

  private checkCoinsSettled(): boolean {
    const activeCoins = this.coins.filter(c => !c.collected);
    if (activeCoins.length === 0) return true;

    for (const coin of activeCoins) {
      const vel = coin.body.velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      if (speed > SETTLE_VELOCITY_THRESHOLD) {
        return false;
      }
    }
    return true;
  }

  private updateBonusZones(deltaTime: number) {
    this.bonusZoneTimer += deltaTime;

    // Switch bonus zone every 5 seconds
    if (this.bonusZoneTimer >= 5) {
      this.bonusZoneTimer = 0;
      if (this.activeBonusZone === 'left') {
        this.activeBonusZone = 'right';
      } else if (this.activeBonusZone === 'right') {
        this.activeBonusZone = 'center';
      } else {
        this.activeBonusZone = 'left';
      }
    }

    // Update bonus zone visuals (pulsing glow for active zone)
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);

    const leftMat = this.leftBonusMesh.material as THREE.MeshStandardMaterial;
    const rightMat = this.rightBonusMesh.material as THREE.MeshStandardMaterial;

    if (this.activeBonusZone === 'left') {
      leftMat.emissiveIntensity = 0.5 + pulse * 0.5;
      rightMat.emissiveIntensity = 0.2;
    } else if (this.activeBonusZone === 'right') {
      leftMat.emissiveIntensity = 0.2;
      rightMat.emissiveIntensity = 0.5 + pulse * 0.5;
    } else {
      leftMat.emissiveIntensity = 0.2;
      rightMat.emissiveIntensity = 0.2;
    }
  }

  private getBonusZoneForX(x: number): BonusZone {
    if (x < -1) return 'left';
    if (x > 1) return 'right';
    return 'center';
  }

  private updatePhysics(deltaTime: number) {
    if (this.isPaused || this.isGameOver) return;

    // Update bonus zones
    this.updateBonusZones(deltaTime);

    // Update pusher
    const pusherZ = this.pusherBody.position.z;
    const pusherVelocity = PUSHER_SPEED * this.pusherDirection;

    if (pusherZ >= PUSHER_MAX_Z && this.pusherDirection > 0) {
      this.pusherDirection = -1;
    } else if (pusherZ <= PUSHER_MIN_Z && this.pusherDirection < 0) {
      this.pusherDirection = 1;
    }

    this.pusherBody.velocity.set(0, 0, pusherVelocity);

    // Step physics
    this.world.step(1 / 60, deltaTime, 3);

    // Sync pusher mesh
    this.pusherMesh.position.copy(this.pusherBody.position as any);
    this.pusherMesh.quaternion.copy(this.pusherBody.quaternion as any);

    // Sync coin meshes and check collection
    const collectionZ = PLATFORM_DEPTH / 2 + 0.5;
    const fallY = -2;
    const now = performance.now();

    for (const coin of this.coins) {
      if (coin.collected) continue;

      // Sync mesh to physics
      coin.mesh.position.copy(coin.body.position as any);
      coin.mesh.quaternion.copy(coin.body.quaternion as any);

      // Check if coin fell off the front (collected)
      if (coin.body.position.z > collectionZ || coin.body.position.y < fallY) {
        this.collectCoin(coin, now);
      }

      // Check if coin fell off sides (lost)
      if (Math.abs(coin.body.position.x) > PLATFORM_WIDTH / 2 + 1) {
        coin.collected = true;
        this.removeCoin(coin);
      }
    }

    // Check defeat condition
    if (this.coinsInHand <= 0 && !this.isGameOver) {
      const activeCoins = this.coins.filter(c => !c.collected);

      if (activeCoins.length === 0) {
        // No coins left at all - immediate game over
        this.triggerGameOver();
      } else if (this.outOfCoinsTime === null) {
        // Just ran out of coins - start tracking
        this.outOfCoinsTime = now;
        this.settleCheckStarted = true;

        const rect = this.container.getBoundingClientRect();
        this.floatingTexts.push(
          createFloatingText(rect.width / 2, rect.height / 2, 'Out of coins!', '#ef4444', 28)
        );
        this.api.sounds.warning();
      } else {
        // Check if settled or timeout
        const elapsed = now - this.outOfCoinsTime;
        const settled = this.checkCoinsSettled();

        if (settled || elapsed >= SETTLE_TIMEOUT) {
          this.triggerGameOver();
        }
      }
    }

    // Auto-drop while holding
    if (this.isPointerDown && this.dropX !== null) {
      this.tryDropCoin();
    }
  }

  private triggerGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.api.sounds.gameOver();
    this.api.gameOver(this.score);
  }

  private collectCoin(coin: CoinData, now: number) {
    coin.collected = true;
    const tierConfig = TIERS[coin.tier];
    const coinX = coin.body.position.x;
    const zone = this.getBonusZoneForX(coinX);

    // Screen position for effects
    const rect = this.container.getBoundingClientRect();
    const screenX = rect.width / 2 + (coinX / PLATFORM_WIDTH) * rect.width * 0.4;
    const screenY = rect.height - 100;

    // Bonus multiplier
    let zoneMultiplier = 1;
    let zoneBonusText = '';
    if (zone === this.activeBonusZone && zone !== 'center') {
      zoneMultiplier = 2;
      zoneBonusText = zone === 'left' ? '🔵 2x!' : '🔴 2x!';
    }

    if (coin.isGem) {
      const gemValue = tierConfig.coinValue * 10 * zoneMultiplier;
      this.coinsInHand += 3;
      this.score += gemValue;
      this.api.setScore(this.score);

      // Reset defeat tracking
      this.outOfCoinsTime = null;
      this.settleCheckStarted = false;

      this.particles.push(...generateParticlesAt(screenX, screenY, '#a855f7', 20));
      this.floatingTexts.push(createFloatingText(screenX, screenY - 20, `+${gemValue}`, '#c084fc', 28));
      this.floatingTexts.push(createFloatingText(screenX, screenY - 55, 'GEM BONUS!', '#a855f7', 26));
      if (zoneBonusText) {
        this.floatingTexts.push(createFloatingText(screenX, screenY - 85, zoneBonusText, '#fbbf24', 22));
      }

      this.api.sounds.tierUp();
    } else {
      this.coinsInHand++;

      // Reset defeat tracking
      this.outOfCoinsTime = null;
      this.settleCheckStarted = false;

      // Streak
      if (now - this.lastCollectTime < 500) {
        this.collectStreak++;
      } else {
        this.collectStreak = 1;
      }
      this.lastCollectTime = now;

      const streakMultiplier = Math.min(this.collectStreak, 5);
      const coinValue = tierConfig.coinValue * streakMultiplier * zoneMultiplier;
      this.score += coinValue;
      this.api.setScore(this.score);

      const color = `#${tierConfig.coinColor.toString(16).padStart(6, '0')}`;
      this.particles.push(...generateParticlesAt(screenX, screenY, color, 8));

      const streakText = streakMultiplier > 1 ? ` x${streakMultiplier}` : '';
      const zoneText = zoneMultiplier > 1 ? ` x2` : '';
      this.floatingTexts.push(createFloatingText(screenX, screenY - 20, `+${coinValue}${streakText}${zoneText}`, color, 22));

      if (zoneBonusText) {
        this.floatingTexts.push(createFloatingText(screenX, screenY - 45, zoneBonusText, '#fbbf24', 20));
      }

      if (this.collectStreak >= 5) {
        this.floatingTexts.push(createFloatingText(screenX, screenY - 70, 'JACKPOT!', '#f472b6', 28));
        this.api.sounds.coinCascade(this.collectStreak);
        if (Math.random() < 0.5) this.spawnGem();
      } else if (this.collectStreak >= 3) {
        this.floatingTexts.push(createFloatingText(screenX, screenY - 70, 'Great!', '#34d399', 24));
        this.api.sounds.coinCascade(this.collectStreak);
      } else {
        this.api.sounds.coinCollect();
      }
    }

    this.api.haptics.success();
    this.checkTierUpgrade();
    this.removeCoin(coin);
  }

  private removeCoin(coin: CoinData) {
    this.scene.remove(coin.mesh);
    this.world.removeBody(coin.body);
    coin.mesh.geometry.dispose();
    (coin.mesh.material as THREE.Material).dispose();
  }

  private spawnGem() {
    const x = (Math.random() - 0.5) * (PLATFORM_WIDTH - 2);
    this.createCoin(x, SHELF_HEIGHT + 4, PUSHER_MIN_Z - 1, this.currentTier, true);
  }

  private checkTierUpgrade() {
    const nextTier = this.currentTier + 1;
    if (nextTier < TIERS.length && this.score >= TIERS[nextTier].requiredScore) {
      this.currentTier = nextTier;

      const rect = this.container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      this.floatingTexts.push(
        createFloatingText(centerX, centerY, `${TIERS[this.currentTier].name} Tier!`, '#ffd700', 36)
      );

      this.api.sounds.tierUp();

      // Spawn bonus coins
      for (let i = 0; i < 5; i++) {
        const x = (Math.random() - 0.5) * (PLATFORM_WIDTH - 2);
        this.createCoin(x, SHELF_HEIGHT + 5 + i * 0.5, PUSHER_MIN_Z - 1 + Math.random(), this.currentTier, false);
      }
      this.spawnGem();
    }
  }

  private render() {
    this.renderer.render(this.scene, this.camera);

    // Render 2D overlay
    const rect = this.container.getBoundingClientRect();
    this.overlayCtx.clearRect(0, 0, rect.width, rect.height);

    // HUD
    this.drawHUD(rect);

    // Effects
    this.particles = filterActiveParticles(this.particles);
    this.floatingTexts = filterActiveFloatingTexts(this.floatingTexts);

    const reduceMotion = this.api.getSettings().reduceMotion;
    drawParticles(this.overlayCtx, this.particles, reduceMotion);
    drawFloatingTexts(this.overlayCtx, this.floatingTexts, reduceMotion);

    // Drop indicator
    if (this.dropX !== null && this.coinsInHand > 0 && !this.isGameOver) {
      this.overlayCtx.beginPath();
      this.overlayCtx.arc(this.pointerX, 60, 15, 0, Math.PI * 2);
      this.overlayCtx.fillStyle = 'rgba(59, 130, 246, 0.5)';
      this.overlayCtx.fill();
    }
  }

  private drawHUD(rect: DOMRect) {
    const ctx = this.overlayCtx;
    const tier = TIERS[this.currentTier];

    // Coins in hand
    ctx.fillStyle = this.coinsInHand <= 3 ? '#ef4444' : '#f8fafc';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Coins: ${this.coinsInHand}`, 20, 35);

    // Score
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.score}`, rect.width / 2, 35);

    // Tier indicator
    ctx.fillStyle = `#${tier.coinColor.toString(16).padStart(6, '0')}`;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${tier.name} Tier`, rect.width - 20, 35);

    // Next tier progress
    if (this.currentTier < TIERS.length - 1) {
      const nextTier = TIERS[this.currentTier + 1];
      const progress = Math.min(1, (this.score - tier.requiredScore) / (nextTier.requiredScore - tier.requiredScore));

      ctx.fillStyle = '#475569';
      ctx.fillRect(rect.width - 120, 45, 100, 8);
      ctx.fillStyle = `#${nextTier.coinColor.toString(16).padStart(6, '0')}`;
      ctx.fillRect(rect.width - 120, 45, 100 * progress, 8);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Next: ${nextTier.requiredScore}`, rect.width - 20, 65);
    }

    // Active bonus zone indicator
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    if (this.activeBonusZone === 'left') {
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('🔵 LEFT 2x BONUS!', rect.width / 2, rect.height - 45);
    } else if (this.activeBonusZone === 'right') {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('🔴 RIGHT 2x BONUS!', rect.width / 2, rect.height - 45);
    } else {
      ctx.fillStyle = '#22c55e';
      ctx.fillText('CENTER NORMAL', rect.width / 2, rect.height - 45);
    }

    // Settle warning
    if (this.settleCheckStarted && this.outOfCoinsTime !== null) {
      const remaining = Math.max(0, SETTLE_TIMEOUT - (performance.now() - this.outOfCoinsTime));
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`Game ending in ${(remaining / 1000).toFixed(1)}s...`, rect.width / 2, rect.height / 2 + 30);
    }

    // Instructions
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tap left or right to drop coins - aim for the bonus zone!', rect.width / 2, rect.height - 20);
  }

  private lastTime = 0;
  private gameLoop = (time: number) => {
    if (this.isDestroyed) return;

    const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.updatePhysics(deltaTime);
    this.render();

    // Clean up collected coins
    this.coins = this.coins.filter(c => !c.collected);

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private spawnInitialCoins() {
    const coinSpacing = COIN_RADIUS * 2.0;
    const numCols = 5;
    const edgeZ = PLATFORM_DEPTH / 2;

    // === LEFT SIDE COINS (near edge) ===
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < numCols; col++) {
        const x = -PLATFORM_WIDTH / 4 + (col - (numCols - 1) / 2) * coinSpacing * 0.8;
        const z = edgeZ - 0.6 - row * coinSpacing * 0.7;
        const y = 0.25 + Math.random() * 0.05;
        this.createCoin(x + (Math.random() - 0.5) * 0.1, y, z, 0, false);
      }
    }

    // Left side tower (tall stack to knock over)
    const leftTowerX = -PLATFORM_WIDTH / 4;
    const leftTowerZ = edgeZ - 2.5;
    for (let layer = 0; layer < 6; layer++) {
      this.createCoin(
        leftTowerX + (Math.random() - 0.5) * 0.1,
        0.25 + layer * (COIN_HEIGHT + 0.02),
        leftTowerZ + (Math.random() - 0.5) * 0.1,
        0, false
      );
    }

    // === RIGHT SIDE COINS (near edge) ===
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < numCols; col++) {
        const x = PLATFORM_WIDTH / 4 + (col - (numCols - 1) / 2) * coinSpacing * 0.8;
        const z = edgeZ - 0.6 - row * coinSpacing * 0.7;
        const y = 0.25 + Math.random() * 0.05;
        this.createCoin(x + (Math.random() - 0.5) * 0.1, y, z, 0, false);
      }
    }

    // Right side tower
    const rightTowerX = PLATFORM_WIDTH / 4;
    const rightTowerZ = edgeZ - 2.5;
    for (let layer = 0; layer < 6; layer++) {
      this.createCoin(
        rightTowerX + (Math.random() - 0.5) * 0.1,
        0.25 + layer * (COIN_HEIGHT + 0.02),
        rightTowerZ + (Math.random() - 0.5) * 0.1,
        0, false
      );
    }

    // === UPPER TIER COINS (on the shelf, ready to cascade down) ===
    const upperY = SHELF_HEIGHT + 0.25;
    const upperStartZ = -1;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 7; col++) {
        const x = (col - 3) * coinSpacing;
        const z = upperStartZ - row * coinSpacing * 0.8;
        this.createCoin(x + (Math.random() - 0.5) * 0.15, upperY, z, 0, false);
      }
    }

    // Second layer on upper tier
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        if (Math.random() < 0.7) {
          const x = (col - 2.5) * coinSpacing;
          const z = upperStartZ - 0.4 - row * coinSpacing * 0.8;
          this.createCoin(x, upperY + COIN_HEIGHT + 0.05, z, 0, false);
        }
      }
    }

    // === COINS TEETERING AT EDGES ===
    // Left edge teetering
    for (let i = 0; i < 4; i++) {
      this.createCoin(
        -PLATFORM_WIDTH / 4 + (Math.random() - 0.5) * 1.5,
        0.25,
        edgeZ - 0.25 - Math.random() * 0.15,
        0, false
      );
    }

    // Right edge teetering
    for (let i = 0; i < 4; i++) {
      this.createCoin(
        PLATFORM_WIDTH / 4 + (Math.random() - 0.5) * 1.5,
        0.25,
        edgeZ - 0.25 - Math.random() * 0.15,
        0, false
      );
    }

    // === GEMS ===
    // Gem on left tower
    this.createCoin(leftTowerX, 0.25 + 6 * (COIN_HEIGHT + 0.02), leftTowerZ, 0, true);
    // Gem on right tower
    this.createCoin(rightTowerX, 0.25 + 6 * (COIN_HEIGHT + 0.02), rightTowerZ, 0, true);
    // Gem on upper tier
    this.createCoin(0, upperY + COIN_HEIGHT * 2 + 0.1, upperStartZ - 1, 0, true);
  }

  start() {
    this.score = 0;
    this.coinsInHand = STARTING_COINS;
    this.currentTier = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.outOfCoinsTime = null;
    this.settleCheckStarted = false;
    this.particles = [];
    this.floatingTexts = [];
    this.collectStreak = 0;
    this.lastCollectTime = 0;
    this.pusherDirection = 1;
    this.activeBonusZone = 'left';
    this.bonusZoneTimer = 0;

    // Clear existing coins
    for (const coin of this.coins) {
      this.removeCoin(coin);
    }
    this.coins = [];

    // Reset pusher
    this.pusherBody.position.set(0, SHELF_HEIGHT + PUSHER_HEIGHT / 2, PUSHER_MIN_Z);
    this.pusherBody.velocity.set(0, 0, 0);

    // Spawn initial coins
    this.spawnInitialCoins();

    this.api.setScore(0);
    this.api.sounds.gameStart();

    this.lastTime = performance.now();
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.lastTime = performance.now();
  }

  reset() {
    this.start();
  }

  destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrameId);

    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerUp);

    // Clean up coins
    for (const coin of this.coins) {
      this.scene.remove(coin.mesh);
      coin.mesh.geometry.dispose();
      (coin.mesh.material as THREE.Material).dispose();
    }

    // Clean up Three.js
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlayCanvas.remove();
  }
}
