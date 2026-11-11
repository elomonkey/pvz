import * as THREE from 'three';

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PointerControllerOptions {
  canvas: HTMLCanvasElement;
  labelsLayer?: HTMLElement | null;
  camera: THREE.Camera;
  scene: THREE.Scene;
  isBlocked: () => boolean;
  onPick: (data: Record<string, unknown>, point: THREE.Vector3) => void;
  onToyLabel: () => void;
}

export function pointerToNdc(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
): THREE.Vector2 {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

export function findUserData(object: THREE.Object3D): Record<string, unknown> | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData && typeof current.userData.type === 'string') {
      return current.userData as Record<string, unknown>;
    }
    current = current.parent;
  }
  return null;
}

/** Raycaster intersects hidden meshes too; include ancestor visibility in picking. */
export function isVisibleForPicking(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

/**
 * Превращает тапы и клики по DOM-меткам в игровые события.
 * Не знает про механику игры: отдаёт наружу найденные userData и точку.
 */
export class PointerController {
  private readonly canvas: HTMLCanvasElement;
  private readonly labelsLayer: HTMLElement | null;
  private readonly camera: THREE.Camera;
  private readonly scene: THREE.Scene;
  private readonly isBlocked: () => boolean;
  private readonly onPick: (data: Record<string, unknown>, point: THREE.Vector3) => void;
  private readonly onToyLabel: () => void;
  private readonly raycaster = new THREE.Raycaster();
  private pointerStart: { x: number; y: number } | null = null;

  constructor(options: PointerControllerOptions) {
    this.canvas = options.canvas;
    this.labelsLayer = options.labelsLayer ?? null;
    this.camera = options.camera;
    this.scene = options.scene;
    this.isBlocked = options.isBlocked;
    this.onPick = options.onPick;
    this.onToyLabel = options.onToyLabel;

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.labelsLayer?.addEventListener('click', this.handleLabelClick);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.labelsLayer?.removeEventListener('click', this.handleLabelClick);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerStart = { x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointerStart) return;
    const dx = event.clientX - this.pointerStart.x;
    const dy = event.clientY - this.pointerStart.y;
    this.pointerStart = null;
    if (Math.hypot(dx, dy) > 10) return;
    this.handlePointer(event.clientX, event.clientY);
  };

  private readonly handlePointerCancel = (): void => {
    this.pointerStart = null;
  };

  private readonly handleLabelClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const prop = target.closest<HTMLElement>('.prop-label');
    if (!prop || this.isBlocked()) return;
    if (prop.dataset.action === 'toy') this.onToyLabel();
  };

  private handlePointer(clientX: number, clientY: number): void {
    if (this.isBlocked()) return;

    const rect = this.canvas.getBoundingClientRect();
    const ndc = pointerToNdc(clientX, clientY, rect);
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.camera);

    for (const hit of this.raycaster.intersectObjects(this.scene.children, true)) {
      if (!isVisibleForPicking(hit.object)) continue;
      const data = findUserData(hit.object);
      if (!data) continue;
      this.onPick(data, hit.point);
      return;
    }
  }
}
