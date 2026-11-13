import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  ENTRY_POINT,
  ENTRY_TURN_POINT,
  EXIT_POINT,
  QUEUE_SPOTS,
  clamp,
  type Archetype,
  type Vec2,
} from './data';
import { createPerson, type PersonRig } from './view/characters';
import { createStyledPerson, isCharacterStyle } from './view/characterRig';
import { createGalinaPerson } from './view/galinaCharacter';
import { createSanyaPerson, createZinaPerson } from './view/queueBossCharacters';
import { createQueenPerson } from './view/queenCharacter';
import { createValeraPerson } from './view/valeraCharacter';
import type { Order } from './domain/orders';

export type ClientState = 'entering' | 'waiting' | 'leaving' | 'gone';

export interface ClientOptions {
  scene: THREE.Scene;
  id: number;
  archetype: Archetype;
  order: Order | null;
  patience: number;
  queueIndex: number;
  isBoss?: boolean;
  isMenu?: boolean;
}

export class Client {
  readonly id: number;
  readonly archetype: Archetype;
  isBoss: boolean;
  readonly isMenu: boolean;
  readonly rig: PersonRig;
  readonly root: THREE.Group;
  readonly label: CSS2DObject;
  readonly tagEl: HTMLDivElement;
  readonly nameEl: HTMLSpanElement;
  readonly barEl: HTMLDivElement;
  readonly bubbleEl: HTMLDivElement;

  order: Order | null;
  patience: number;
  maxPatience: number;
  patienceDrainMultiplier = 1;
  state: ClientState;
  queueIndex: number;
  hasShouted = false;
  /** Может ли этот клиент начать спор (ролл на спавне, со 2-й смены). */
  willArgue = false;
  /** Спор уже начался — повторно не запускаем. */
  argueTriggered = false;

  onPatienceZero?: (client: Client) => void;
  onGone?: (client: Client) => void;
  onLabelClick?: (client: Client) => void;

  private target: Vec2;
  private bubbleTimer = 0;
  private destroyed = false;
  private speed = 2.3;
  private doorPoint: Vec2 = { x: 1.8, z: 3.3 };
  private enteringThroughDoor = false;
  private entryPath: Vec2[] = [];
  private exitingThroughDoor = false;
  private exitWaypoint: Vec2 | null = null;

