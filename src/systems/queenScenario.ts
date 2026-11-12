import type { Client } from '../client';
import type { Order } from '../domain/orders';
import type { Sound } from '../sound';
import type { UI } from '../ui';
import type { QueenSystem } from './queenSystem';

const FITTING_POINT = { x: 3.15, z: 2.8 };

/**
 * Host operations for the Queen scenario. Game owns the shared world, orders,
 * queue, service and fitting rooms; QueenScenario owns the Queen flow.
 */
export interface QueenScenarioHost {
  ui: UI;
  sound: Sound;
  nextBudget(): number;
  queenLine(): string;
  returnLine(): string;
  createOrder(maxItems: number): Order | null;
  releaseOrder(order: Order | null): void;
  createClient(order: Order): Client;
  addClient(client: Client): void;
  enqueueFront(client: Client): void;
  dequeue(client: Client): void;
  isServiceActive(): boolean;
  canTakeReturn(client: Client): boolean;
  beginReturnCarry(): void;
  orderCells(order: Order): string;
  addReputation(amount: number): void;
  clearFitting(resetTimers: boolean): void;
  occupyFitting(): void;
  refreshPatience(): void;
  updateHud(): void;
  updatePrompt(): void;
}

/**
 * Coordinates the Queen encounter: entrance, fitting walk, automatic return
 * with a new order or a parcel return, and the final exit.
 * Budget, fitting cooldown and return state remain in QueenSystem.
 */
export class QueenScenario {
  readonly queen: QueenSystem;
  private clientValue: Client | null = null;
  private walkingToFittingValue = false;

  private readonly host: QueenScenarioHost;

  constructor(host: QueenScenarioHost, queen: QueenSystem) {
    this.host = host;
    this.queen = queen;
  }

  get client(): Client | null {
    return this.clientValue;
  }

  get walkingToFitting(): boolean {
    return this.walkingToFittingValue;
  }

  spawn(): void {
    if (this.queen.spawned) return;
    const budget = this.host.nextBudget();
    const order = this.host.createOrder(Math.min(3, budget));
    if (!order) return; // update() retries without spawning an orderless client.
    this.queen.spawn(budget);

    const queen = this.host.createClient(order);
    this.clientValue = queen;
    this.host.addClient(queen);
    this.host.enqueueFront(queen);
    this.host.refreshPatience();
    this.host.ui.setQueenStatus(true, this.queen.budget);

    queen.rig.setCarry(false);
    queen.showBubble(this.host.queenLine(), 999);
    this.host.ui.banner(
      'Королева примерочной',
      'Она занимает примерочные, злит очередь и приносит возвраты.',
      3,
    );
    this.host.ui.toast('Королева примерочной уже здесь!', 'boss');
    this.host.sound.boss();
    this.host.updateHud();
    this.host.updatePrompt();
  }

  update(dt: number, canSpawn: boolean): void {
    if (canSpawn && !this.queen.spawned) this.spawn();
    if (!this.queen.active || !this.clientValue) return;
    const queen = this.clientValue;

    if (this.walkingToFittingValue) {
      if (queen.state === 'waiting' && queen.isAt(FITTING_POINT, 0.2)) {
        this.enterFitting();
      }
      return;
    }

    if (queen.state === 'gone') {
      // Пока игрок несёт возврат, Королева ждёт, а не возвращается с новым заказом.
      if (this.queen.returnInHand) return;
      this.queen.tickCooldown(dt);
      // Если игрок в этот момент обслуживает другого клиента, Королева
      // остаётся в примерочной и ждёт, а не зависает навсегда.
      if (this.queen.readyToReturn && !this.host.isServiceActive()) {
        if (this.queen.nextReturn) this.returnQueenWithReturn();
        else this.returnQueen();
      }
      return;
    }

    // Пока Королева стоит с возвратом, она не меняет заказ и не врывается:
    // игрок должен забрать возврат и отнести его в шкафчик.
    if (queen.state !== 'waiting') return;
  }

  sendToFitting(): void {
    const queen = this.clientValue;
    if (!queen || this.walkingToFittingValue) return;
    this.host.dequeue(queen);
    queen.hideBubble();
    queen.setTarget(false);
    queen.rig.setCarry(false);
    queen.walkTo(FITTING_POINT);
    this.walkingToFittingValue = true;
    this.host.clearFitting(false);
    this.host.refreshPatience();
    this.host.ui.toast(
      'Королева идёт в примерочную. Она может вернуться с возвратом.',
      'boss',
    );
  }