  constructor(options: ClientOptions) {
    this.id = options.id;
    this.archetype = options.archetype;
    this.isBoss = Boolean(options.isBoss);
    this.isMenu = Boolean(options.isMenu);
    this.order = options.order;
    this.patience = options.patience;
    this.maxPatience = options.patience;
    this.queueIndex = options.queueIndex;
    this.state = this.isMenu ? 'waiting' : 'entering';

    const style = this.archetype.id;
    const createRig = style === 'boss'
      ? createGalinaPerson
      : style === 'baba-zina'
        ? createZinaPerson
        : style === 'sanya'
          ? createSanyaPerson
          : style === 'fitting-queen'
            ? createQueenPerson
            : style === 'valera'
              ? createValeraPerson
              : isCharacterStyle(style)
                ? (options: Parameters<typeof createPerson>[0]) => createStyledPerson(options, style)
                : createPerson;
    this.rig = createRig({
      coat: this.archetype.coat,
      pants: this.archetype.pants,
      skin: this.archetype.skin,
      hair: this.archetype.hair,
      accent: this.archetype.accent,
      prop: this.archetype.prop,
      scale: this.archetype.scale,
      boss: this.isBoss,
      build: this.archetype.build,
      hairStyle: this.archetype.hairStyle,
      headwear: this.archetype.headwear,
      accessory: this.archetype.accessory,
    });
    this.root = this.rig.root;
    this.root.userData = { type: 'client', client: this };

    const start = this.isMenu
      ? QUEUE_SPOTS[Math.min(this.queueIndex, QUEUE_SPOTS.length - 1)]
      : ENTRY_POINT;
    this.root.position.set(start.x, 0, start.z);
    this.enteringThroughDoor = !this.isMenu;
    if (this.isMenu) {
      this.target = { ...QUEUE_SPOTS[Math.min(this.queueIndex, QUEUE_SPOTS.length - 1)] };
    } else {
      this.entryPath = [{ ...ENTRY_TURN_POINT }, { ...this.doorPoint }];
      this.target = this.entryPath.shift() ?? { ...this.doorPoint };
    }

    this.root.rotation.y = Math.PI - 0.15;

    const el = document.createElement('div');
    el.className = 'client-label';
    el.style.setProperty('--queue-position', String(this.queueIndex));
    if (this.isBoss) el.classList.add('boss');
    if (this.isMenu) el.classList.add('menu');

    const bubble = document.createElement('div');
    bubble.className = 'client-bubble';
    bubble.style.display = 'none';
    el.appendChild(bubble);

    const tag = document.createElement('div');
    tag.className = 'client-tag';
    const name = document.createElement('span');
    name.className = 'client-name';
    name.textContent = this.archetype.name;
    tag.appendChild(name);
    const bar = document.createElement('div');
    bar.className = 'client-patience';
    const fill = document.createElement('div');
    fill.className = 'client-patience-fill';
    bar.appendChild(fill);
    tag.appendChild(bar);
    el.appendChild(tag);

    this.bubbleEl = bubble;
    this.tagEl = tag;
    this.nameEl = name;
    this.barEl = fill;

    const label = new CSS2DObject(el);
    label.position.set(0, 2.18, 0);
    label.center.set(0.5, 1);
    // Пока клиент идёт по улице, не показываем ему бирку с именем.
    label.visible = this.isMenu;
    this.root.add(label);
    this.label = label;

    el.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onLabelClick?.(this);
    });

    options.scene.add(this.root);
  }

  get position(): Vec2 {
    return { x: this.root.position.x, z: this.root.position.z };
  }

  setQueueIndex(index: number): void {
    this.queueIndex = index;
    this.label.element.style.setProperty('--queue-position', String(index));
    const spot = QUEUE_SPOTS[Math.min(index, QUEUE_SPOTS.length - 1)];
    if (this.state === 'leaving' || this.state === 'gone') return;
    if (this.isMenu) {
      this.root.position.set(spot.x, 0, spot.z);
      this.target = { ...spot };
      return;
    }
    if (this.state === 'entering' && this.enteringThroughDoor) return;
    this.target = { ...spot };
  }

  preplaceAtFront(): void {
    const spot = QUEUE_SPOTS[0];
    this.root.position.set(spot.x, 0, spot.z);
    this.target = { ...spot };
    this.state = 'waiting';
    this.enteringThroughDoor = false;
    this.entryPath = [];
    this.exitWaypoint = null;
    this.label.visible = true;
    this.root.rotation.y = Math.PI - 0.14;
    this.updateBar();
  }

  /** Поставить персонажа в произвольную точку без очереди (финальный босс). */
  placeAt(point: Vec2, state: ClientState = 'waiting'): void {
    this.root.position.set(point.x, 0, point.z);
    this.target = { ...point };
    this.state = state;
    this.enteringThroughDoor = false;
    this.entryPath = [];
    this.exitWaypoint = null;
    this.label.visible = true;
    this.root.rotation.y = Math.PI;
    this.root.visible = true;
    this.label.element.style.display = '';
    this.updateBar();
  }

  /** Пройти к произвольной точке. */
  walkTo(point: Vec2): void {
    this.target = { ...point };
    this.state = 'entering';
    this.enteringThroughDoor = false;
    this.entryPath = [];
    this.exitWaypoint = null;
    this.label.visible = true;
    this.root.visible = true;
    this.label.element.style.display = '';
  }

  setTarget(target: boolean): void {
    this.tagEl.classList.toggle('target', target);
  }

  isAt(point: Vec2, eps = 0.18): boolean {
    return Math.hypot(this.root.position.x - point.x, this.root.position.z - point.z) <= eps;
  }

  setPatience(value: number): void {
    this.patience = clamp(value, 0, this.maxPatience);
    this.updateBar();
  }

  showBubble(text: string, duration = 2.8): void {
    this.bubbleEl.textContent = text;
    this.bubbleEl.style.display = 'block';
    this.bubbleEl.classList.remove('pop');
    void this.bubbleEl.offsetWidth;
    this.bubbleEl.classList.add('pop');
    this.bubbleTimer = duration;
  }

  hideBubble(): void {
    this.bubbleEl.style.display = 'none';
    this.bubbleTimer = 0;
    this.tagEl.classList.remove('shouting');
  }

  shout(text: string): void {
    this.showBubble(text, 3);
    this.tagEl.classList.add('shouting');
  }

  leave(_delay = 0): void {
    if (this.state === 'leaving' || this.state === 'gone') return;
    this.tagEl.classList.add('leaving');
    // Step out of the queue immediately so the next client never walks into us.
    this.beginExit();
  }

  private beginExit(): void {
    this.state = 'leaving';
    this.exitingThroughDoor = true;
    this.entryPath = [];
    this.exitWaypoint = { x: this.doorPoint.x, z: this.root.position.z };
    this.target = { ...this.doorPoint };
    this.tagEl.classList.add('leaving');
  }

  update(dt: number, time: number): void {
    if (this.destroyed || this.state === 'gone') return;

    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubbleEl.style.display = 'none';
        this.tagEl.classList.remove('shouting');
      }
    }

    if (this.isMenu) {
      this.root.rotation.y = Math.PI - 0.14 + (this.queueIndex % 3) * 0.07;
      this.rig.update(dt, false, time, 'idle');
      return;
    }

    if (this.state === 'entering' || this.state === 'waiting') {
      const dx = this.target.x - this.root.position.x;
      const dz = this.target.z - this.root.position.z;
      const dist = Math.hypot(dx, dz);
      const moving = dist > 0.045;

      if (moving) {
        const step = Math.min(this.speed * dt, dist);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;
        this.root.rotation.y = Math.atan2(dx, dz);
        this.rig.update(dt, true, time, 'idle');
      } else {
        if (this.state === 'entering') {
          if (this.entryPath.length > 0) {
            this.target = this.entryPath.shift() ?? this.target;
            this.rig.update(dt, false, time, 'idle');
            this.updateBar();
            return;
          }
          if (this.enteringThroughDoor) {
            this.enteringThroughDoor = false;
            this.label.visible = true;
            this.target = { ...QUEUE_SPOTS[Math.min(this.queueIndex, QUEUE_SPOTS.length - 1)] };
            this.rig.update(dt, false, time, 'idle');
            this.updateBar();
            return;
          }
          this.state = 'waiting';
          this.label.visible = true;
          this.root.rotation.y = this.isBoss
            ? Math.PI - 0.16
            : Math.PI - 0.14 + (this.queueIndex % 3) * 0.07;
        }
        this.patience = Math.max(0, this.patience - dt * this.patienceDrainMultiplier);
        this.updateBar();

        const ratio = this.patience / Math.max(1, this.maxPatience);
        const mood = this.isBoss ? 'angry' : ratio < 0.32 ? 'impatient' : 'idle';
        this.rig.update(dt, false, time, mood);

        if (this.patience <= 0 && !this.hasShouted) {
          this.hasShouted = true;
          this.onPatienceZero?.(this);
        }
      }
    } else if (this.state === 'leaving') {
      if (this.exitingThroughDoor) {
        const target = this.exitWaypoint ?? this.doorPoint;
        const dxDoor = target.x - this.root.position.x;
        const dzDoor = target.z - this.root.position.z;
        const doorDistance = Math.hypot(dxDoor, dzDoor);
        if (doorDistance < 0.08) {
          if (this.exitWaypoint) {
            this.exitWaypoint = null;
            return;
          }
          this.exitingThroughDoor = false;
          this.target = { ...EXIT_POINT };
          return;
        }
        const step = Math.min(this.speed * 1.25 * dt, doorDistance);
        this.root.position.x += (dxDoor / doorDistance) * step;
        this.root.position.z += (dzDoor / doorDistance) * step;
        this.root.rotation.y = Math.atan2(dxDoor, dzDoor);
        this.rig.update(dt, true, time, 'idle');
        return;
      }

      const dx = EXIT_POINT.x - this.root.position.x;
      const dz = EXIT_POINT.z - this.root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        this.state = 'gone';
        this.root.visible = false;
        this.label.element.style.display = 'none';
        this.onGone?.(this);
        return;
      }
      const step = Math.min(this.speed * 1.25 * dt, dist);
      this.root.position.x += (dx / dist) * step;
      this.root.position.z += (dz / dist) * step;
      this.root.rotation.y = Math.atan2(dx, dz);
      this.rig.update(dt, true, time, 'idle');
    }
  }

  private updateBar(): void {
    if (this.isBoss || this.isMenu) return;
    const ratio = clamp(this.patience / Math.max(1, this.maxPatience), 0, 1);
    this.barEl.style.width = `${ratio * 100}%`;
    this.barEl.style.background = ratio > 0.6 ? '#4caf6d' : ratio > 0.3 ? '#f0b429' : '#e05252';
    this.label.element.classList.toggle('impatient', ratio < 0.32);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeFromParent();
    this.label.element.remove();
    this.rig.dispose();
  }
}