  private enterFitting(): void {
    this.walkingToFittingValue = false;
    const queen = this.clientValue;
    if (!queen) return;
    queen.hideBubble();
    queen.rig.setCarry(false);
    queen.state = 'gone';
    queen.root.visible = true;
    queen.label.visible = true;
    queen.root.position.set(FITTING_POINT.x, 0, FITTING_POINT.z);
    queen.root.rotation.y = -0.4;
    this.queen.startFitting(6);
    this.host.occupyFitting();
    this.host.refreshPatience();
    this.host.ui.toast(
      'Королева заняла обе примерочные. Она может вернуться с возвратом.',
      'boss',
    );
  }

  returnQueen(): void {
    const queen = this.clientValue;
    if (!queen || !this.queen.active) return;
    this.host.releaseOrder(queen.order);
    const order = this.host.createOrder(Math.min(3, this.queen.budget));
    if (!order) return; // Keep the fitting cooldown ready; update() retries.
    this.queen.beginReturn(false);
    this.host.clearFitting(true);
    this.host.refreshPatience();
    queen.order = order;
    queen.setPatience(999);
    queen.state = 'entering';
    queen.root.visible = true;
    queen.label.visible = true;
    // Выходит из примерочной, а не телепортируется к стойке.
    queen.root.position.set(FITTING_POINT.x, 0, FITTING_POINT.z);
    queen.root.rotation.y = -0.4;
    queen.rig.setCarry(false);
    queen.showBubble(this.host.queenLine(), 2);
    this.host.enqueueFront(queen);
    this.host.refreshPatience();
    this.host.ui.banner('Королева вернулась', 'Она снова впереди и с новыми товарами.', 2.2);
    this.host.ui.toast(`Королева требует ${this.host.orderCells(queen.order)}`, 'boss');
    this.host.updateHud();
    this.host.updatePrompt();
  }

  private returnQueenWithReturn(): void {
    const queen = this.clientValue;
    if (!queen || !this.queen.active) return;
    this.queen.beginReturn(true);
    this.host.clearFitting(true);
    this.host.refreshPatience();
    this.host.releaseOrder(queen.order);
    queen.order = null;
    queen.setPatience(999);
    queen.state = 'entering';
    queen.root.visible = true;
    queen.label.visible = true;
    // Выходит из примерочной с возвратом, а не телепортируется к стойке.
    queen.root.position.set(FITTING_POINT.x, 0, FITTING_POINT.z);
    queen.root.rotation.y = -0.4;
    queen.rig.setCarry(true, '#d95d5d');
    queen.showBubble(this.host.returnLine(), 999);
    this.host.enqueueFront(queen);
    this.host.refreshPatience();
    this.host.ui.banner(
      'Королева вернулась с возвратом',
      'Заберите возврат и отнесите его в шкафчик «Возврат».',
      3,
    );
    this.host.ui.toast('Королева принесла возврат!', 'boss');
    this.host.sound.boss();
    this.host.updateHud();
    this.host.updatePrompt();
  }

  finish(): void {
    const queen = this.clientValue;
    this.queen.finish();
    this.walkingToFittingValue = false;
    this.host.clearFitting(true);
    if (queen) {
      this.host.dequeue(queen);
      queen.leave(0);
    }
    this.clientValue = null;
    this.host.ui.setQueenStatus(false, 0);
    this.host.refreshPatience();
    this.host.ui.banner(
      'Королева ушла',
      'Примерочные открыты. Обычные клиенты тоже могут ими пользоваться.',
      3,
    );
    this.host.addReputation(0.5);
    this.host.sound.win();
    this.host.updateHud();
    this.host.updatePrompt();
  }

  takeReturn(): void {
    const queen = this.clientValue;
    if (!queen || !this.queen.hasReturn) return;
    if (!this.host.canTakeReturn(queen)) return;

    this.queen.takeReturn();
    this.host.dequeue(queen);
    queen.hideBubble();
    queen.rig.setCarry(false);
    queen.state = 'gone';
    queen.root.visible = false;
    queen.label.visible = false;
    this.host.beginReturnCarry();
  }

  /** Remove the Queen from results without playing her exit animation. */
  clearForResults(): void {
    const queen = this.clientValue;
    if (queen) {
      this.host.dequeue(queen);
      this.host.releaseOrder(queen.order);
      queen.root.visible = false;
      queen.label.visible = false;
      queen.hideBubble();
    }
    this.reset();
  }

  /** Reset the Queen and forget her client, e.g. for a new shift or the menu. */
  reset(): void {
    this.stop();
    this.clientValue = null;
  }

  /** Reset the Queen state but keep the current client (game over keeps her on screen). */
  stop(): void {
    this.queen.reset();
    this.walkingToFittingValue = false;
  }
}
