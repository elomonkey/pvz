import * as THREE from 'three';
import {
  ARCHETYPES,
  BABA_ARCHETYPE,
  BOSS_ARCHETYPE,
  BOSS_ARGUE_LINES,
  BOSS_LINES,
  BOSS_LOSE_LINE,
  BOSS_SERVED_LINE,
  BOSS_WIN_LINE,
  CLIENT_ARGUE_CONCEDE_LINES,
  CLIENT_ARGUE_LINES,
  CLIENT_ARGUE_LOSE_LINES,
  CLIENT_ARGUE_TAUNTS,
  CLIENT_ARGUE_WIN_LINES,
  DECOR_ITEMS,
  FINAL_BOSS_ENTRANCE_LINES,
  FINAL_BOSS_FITTING_LINES,
  FINAL_BOSS_MID_LINES,
  GALYA_SHOUT_LINES,
  MAX_QUEUE,
  QUEEN_ARCHETYPE,
  QUEEN_LINES,
  QUEEN_RETURN_LINES,
  RETURN_POINT,
  SANYA_ARCHETYPE,
  SHIFT_STORIES,
  VALERA_ARCHETYPE,
  ZINA_BARCODE_SEGMENTS,
  ZINA_FILLER_TILE,
  ZINA_INTRO_LINES,
  ZINA_LOSE_LINE,
  ZINA_WIN_LINE,
  PLAYER_START,
  QUEUE_SPOTS,
  SERVICE_POINT,
  SHELF_DEFS,
  SHELF_LETTERS,
  THANKS_LINES,
  UPGRADES,
  clamp,
  createDecorState,
  pick,
  randInt,
  type Archetype,
  type BossDialogueLine,
  type DecorId,
  type DecorOwnership,
  type UpgradeId,
  type Vec2,
} from './data';
import { Client } from './client';
import { EventBus } from './core/eventBus';
import type { GameEvents } from './domain/events';
import { createOrderRecord, type Order, type OrderItem } from './domain/orders';
import { allocateOrderItems } from './domain/orderAllocation';
import {
  CLIENT_ARGUE_MASH_TIME,
  CLIENT_ARGUE_WIN_THRESHOLD,
  calculateArgueStartValue,
  calculateConcedeStress,
  calculateExpectedServeStress,
  calculateServeStress,
  rollsClientArgument,
} from './domain/arguments';
import { bossKindForShift } from './domain/bosses';
import { QUEST_REWARD, evaluateShift, upgradeCost } from './domain/economy';
import { ShiftProgression } from './domain/progression';
import { QuestLog, type QuestId } from './domain/quests';
import { RunState } from './domain/run';
import {
  areMultiOrdersEnabled,
  getShiftSteps,
  getWavePlan,
  isFittingActive,
} from './domain/shifts';
import { createPerson, type PersonRig } from './view/characters';
import { PointerController } from './input/pointerController';
import { PlayerMovement } from './systems/playerMovement';
import { NavGrid } from './nav';
import { ArgumentSystem, type MashState } from './systems/argumentSystem';
import { BossEncounter } from './systems/bossEncounter';
import {
  ScannerPanelSystem,
  buildCellPanelModel,
  cellPanelKeyFor,
} from './systems/scannerPanelSystem';
import { ServiceSystem, type ServiceSession } from './systems/serviceSystem';
import { EncounterCoordinator, type EncounterPhase } from './systems/encounterCoordinator';
import { FinalBossSystem } from './systems/finalBossSystem';
import { QueenScenario } from './systems/queenScenario';
import { QueenSystem } from './systems/queenSystem';
import { ShiftDirector } from './systems/shiftDirector';
import { WarehouseState, type WarehouseCell } from './systems/warehouseSystem';
import { ZinaPuzzleSystem, ZINA_PUZZLE_TIME } from './systems/zinaPuzzleSystem';
import { createWorld, type World } from './view/scene';
import {
  loadArgueIntroSeen,
  loadBest,
  loadDecorIds,
  loadResultsIntroSeen,
  loadScannerBreakSeen,
  loadShift4IntroSeen,
  loadTutorialDone,
  resetTutorialProgress,
  saveArgueIntroSeen,
  saveBest,
  saveDecorIds,
  saveResultsIntroSeen,
  saveScannerBreakSeen,
  saveShift4IntroSeen,
  saveTutorialDone,
} from './yandex';
import type { Sound } from './sound';
import type { UI } from './ui';

type TutorialStep =
  | 'welcome'
  | 'click_client'
  | 'scan'
  | 'shelf'
  | 'cell'
  | 'deliver'
  | 'done';

type MechanicCardId = 'argue' | 'shift4';

interface MechanicCard {
  id: MechanicCardId;
  kicker: string;
  title: string;
  text: string;
}

type PendingAction =
  | { type: 'service'; client: Client }
  | { type: 'shelf'; shelfIndex: number }
  | { type: 'return-shelf' }
  | { type: 'toy' };

interface WaveConfig {
  archetype: Archetype;
  patience: number;
  mixed: boolean;
}

const PLAYER_SPEED = 3.15;

export class Game {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly ui: UI;
  private readonly sound: Sound;
  private readonly nav = new NavGrid();
  private readonly director = new ShiftDirector();
  private readonly world: World;
  private readonly player: PersonRig;
  private readonly playerRoot: THREE.Group;
  private readonly marker: THREE.Mesh;
  private readonly markerMaterial: THREE.MeshBasicMaterial;
  private readonly pointerController: PointerController;
  private readonly warehouse: WarehouseState;

  private readonly movement = new PlayerMovement(PLAYER_START);
  private pendingAction: PendingAction | null = null;
  private readonly events = new EventBus<GameEvents>();
  private readonly announcedQuests = new Set<QuestId>();

  private clients: Client[] = [];
  private queue: Client[] = [];
  private readonly service = new ServiceSystem<Client>();
  private readonly scannerPanel = new ScannerPanelSystem<Client>();

  private readonly encounter = new EncounterCoordinator();
  private get phase(): EncounterPhase {
    return this.encounter.phase;
  }
  private get modalOpen(): boolean {
    return this.encounter.modalOpen;
  }
  private get helpOpen(): boolean {
    return this.encounter.helpOpen;
  }
  private get tutorialOpen(): boolean {
    return this.encounter.tutorialOpen;
  }
  private get mechanicCardOpen(): boolean {
    return this.encounter.mechanicCardOpen;
  }
  private get scannerBreakCardOpen(): boolean {
    return this.encounter.scannerBreakCardOpen;
  }
  private tutorialActive = false;
  private tutorialPending = false;
  private tutorialStep: TutorialStep = 'welcome';
  private mechanicCardPending: MechanicCard | null = null;
  private mechanicCardTimer = 0;
  private tutorialMarker!: THREE.Group;
  private tutorialMarkerRing!: THREE.Mesh;
  private tutorialMarkerArrow!: THREE.Mesh;
  private tutorialMarkerBaseY = 1.5;
  private time = 0;

  private readonly run = new RunState();
  private best = 0;
  private readonly questLog = new QuestLog();
  private questUiTimer = 0;
  private shiftFailed = false;
  private ownedDecor: DecorOwnership = createDecorState();

  private spawnQueue: WaveConfig[] = [];
  private spawnTimer = 0;
  private spawnInterval = 2;
  private eventUsed = false;

  private readonly progression = new ShiftProgression();

  private nextClientId = 1;
  private bossClient: Client | null = null;
  private readonly boss = new BossEncounter();
  private readonly argumentSystem = new ArgumentSystem();
  private argueClient: Client | null = null;
  private readonly zina = new ZinaPuzzleSystem();
  private zinaOrderPending = false;
  private zinaPendingCellId: string | null = null;
  private scannerBroken = false;
  private scannerBreakPending = false;
  private highlightEnabled = true;
  private pendingGameOver = false;

  private readonly queenScenario: QueenScenario;
  private get queen() {
    return this.queenScenario.queen;
  }
  private get queenClient(): Client | null {
    return this.queenScenario.client;
  }
  private get queenWalkingToFitting(): boolean {
    return this.queenScenario.walkingToFitting;
  }
  private fittingActive = false;
  private fittingOccupied = [false, false];
  private fittingTimers = [0, 0];
  private fittingFull = false;

  private readonly finalBoss = new FinalBossSystem();
  private finalBossGalya: Client | null = null;
  private finalBossValera: Client | null = null;
  private finalBossOrder: Order | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.OrthographicCamera,
    renderer: THREE.WebGLRenderer,
    ui: UI,
    sound: Sound,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.ui = ui;
    this.sound = sound;
    this.world = createWorld(scene);
    this.warehouse = new WarehouseState(
      this.world.cells.map((cell) => ({
        id: cell.id,
        shelfIndex: cell.shelfIndex,
        column: cell.column,
        level: cell.level,
        color: cell.color,
      })),
    );
    this.queenScenario = new QueenScenario({
      ui: this.ui,
      sound: this.sound,
      nextBudget: () => randInt(20, 30),
      queenLine: () => pick(QUEEN_LINES),
      returnLine: () => pick(QUEEN_RETURN_LINES),
      createOrder: (maxItems) => this.createOrder(false, maxItems),
      releaseOrder: (order) => this.releaseOrder(order),
      createClient: (order) => this.createQueenClient(order),
      addClient: (client) => {
        this.clients.push(client);
      },
      enqueueFront: (client) => {
        this.queue.unshift(client);
        this.updateQueue();
      },
      dequeue: (client) => this.removeFromQueue(client),
      isServiceActive: () => this.service.hasActive,
      canTakeReturn: (client) => this.canTakeQueenReturn(client),
      beginReturnCarry: () => this.beginQueenReturnCarry(),
      orderCells: (order) => this.orderCellList(order),
      addReputation: (amount) => this.addReputation(amount),
      clearFitting: (resetTimers) => this.clearFittingRooms(resetTimers),
      occupyFitting: () => this.occupyQueenFitting(),
      refreshPatience: () => this.updatePatienceMultipliers(),
      updateHud: () => this.updateHud(),
      updatePrompt: () => this.updatePrompt(),
    }, new QueenSystem());

    this.player = createPerson({
      coat: '#2d5f9a',
      pants: '#263238',
      skin: '#e8b98f',
      hair: '#3b2a20',
      accent: '#f2b134',
      cap: true,
      scale: 1.02,
      build: 'regular',
      hairStyle: 'short',
      headwear: 'cap',
      accessory: 'lanyard',
    });
    this.playerRoot = this.player.root;
    this.playerRoot.position.set(PLAYER_START.x, 0, PLAYER_START.z);
    this.scene.add(this.playerRoot);

    const markerGeometry = new THREE.RingGeometry(0.22, 0.34, 28);
    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd166',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.marker = new THREE.Mesh(markerGeometry, this.markerMaterial);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.marker.visible = false;
    this.marker.raycast = () => {};
    this.scene.add(this.marker);

    const tutorialGroup = new THREE.Group();
    tutorialGroup.visible = false;

    const tutorialRing = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.5, 32),
      new THREE.MeshBasicMaterial({
        color: '#ffd166',
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    tutorialRing.rotation.x = -Math.PI / 2;
    tutorialRing.position.y = 0.035;
    tutorialRing.raycast = () => {};
    tutorialGroup.add(tutorialRing);

    const tutorialArrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.34, 8),
      new THREE.MeshBasicMaterial({ color: '#ffd166' }),
    );
    tutorialArrow.rotation.x = Math.PI;
    tutorialArrow.position.y = this.tutorialMarkerBaseY;
    tutorialArrow.raycast = () => {};
    tutorialGroup.add(tutorialArrow);

    this.scene.add(tutorialGroup);
    this.tutorialMarker = tutorialGroup;
    this.tutorialMarkerRing = tutorialRing;
    this.tutorialMarkerArrow = tutorialArrow;

    this.pointerController = new PointerController({
      canvas: this.renderer.domElement,
      labelsLayer: document.getElementById('labels-layer'),
      camera: this.camera,
      scene: this.scene,
      isBlocked: () => this.encounter.inputBlocked,
      onPick: (data, point) => this.handleClickData(data, point),
      onToyLabel: () => this.moveTo(SERVICE_POINT, { type: 'toy' }),
    });

    this.bindEvents();
  }

  private bindEvents(): void {
    this.events.on('clientServed', () => {
      this.questLog.onDelivery();
      this.refreshQuestUi();
    });
    this.events.on('clientLost', () => {
      this.questLog.onClientLost();
      this.refreshQuestUi();
    });
    this.events.on('returnDeposited', () => {
      this.questLog.onReturnDeposited();
      this.refreshQuestUi();
    });
    this.events.on('bossDefeated', () => {
      this.questLog.onBossDefeated();
      this.refreshQuestUi();
    });
    this.events.on('argumentResolved', ({ won }) => {
      if (won) this.sound.win();
      else this.sound.lose();
    });
    this.events.on('shiftStarted', () => {
      this.generateQuests();
    });
    this.events.on('shiftEnded', ({ money }) => {
      this.best = Math.max(this.best, money);
      saveBest(this.best);
      this.ui.setBest(this.best);
    });
  }

  start(): void {
    this.best = loadBest();
    this.ui.setBest(this.best);
    this.ownedDecor = this.createRunDecor();
    this.world.applyDecor(this.ownedDecor);
    this.setupMenu();
    this.ui.showStart(this.best);
    this.ui.updateStress(0);
    this.updateHud();
  }

  setBest(best: number): void {
    if (best > this.best) {
      this.best = best;
      this.ui.setBest(best);
    }
  }

  private startTutorial(): void {
    this.tutorialActive = true;
    this.tutorialPending = false;
    this.encounter.openTutorial();
    this.encounter.openModal();
    this.tutorialStep = 'welcome';
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;
    this.ui.closePanels();
    this.ui.setTutorialTarget(null);
    this.clearTutorialMarker();
    this.updatePatienceMultipliers();
    this.ui.showTutorial({
      mode: 'welcome',
      kicker: 'ОБУЧЕНИЕ · СМЕНА 1',
      title: 'Выдайте первую посылку',
      text: 'Клиент у стойки ждёт заказ. Сейчас вы пройдёте весь путь: клиент → сканер → склад → ячейка → выдача. Обучение займёт меньше минуты.',
      nextLabel: 'Начать',
      showNext: true,
    });
    this.ui.setPrompt('');
  }

  onTutorialNext(): void {
    if (this.mechanicCardOpen) {
      this.encounter.closeMechanicCard();
      this.encounter.closeModal();
      this.ui.hideTutorial();
      this.updatePrompt();
      return;
    }
    if (this.scannerBreakCardOpen) {
      this.encounter.closeScannerBreakCard();
      this.encounter.closeModal();
      this.ui.hideTutorial();
      this.updatePrompt();
      return;
    }
    if (!this.tutorialActive) return;
    if (this.tutorialStep === 'welcome') {
      this.encounter.closeModal();
      this.encounter.openTutorial();
      this.setTutorialStep('click_client');
      return;
    }
    if (this.tutorialStep === 'done') {
      this.finishTutorial();
    }
  }

  skipTutorial(): void {
    if (!this.tutorialActive) return;
    this.tutorialActive = false;
    this.encounter.closeTutorial();
    this.encounter.closeModal();
    this.tutorialStep = 'welcome';
    this.clearTutorialMarker();
    this.ui.setTutorialTarget(null);
    this.ui.hideTutorial();
    saveTutorialDone();
    this.updatePatienceMultipliers();
    this.updatePrompt();
    this.ui.toast('Обучение пропущено. Подсказки останутся внизу.', 'info');
  }

  private finishTutorial(): void {
    this.tutorialActive = false;
    this.encounter.closeTutorial();
    this.encounter.closeModal();
    this.tutorialStep = 'welcome';
    this.clearTutorialMarker();
    this.ui.setTutorialTarget(null);
    this.ui.hideTutorial();
    saveTutorialDone();
    this.updatePatienceMultipliers();
    this.updatePrompt();
    this.ui.toast('Обучение завершено. Дальше — сами!', 'success');
  }

  private showScannerBreakCard(): void {
    this.encounter.openScannerBreakCard();
    this.encounter.openModal();
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;
    saveScannerBreakSeen();
    this.ui.showTutorial({
      mode: 'done',
      kicker: 'СОБЫТИЕ · СКАНЕР',
      title: 'Галя разбила сканер',
      text: 'Подсветка ячеек отключена: теперь нужную колонку придётся искать самому. Новый сканер можно купить в магазине после смены за 5000 ₽ — он вернёт подсветку.',
      nextLabel: 'Понятно',
      showNext: true,
    });
    this.ui.setPrompt('');
  }

  private setTutorialStep(step: TutorialStep): void {
    this.tutorialStep = step;
    const order = this.service.active?.order;

    if (step === 'click_client') {
      this.encounter.closeModal();
      this.encounter.openTutorial();
      this.ui.setTutorialTarget(null);
      this.ui.showTutorial({
        mode: 'coach',
        kicker: 'ШАГ 1 · КЛИЕНТ',
        title: 'Кликните по клиенту',
        text: 'Первый клиент стоит у стойки. Нажмите на него — герой подойдёт и откроет сканер.',
        progress: '1 / 5',
        showNext: false,
      });
      const client = this.queue[0];
      if (client) {
        this.setTutorialMarker(
          { x: client.root.position.x, z: client.root.position.z },
          2.25,
        );
      } else {
        this.clearTutorialMarker();
      }
    } else if (step === 'scan') {
      this.encounter.closeModal();
      this.encounter.openTutorial();
      this.ui.setTutorialTarget(null);
      this.ui.showTutorial({
        mode: 'coach',
        kicker: 'ШАГ 2 · СКАНЕР',
        title: 'Отсканируйте заказ',
        text: 'Когда откроется сканер, удерживайте кнопку «Сканировать заказ», пока не появится номер ячейки.',
        progress: '2 / 5',
        showNext: false,
      });
      this.setTutorialMarker(SERVICE_POINT, 1.7);
    } else if (step === 'shelf') {
      this.encounter.closeModal();
      this.encounter.openTutorial();
      this.ui.setTutorialTarget(null);
      const letter = order ? SHELF_LETTERS[order.shelf] : 'A';
      const cellId = order?.cellId ?? '';
      this.ui.showTutorial({
        mode: 'coach',
        kicker: 'ШАГ 3 · СКЛАД',
        title: `Идите к стеллажу ${letter}`,
        text: `Нужна ячейка ${cellId}. Стеллаж ${letter} — на складе за дверью. Нажмите на него, когда подойдёте.`,
        progress: '3 / 5',
        showNext: false,
      });
      if (order) {
        this.setTutorialMarker(this.world.shelves[order.shelf].interaction, 2.7);
      } else {
        this.clearTutorialMarker();
      }
    } else if (step === 'cell') {
      this.encounter.closeModal();
      this.encounter.openTutorial();
      this.clearTutorialMarker();
      this.ui.showTutorial({
        mode: 'coach',
        kicker: 'ШАГ 4 · ЯЧЕЙКА',
        title: `Выберите ячейку ${order?.cellId ?? ''}`,
        text: 'В панели справа нажмите на подсвеченную ячейку. Она совпадает с номером из сканера.',
        progress: '4 / 5',
        showNext: false,
      });
      this.ui.setTutorialTarget('cell', order?.cellId);
    } else if (step === 'deliver') {
      this.encounter.closeModal();
      this.encounter.openTutorial();
      this.ui.setTutorialTarget(null);
      this.ui.showTutorial({
        mode: 'coach',
        kicker: 'ШАГ 5 · ВЫДАЧА',
        title: 'Выдайте посылку',
        text: 'Вернитесь к стойке и нажмите на клиента. Зарплата начислится в конце смены.',
        progress: '5 / 5',
        showNext: false,
      });
      this.setTutorialMarker(SERVICE_POINT, 1.7);
    } else if (step === 'done') {
      this.encounter.openModal();
      this.encounter.openTutorial();
      this.clearTutorialMarker();
      this.ui.setTutorialTarget(null);
      this.ui.showTutorial({
        mode: 'done',
        kicker: 'ГОТОВО',
        title: 'Первая выдача готова!',
        text: 'Зарплата начислится в конце смены. Дальше будут ещё клиенты и проверяющая. Следите за терпением: ушедший клиент добавляет стресс, а 100% — заявление на увольнение. Мини-квесты дают бонус к зарплате, игрушка на стойке снижает стресс. Удачи!',
        nextLabel: 'Продолжить',
        showNext: true,
      });
    }

    this.updatePrompt();
  }

  private onTutorialAction(
    action:
      | 'client_clicked'
      | 'scanner_opened'
      | 'scanned'
      | 'cell_panel_opened'
      | 'parcel_taken'
      | 'delivered',
  ): void {
    if (!this.tutorialActive) return;
    const step = this.tutorialStep;

    if (action === 'client_clicked' && step === 'click_client') {
      this.setTutorialStep('scan');
      return;
    }
    if (action === 'scanner_opened' && (step === 'click_client' || step === 'scan')) {
      if (step !== 'scan') this.setTutorialStep('scan');
      this.ui.setTutorialTarget('scan');
      return;
    }
    if (action === 'scanned' && (step === 'click_client' || step === 'scan')) {
      this.ui.setTutorialTarget(null);
      this.setTutorialStep('shelf');
      return;
    }
    if (action === 'cell_panel_opened' && (step === 'shelf' || step === 'scan')) {
      this.setTutorialStep('cell');
      return;
    }
    if (action === 'parcel_taken' && (step === 'cell' || step === 'shelf')) {
      this.setTutorialStep('deliver');
      return;
    }
    if (action === 'delivered') {
      this.setTutorialStep('done');
    }
  }

  private setTutorialMarker(position: Vec2, height: number): void {
    this.tutorialMarker.position.set(position.x, 0, position.z);
    this.tutorialMarkerBaseY = height;
    this.tutorialMarkerArrow.position.y = height;
    this.tutorialMarker.visible = true;
  }

  private clearTutorialMarker(): void {
    this.tutorialMarker.visible = false;
  }

  private pendingMechanicCard(shift: number): MechanicCard | null {
    if (shift === 2 && !loadArgueIntroSeen()) {
      return {
        id: 'argue',
        kicker: 'НОВОЕ · СМЕНА 2',
        title: 'Клиенты могут спорить',
        text: 'Иногда клиент начинает спор. «Уступить» сразу добавляет стресс, «Спорить» — серия тапов; победа снижает стресс и добавляет репутацию. «Обаяние» снижает стресс от уступки и даёт фору в споре.',
      };
    }
    if (shift === 4 && !loadShift4IntroSeen()) {
      return {
        id: 'shift4',
        kicker: 'НОВОЕ · СМЕНА 4',
        title: 'Четвёртая смена: что нового',
        text: 'Заказы теперь могут состоять из нескольких ячеек: соберите все посылки и только потом идите к клиенту. В зале открылись две примерочные: занятые кабинки злят очередь, а Королева может занять обе.',
      };
    }
    return null;
  }

  private showMechanicCard(): void {
    const card = this.mechanicCardPending;
    if (!card) return;
    this.mechanicCardPending = null;
    this.mechanicCardTimer = 0;
    this.encounter.openMechanicCard();
    this.encounter.openModal();
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;
    if (card.id === 'argue') saveArgueIntroSeen();
    else saveShift4IntroSeen();
    this.ui.closePanels();
    this.ui.showTutorial({
      mode: 'done',
      kicker: card.kicker,
      title: card.title,
      text: card.text,
      nextLabel: 'Понятно',
      showNext: true,
    });
    this.ui.setPrompt('');
  }

  private updateTutorialMarker(): void {
    if (!this.tutorialActive) {
      this.tutorialMarker.visible = false;
      return;
    }

    if (this.tutorialStep === 'click_client') {
      const client = this.queue[0];
      if (!client) {
        this.tutorialMarker.visible = false;
        return;
      }
      this.tutorialMarker.visible = true;
      this.tutorialMarkerBaseY = 2.25;
      this.tutorialMarkerArrow.position.y = 2.25;
      this.tutorialMarker.position.x = client.root.position.x;
      this.tutorialMarker.position.z = client.root.position.z;
    }

    if (!this.tutorialMarker.visible) return;
    const pulse = 1 + Math.sin(this.time * 4) * 0.1;
    this.tutorialMarkerRing.scale.set(pulse, pulse, 1);
    this.tutorialMarkerArrow.position.y =
      this.tutorialMarkerBaseY + Math.sin(this.time * 4) * 0.12;
  }

  debugSetShift(shift: number): void {
    if (this.isGameOver()) return;
    if (!Number.isInteger(shift) || shift < 1 || shift > 5) return;
    this.ui.hideStart();
    this.tutorialActive = false;
    this.encounter.closeTutorial();
    this.tutorialPending = false;
    this.encounter.closeModal();
    this.encounter.closeHelp();
    this.clearTutorialMarker();
    this.ui.setTutorialTarget(null);
    this.ui.hideTutorial();
    this.beginShift(shift);
  }

  debugAddMoney(amount: number): void {
    this.run.money += amount;
    this.updateHud();
    if (this.phase === 'results') {
      this.ui.updateShop(this.run.upgrades, this.run.money, this.ownedDecor, this.scannerBroken);
    }
  }

  debugBoss(): void {
    if (this.isGameOver()) return;
    this.encounter.closeModal();
    this.ui.hideAllModals();
    if (this.run.shift >= 5) {
      this.encounter.enterPlaying();
      this.spawnFinalBoss();
      return;
    }
    if (this.run.shift >= 4) {
      this.encounter.enterPlaying();
      this.spawnQueen();
      return;
    }
    const index = this.director.findBossIndex();
    if (index < 0) return;
    this.director.jumpTo(index);
    this.spawnBoss();
  }

  debugShowMenu(): void {
    this.restartGame();
  }

  debugTutorialEnabled(): boolean {
    return (
      !loadTutorialDone() ||
      !loadResultsIntroSeen() ||
      !loadArgueIntroSeen() ||
      !loadShift4IntroSeen() ||
      !loadScannerBreakSeen()
    );
  }

  debugEnableTutorial(): void {
    resetTutorialProgress();
    this.ui.hideStart();
    this.startNewGame();
  }

  debugDisableTutorial(): void {
    saveTutorialDone();
    saveResultsIntroSeen();
    saveArgueIntroSeen();
    saveShift4IntroSeen();
    saveScannerBreakSeen();
    this.tutorialPending = false;
    this.mechanicCardPending = null;
    this.mechanicCardTimer = 0;
    if (this.mechanicCardOpen) {
      this.encounter.closeMechanicCard();
      this.encounter.closeModal();
      this.ui.hideTutorial();
      this.updatePrompt();
    }
    if (!this.tutorialActive) return;
    this.tutorialActive = false;
    this.encounter.closeTutorial();
    this.tutorialStep = 'welcome';
    this.encounter.closeModal();
    this.clearTutorialMarker();
    this.ui.setTutorialTarget(null);
    this.ui.hideTutorial();
    this.updatePatienceMultipliers();
    this.updatePrompt();
  }

  private isGameOver(): boolean {
    return this.phase === 'gameover';
  }

  update(dt: number): void {
    this.time += dt;
    this.updateWorldAnimations(dt);
    // Results block gameplay, but leaving clients still need to finish their exit
    // and call onGone/destroy instead of staying in 'leaving' forever.
    if (this.phase === 'results') {
      for (const client of [...this.clients]) client.update(dt, this.time);
      return;
    }
    if (this.isGameOver()) return;

    if (this.questLog.active && (this.phase === 'playing' || this.phase === 'boss' || this.phase === 'break')) {
      this.questUiTimer -= dt;
      if (this.questUiTimer <= 0) {
        this.questUiTimer = 0.5;
        this.refreshQuestUi();
      }
    }

    if (this.helpOpen) return;

    if (!this.modalOpen && this.phase === 'break' && this.mechanicCardTimer > 0) {
      this.mechanicCardTimer -= dt;
      if (this.mechanicCardTimer <= 0) this.showMechanicCard();
    }

    if (this.modalOpen) {
      if (this.argumentSystem.active) this.updateBossArgue(dt);
      else if (this.zina.active) this.updateZinaGame(dt);
      return;
    }

    if (this.phase === 'playing' || this.phase === 'boss' || this.phase === 'break') {
      this.updateFittingRooms(dt);
      this.updateQueen(dt);
    }

    if (this.run.buffTimer > 0) {
      this.run.buffTimer = Math.max(0, this.run.buffTimer - dt);
      this.ui.setBuff(this.run.buffTimer);
      if (this.run.buffTimer === 0) this.ui.setScanSpeed(this.baseScanSpeed());
    }
    if (this.scannerPanel.scanTarget && !this.playerNearService()) {
      this.scannerPanel.closeScanner();
      this.ui.closeScanner();
    }

    if (this.phase === 'menu') {
      for (const client of [...this.clients]) client.update(dt, this.time);
      this.player.update(dt, false, this.time, 'idle');
      return;
    }

    if (this.phase === 'gameover') return;

    if (this.phase === 'playing' || this.phase === 'boss') {
      this.updatePlayer(dt);
      for (const client of [...this.clients]) {
        client.update(dt, this.time);
        if (this.isGameOver()) return;
      }
      this.updateSpawning(dt);
      this.updateBossApproach();
      this.updateFinalBoss(dt);
      if (this.isGameOver()) return;
      this.updateProximity();
      this.checkWaveComplete();
      this.updatePrompt();
    } else if (this.phase === 'break') {
      this.updatePlayer(dt);
      for (const client of [...this.clients]) {
        client.update(dt, this.time);
        if (this.isGameOver()) return;
      }
      this.updateBreak(dt);
      this.updateProximity();
      this.updatePrompt();
    }
  }

  private createRunDecor(): DecorOwnership {
    const decor = createDecorState();
    const saved = new Set(loadDecorIds());
    for (const item of DECOR_ITEMS) {
      if (item.permanent && saved.has(item.id)) decor[item.id] = true;
    }
    return decor;
  }

  private generateQuests(): void {
    this.announcedQuests.clear();
    this.questLog.generate(this.run.shift, this.scannerWorks());
    this.questUiTimer = 0;
    this.refreshQuestUi();
  }

  private questViews() {
    return this.questLog.items.map((quest) => {
      let progress = '';
      if (quest.id === 'no_lost') {
        progress = this.run.lost > 0 ? `Ушли: ${this.run.lost}` : 'Без потерь';
      } else if (quest.id === 'stress_30') {
        progress = `${Math.round(this.run.stress)}%`;
      } else if (quest.id === 'boss') {
        progress = quest.completed ? 'Готово' : quest.failed ? 'Не выполнен' : 'Ожидает';
      } else {
        progress = `${Math.min(quest.progress, quest.target)}/${quest.target}`;
      }
      return {
        title: quest.title,
        progress,
        completed: quest.completed,
        failed: quest.failed,
        reward: QUEST_REWARD,
      };
    });
  }

  private refreshQuestUi(): void {
    if (!this.questLog.active) {
      this.ui.setQuests([], false);
      return;
    }
    for (const quest of this.questLog.items) {
      if (!quest.completed || this.announcedQuests.has(quest.id)) continue;
      this.announcedQuests.add(quest.id);
      this.events.emit('questCompleted', { questId: quest.id });
    }
    this.ui.setQuests(this.questViews(), true);
  }

  private onQuestParcelFound(): void {
    this.questLog.onParcelFound(this.highlightEnabled);
    this.refreshQuestUi();
  }

  private finalizeQuests(): void {
    this.questLog.finalize(this.run.lost, this.run.stress);
    this.refreshQuestUi();
  }

  startNewGame(): void {
    // An explicit new run is allowed to leave the terminal state.
    this.encounter.enterMenu();
    this.clearClients();
    this.run.reset();
    this.ownedDecor = this.createRunDecor();
    this.world.applyDecor(this.ownedDecor);
    this.best = loadBest();
    this.scannerBroken = false;
    this.scannerBreakPending = false;
    this.encounter.closeScannerBreakCard();
    this.zinaPendingCellId = null;
    this.tutorialActive = false;
    this.encounter.closeTutorial();
    this.tutorialPending = !loadTutorialDone();
    this.tutorialStep = 'welcome';
    this.clearTutorialMarker();
    this.ui.setTutorialTarget(null);
    this.ui.hideTutorial();
    this.beginShift(1);
  }

  private beginShift(shift: number): void {
    if (this.isGameOver()) return;
    const mechanicCard = this.pendingMechanicCard(shift);
    this.run.beginShift(shift);
    this.highlightEnabled = this.scannerWorks();
    this.world.setDayPhase(1);

    this.queenScenario.reset();
    this.fittingActive = isFittingActive(shift);
    this.fittingOccupied = [false, false];
    this.fittingTimers = [5, 9];
    this.fittingFull = false;
    this.updateShelfProgression(shift);
    this.eventUsed = false;
    this.director.begin(getShiftSteps(shift), mechanicCard ? 3.4 : 1.2);
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.encounter.enterBreak();
    this.encounter.closeModal();
    this.encounter.closeHelp();
    this.bossClient = null;
    this.boss.reset();
    this.argumentSystem.clear();
    this.argueClient = null;
    this.zina.reset();
    this.zinaOrderPending = false;
    this.zinaPendingCellId = null;
    this.scannerBreakPending = false;
    this.encounter.closeScannerBreakCard();
    this.encounter.closeMechanicCard();
    this.mechanicCardPending = mechanicCard;
    this.mechanicCardTimer = mechanicCard ? 3.2 : 0;
    this.pendingGameOver = false;
    this.finalBoss.reset();
    this.finalBossGalya = null;
    this.finalBossValera = null;
    this.finalBossOrder = null;
    this.shiftFailed = false;
    this.service.reset();
    this.scannerPanel.reset();
    this.pendingAction = null;
    this.marker.visible = false;
    this.movement.reset(PLAYER_START);
    this.playerRoot.position.set(PLAYER_START.x, 0, PLAYER_START.z);
    this.playerRoot.rotation.y = 0;
    this.player.setCarry(false);

    this.clearClients();
    this.restockCells();

    this.ui.hideAllModals();
    this.ui.closePanels();
    this.ui.setOrderChip(null);
    this.ui.setBuff(0);
    this.ui.setScanSpeed(this.baseScanSpeed());
    this.ui.setToyRelief(0);
    this.world.applyDecor(this.ownedDecor);
    this.ui.setReputation(this.run.reputation);
    this.ui.setFittingRooms(0, 2, this.fittingActive);
    this.ui.setQueenStatus(false, 0);
    this.ui.setFinalBossStatus(false, 0, '');
    this.ui.setFinalBossDebuff(false);
    this.events.emit('shiftStarted', { shift });
    this.ui.updateStress(0);
    const story = SHIFT_STORIES[shift - 1];
    const shelfNote = shift === 2 ? ' На складе появился третий стеллаж C.' : '';
    this.ui.banner(
      story ? `${story.day} · Смена ${shift}` : `Смена ${shift}`,
      story ? `${story.text}${shelfNote}` : 'Приготовьтесь: клиенты уже идут',
      3,
    );
    this.updateHud();
    this.updatePrompt();
    if (shift === 1 && this.tutorialPending) {
      this.startTutorial();
    }
  }

  private executeStep(index: number): void {
    if (this.isGameOver()) return;
    const step = this.director.enterStep(index);
    if (!step) {
      this.endShift();
      return;
    }
    if (step.type === 'wave') {
      this.startWave(step.wave);
    } else {
      this.spawnBoss();
    }
  }

  private startWave(wave: number): void {
    if (this.isGameOver()) return;
    const queenEntering = this.run.shift === 4 && wave === 2 && !this.queen.spawned;
    if (queenEntering) this.spawnQueen();
    this.highlightEnabled = this.scannerWorks();
    const plan = getWavePlan(this.run.shift, wave, MAX_QUEUE);
    this.world.setDayPhase(plan.dayPhase);
    if (!this.highlightEnabled) this.setHighlight(-1, -1);

    let mixedIndex = -1;
    if (wave === 2 && !this.eventUsed) {
      mixedIndex = randInt(0, plan.count - 1);
      this.eventUsed = true;
    }

    this.spawnQueue = [];
    for (let i = 0; i < plan.count; i++) {
      this.spawnQueue.push({
        archetype: pick(ARCHETYPES),
        patience: plan.patience,
        mixed: i === mixedIndex,
      });
    }

    this.spawnTimer = plan.spawnDelay;
    this.spawnInterval = plan.spawnInterval;
    this.encounter.enterPlaying();
    this.service.resetSignal();
    this.restockCells();
    this.ui.closePanels();
    // Keep the Queen's 3s entrance; a second banner would replace its portrait immediately.
    if (!queenEntering) {
      this.ui.banner(
        `Волна ${wave}`,
        wave === 3 ? 'Финальный наплыв. Держитесь!' : 'Клиенты подходят к стойке',
        2,
      );
    }
    this.updateHud();
    this.updatePrompt();
  }

  private updateSpawning(dt: number): void {
    if (this.phase !== 'playing') return;
    if (this.spawnQueue.length === 0) return;
    if (this.queue.length >= MAX_QUEUE) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnNext();
      this.spawnTimer = this.spawnInterval;
    }
  }

  private spawnNext(): void {
    const config = this.spawnQueue[0];
    if (!config) return;
    const order = this.createOrder(config.mixed);
    if (!order) return; // Keep this arrival queued until stock becomes available.
    this.spawnQueue.shift();
    const client = new Client({
      scene: this.scene,
      id: this.nextClientId++,
      archetype: config.archetype,
      order,
      patience: config.patience,
      queueIndex: this.queue.length,
    });

    client.willArgue = rollsClientArgument(this.run.shift);
    client.onPatienceZero = (value) => this.onClientPatienceZero(value);
    client.onGone = (value) => this.onClientGone(value);
    client.onLabelClick = (value) => this.onClientLabelClick(value);
    client.patienceDrainMultiplier = this.patienceMultiplier();

    if (this.run.shift === 1 && this.director.currentIndex === 0 && this.queue.length === 0) {
      client.preplaceAtFront();
    }

    this.clients.push(client);
    this.queue.push(client);
    this.updateQueue();
    this.updatePrompt();
  }

  private orderSize(): number {
    return this.progression.orderSize(this.run.shift);
  }

  private ensureShelfStock(required: number): WarehouseCell[] {
    let candidates = this.warehouse.available(this.progression.activeShelfCount);
    if (candidates.length < required) {
      this.restockCells();
      candidates = this.warehouse.available(this.progression.activeShelfCount);
    }
    return candidates;
  }

  private createOrder(mixedRequested: boolean, forcedCount?: number): Order | null {
    const desired = forcedCount ?? this.orderSize();
    const items = allocateOrderItems(this.ensureShelfStock(desired), desired, { mixed: mixedRequested });
    return this.createAllocatedOrder(items);
  }

  private createFinalBossBarcodeOrder(count: number): Order | null {
    const shelfCount = Math.min(3, this.progression.activeShelfCount);
    const items = allocateOrderItems(this.ensureShelfStock(count), count, {
      preferredShelf: index => index < shelfCount ? index : randInt(0, shelfCount - 1),
    });
    return this.createAllocatedOrder(items);
  }

  private createAllocatedOrder(items: OrderItem[]): Order | null {
    if (items.length === 0) return null;
    this.warehouse.reserve(items.flatMap((item) => [item.cellId, item.actualCellId]));
    return createOrderRecord(items, { scanned: false });
  }

  private orderCellList(order: Order): string {
    const remaining = order.items.filter((item) => !item.picked).map((item) => item.cellId);
    return remaining.join(' · ');
  }

  private releaseOrder(order: Order | null): void {
    if (!order || order.released) return;
    order.released = true;
    this.warehouse.release(order.items.flatMap((item) => [item.cellId, item.actualCellId]));
  }

  private onClientPatienceZero(client: Client): void {
    if (this.isGameOver()) return;
    if (client.isBoss || client.isMenu) return;
    if (client.state !== 'waiting') return;

    client.shout(pick(client.archetype.shout));
    this.sound.shout();
    const stressBefore = this.run.stress;
    this.addStress(6);
    const gained = Math.max(0, Math.round(this.run.stress - stressBefore));
    this.run.lost++;
    this.run.combo = 0;
    this.addReputation(-0.5);
    this.events.emit('clientLost', { clientId: client.id, reason: 'patience' });
    this.ui.toast(
      `${client.archetype.name} не дождался(ась). +${gained} стресса, репутация −0,5.`,
      'error',
    );

    this.removeFromQueue(client);
    if (this.scannerPanel.scanTarget === client) {
      this.scannerPanel.closeScanner();
      this.ui.closeScanner();
    }
    if (this.service.active?.client === client) this.cancelActiveOrder();
    this.releaseOrder(client.order);
    client.order = null;
    client.leave(1.2);
    // Keep the loss/cleanup above, but do not advance the boss after fatal stress.
    if (this.isGameOver()) return;

    if (client === this.bossClient && this.run.shift === 3) {
      this.bossClient = null;
      this.finishBossStep();
      return;
    }
    if (client === this.bossClient && this.run.shift === 2) {
      this.bossClient = null;
      this.finishBossStep();
      return;
    }
    if (client === this.finalBossGalya) {
      if (this.phase !== 'gameover') this.finishFinalBoss(false);
      return;
    }

    this.updateHud();
    this.updatePrompt();
  }

  private onClientGone(client: Client): void {
    const clientIndex = this.clients.indexOf(client);
    if (clientIndex >= 0) this.clients.splice(clientIndex, 1);
    const queueIndex = this.queue.indexOf(client);
    if (queueIndex >= 0) this.queue.splice(queueIndex, 1);

    this.releaseOrder(client.order);
    if (this.service.active?.client === client) this.cancelActiveOrder();
    if (this.scannerPanel.scanTarget === client) {
      this.scannerPanel.closeScanner();
      this.ui.closeScanner();
    }
    if (this.bossClient === client) this.bossClient = null;

    client.destroy();
    this.updateQueue();
    this.checkWaveComplete();
    this.updatePrompt();
  }

  private updateQueue(): void {
    this.queue.forEach((client, index) => client.setQueueIndex(index));
  }

  private removeFromQueue(client: Client): void {
    const index = this.queue.indexOf(client);
    if (index >= 0) this.queue.splice(index, 1);
    this.updateQueue();
  }

  private checkWaveComplete(): void {
    if (this.phase !== 'playing') return;
    if (this.queenWalkingToFitting) return;
    if (this.spawnQueue.length > 0) return;
    if (this.clients.some((client) => client !== this.queenClient)) return;
    if (this.service.active) return;
    // Возврат нельзя пропустить, просто дождавшись конца волны.
    if (this.service.carryingReturn || this.queen.hasReturn) return;
    this.finishCurrentStep();
  }

  private finishCurrentStep(): void {
    if (this.isGameOver()) return;
    const next = this.director.nextStepIndex;
    if (next === null) {
      this.endShift();
      return;
    }
    this.startBreak(5.2, next);
  }

  private startBreak(seconds: number, nextStepIndex: number): void {
    if (this.isGameOver()) return;
    this.encounter.enterBreak();
    this.director.startBreak(seconds, nextStepIndex);
    this.ui.closePanels();
    this.ui.banner('Передышка', '🧸 Потапай антистресс на стойке', 2);
    this.updateHud();
    this.updatePrompt();
  }

  private updateBreak(dt: number): void {
    if (this.modalOpen) return;
    const next = this.director.updateBreak(dt);
    if (next !== null) this.executeStep(next);
  }

  private spawnBoss(): void {
    if (this.isGameOver()) return;
    const kind = bossKindForShift(this.run.shift);
    if (kind === 'final') {
      this.spawnFinalBoss();
      return;
    }
    if (kind === 'sanya') {
      this.spawnSanya();
      return;
    }
    this.clearClients();
    this.encounter.enterBoss();
    this.boss.begin(kind);
    this.argumentSystem.clear();
    this.zina.reset();
    this.zinaOrderPending = false;
    this.zinaPendingCellId = null;
    this.pendingGameOver = false;
    const isZina = kind === 'zina';
    this.bossClient = new Client({
      scene: this.scene,
      id: this.nextClientId++,
      archetype: isZina ? BABA_ARCHETYPE : BOSS_ARCHETYPE,
      order: null,
      patience: 999,
      queueIndex: 0,
      isBoss: true,
    });
    this.bossClient.onGone = (value) => this.onClientGone(value);
    this.clients.push(this.bossClient);
    this.queue.push(this.bossClient);
    this.bossClient.showBubble('!', 999);
    this.updateQueue();

    this.ui.closePanels();
    this.ui.banner(
      'Босс',
      isZina
        ? 'Баба Зина идёт к стойке: помогите ей собрать штрихкод в пятнашках.'
        : 'Галя идёт к стойке. Приготовьтесь к скандалу.',
      2.4,
    );
    this.sound.boss();
    this.updateHud();
    this.updatePrompt();
  }

  private spawnSanya(): void {
    if (this.isGameOver()) return;
    // Саня вводит механики: 4 заказа сразу, а после него — многоячейковые заказы.
    this.progression.setMultiOrders(true);
    this.clearClients();
    // clearClients releases all reservations/carry, then allocation restocks.
    const order = this.createOrder(false, 4);
    if (!order) return;
    this.encounter.enterBoss();
    this.boss.begin('sanya');
    this.boss.trigger();
    this.argumentSystem.clear();
    this.zina.reset();
    this.zinaPendingCellId = null;
    this.pendingGameOver = false;

    this.bossClient = new Client({
      scene: this.scene,
      id: this.nextClientId++,
      archetype: SANYA_ARCHETYPE,
      order,
      patience: 34,
      queueIndex: 0,
    });
    this.bossClient.onGone = (value) => this.onClientGone(value);
    this.bossClient.onPatienceZero = (value) => this.onClientPatienceZero(value);
    this.bossClient.onLabelClick = (value) => this.onClientLabelClick(value);
    this.bossClient.patienceDrainMultiplier = this.patienceMultiplier();
    this.clients.push(this.bossClient);
    this.queue.push(this.bossClient);
    this.updateQueue();

    this.ui.closePanels();
    this.ui.banner(
      'Курьер Саня',
      'Четыре заказа сразу. Он очень спешит — не заставляйте ждать.',
      3,
    );
    this.sound.boss();
    this.updateHud();
    this.updatePrompt();
  }

  private updateBossApproach(): void {
    if (this.phase !== 'boss' || !this.bossClient || this.boss.triggered) return;
    if (this.bossClient.state !== 'waiting') return;
    if (!this.bossClient.isAt(QUEUE_SPOTS[0], 0.24)) return;
    this.triggerBossModal();
  }

  private triggerBossModal(): void {
    if (!this.bossClient) return;
    this.boss.trigger();
    this.encounter.openModal();
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;

    if (this.boss.kind === 'zina') {
      this.startZinaMiniGame();
      this.updatePrompt();
      return;
    }

    const line = pick(BOSS_LINES);
    this.bossClient.showBubble(line, 999);
    this.ui.showBoss(
      calculateExpectedServeStress(this.run.upgrades.charm, this.run.upgrades.tolerance),
      line,
      'Галя',
    );
    this.sound.boss();
    this.updatePrompt();
  }

  private startZinaMiniGame(): void {
    this.zina.start(
      ZINA_BARCODE_SEGMENTS.map((segment) => segment.id),
      ZINA_FILLER_TILE,
    );
    this.zinaPendingCellId = null;
    const line = pick(ZINA_INTRO_LINES);
    this.bossClient?.showBubble(line, 999);
    this.ui.showZinaGame(
      'Баба Зина',
      line,
      this.zina.target,
      this.zina.board,
      ZINA_PUZZLE_TIME,
      ZINA_PUZZLE_TIME,
    );
    this.sound.boss();
  }

  zinaPuzzleMove(index: number): void {
    if (!this.zina.active || !this.modalOpen) return;
    const result = this.zina.move(index);
    if (result === 'invalid') {
      this.ui.setZinaFeedback('Плитку можно двигать только рядом с пустой клеткой.', false);
      this.sound.error();
      return;
    }
    if (result === 'inactive') return;

    this.ui.renderZinaPuzzle(this.zina.board, this.zina.target);
    this.ui.setZinaFeedback('', true);
    this.sound.click();
    if (result === 'solved') this.finishZinaGame(true);
  }

  private updateZinaGame(dt: number): void {
    if (!this.zina.active || !this.modalOpen) return;
    const result = this.zina.tick(dt);
    this.ui.updateZinaTimer(this.zina.timeRatio);
    if (result === 'timeout') this.finishZinaGame(false);
  }

  private finishZinaGame(success: boolean): void {
    if (this.isGameOver()) return;
    if (!this.zina.active) return;
    this.zina.resolve();
    this.boss.resolve();

    if (success) {
      const cell = this.pickZinaCell();
      this.zinaPendingCellId = cell?.id ?? null;
      this.addStress(-8);
      this.addReputation(0.2);
      this.zinaOrderPending = true;
      this.ui.showBossResult(
        'Штрихкод собран!',
        cell
          ? `Баба Зина прикладывает штрихкод к телефону. Заберите посылку из ячейки ${cell.id} и отдайте ей.`
          : 'Баба Зина прикладывает штрихкод к телефону и ждёт заказ у стойки.',
        true,
        ZINA_WIN_LINE,
      );
      this.sound.win();
    } else {
      this.addStress(15, true);
      this.addReputation(-0.5);
      this.ui.showBossResult(
        'Штрихкод не собран',
        'Баба Зина так и не смогла разобраться с телефоном. Она уходит жаловаться.',
        false,
        ZINA_LOSE_LINE,
      );
      this.sound.lose();
    }
    this.updateHud();
    this.updateStressUi();
  }

  private pickZinaCell(): WarehouseCell | null {
    const free = this.warehouse.available(this.progression.activeShelfCount);
    return free.length > 0 ? pick(free) : null;
  }

  private tryStartClientArgument(client: Client): boolean {
    if (this.run.shift < 2 || !client.willArgue || client.argueTriggered) return false;
    if (
      client.isBoss ||
      client.isMenu ||
      client === this.queenClient ||
      client === this.finalBossGalya
    ) {
      return false;
    }
    if (client.state !== 'waiting' || this.queue[0] !== client) return false;
    if (this.service.active || this.service.carryingReturn) return false;

    client.argueTriggered = true;
    this.argumentSystem.open('client');
    this.argueClient = client;
    this.encounter.openModal();
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;

    const line = pick(CLIENT_ARGUE_LINES);
    client.showBubble(line, 999);
    this.ui.showClientArgue(
      client.archetype.name,
      line,
      calculateConcedeStress(this.run.upgrades.charm),
    );
    this.sound.boss();
    this.updatePrompt();
    return true;
  }

  private startClientArgueMash(): void {
    if (this.argumentSystem.isResolved) return;
    const startValue = calculateArgueStartValue(this.run.upgrades.charm);
    const mash = this.argumentSystem.startMash({
      startValue,
      duration: CLIENT_ARGUE_MASH_TIME,
      pushbackPerSecond: 0.05 * (1 - 0.1 * this.run.upgrades.charm),
    });
    this.ui.showBossArgue();
    this.ui.startBossMash();
    this.ui.setBossMarker(mash.mashValue);
    this.ui.pushBossTaunt(CLIENT_ARGUE_TAUNTS[0]);
    this.updateBossTimerUi(1);
    this.argueClient?.showBubble('Вы меня не переспорите!', 999);
    this.sound.boss();
  }

  private resolveClientArgueConcede(): void {
    if (this.argumentSystem.isResolved) return;
    this.argumentSystem.resolve();
    const client = this.argueClient;
    const before = this.run.stress;
    this.addStress(calculateConcedeStress(this.run.upgrades.charm), true);
    const gained = Math.max(0, Math.round(this.run.stress - before));
    const line = pick(CLIENT_ARGUE_CONCEDE_LINES);
    client?.showBubble(line, 4);
    this.ui.showBossResult(
      'Вы уступили',
      `Спор улажен. Стресс +${gained}. Клиент ждёт свой заказ.`,
      false,
      line,
    );
    this.events.emit('argumentResolved', { kind: 'client', won: false });
    this.updateHud();
    this.updateStressUi();
  }

  private finishClientArgueMash(argue: MashState): void {
    if (this.argumentSystem.isResolved) return;
    this.argumentSystem.resolve();
    const client = this.argueClient;
    const won = argue.mashValue > CLIENT_ARGUE_WIN_THRESHOLD;

    if (won) {
      const before = this.run.stress;
      this.addStress(-8, true);
      const drop = Math.max(0, Math.round(before - this.run.stress));
      this.addReputation(0.1);
      if (client) {
        client.setPatience(Math.min(client.maxPatience, client.patience + 5));
      }
      this.ui.showBossResult(
        'Вы победили в споре!',
        `Клиент признал вашу правоту. Стресс −${drop}, репутация +0,1.`,
        true,
        pick(CLIENT_ARGUE_WIN_LINES),
      );
    } else {
      const before = this.run.stress;
      this.addStress(10, true);
      const gained = Math.max(0, Math.round(this.run.stress - before));
      this.addReputation(-0.2);
      if (client) {
        client.setPatience(Math.max(3, client.patience - 4));
      }
      this.ui.showBossResult(
        'Клиент настоял на своём',
        `Спор проигран. Стресс +${gained}, репутация −0,2. Придётся обслужить.`,
        false,
        pick(CLIENT_ARGUE_LOSE_LINES),
      );
    }
    this.events.emit('argumentResolved', { kind: 'client', won });
    this.updateHud();
    this.updateStressUi();
  }

  onBossServe(): void {
    if (!this.modalOpen) return;
    if (this.argumentSystem.context === 'client') {
      this.resolveClientArgueConcede();
      return;
    }
    if (this.phase !== 'boss' || this.boss.resolved) return;
    this.boss.resolve();
    if (this.run.shift === 1) this.breakScanner();
    const before = this.run.stress;
    this.addStress(calculateServeStress(this.run.upgrades.charm), true);
    const actual = Math.round(this.run.stress - before);
    this.ui.showBossResult(
      'Обслужили',
      `Тётка довольна, но вы выгорели. Желание уволиться +${actual}.${
        this.run.shift === 1 ? ' Напоследок Галя разбила сканер: подсветка ячеек отключена.' : ''
      }`,
      false,
      BOSS_SERVED_LINE,
    );
    this.sound.lose();
    this.updateHud();
    this.updateStressUi();
  }

  onBossArgue(): void {
    if (!this.modalOpen) return;
    if (this.argumentSystem.context === 'client') {
      this.startClientArgueMash();
      return;
    }
    if (this.phase !== 'boss' || this.boss.resolved) return;
    this.argumentSystem.open('boss');
    const startValue = calculateArgueStartValue(this.run.upgrades.charm);
    const mash = this.argumentSystem.startMash({
      startValue,
      duration: CLIENT_ARGUE_MASH_TIME,
      pushbackPerSecond: 0.05 * (1 - 0.1 * this.run.upgrades.charm),
    });
    this.ui.showBossArgue();
    this.ui.startBossMash();
    this.ui.setBossMarker(mash.mashValue);
    this.ui.pushBossTaunt(BOSS_ARGUE_LINES[0]);
    this.updateBossTimerUi(1);
    this.bossClient?.showBubble('Вы меня не переспорите!', 999);
    this.sound.boss();
  }

  mashBoss(): void {
    if (!this.modalOpen) return;
    const argue = this.argumentSystem.press();
    if (!argue) return;
    this.ui.setBossMarker(argue.mashValue);
    this.maybeShowBossTaunt(argue);
    this.sound.click();
    if (argue.mashTaps % 5 === 0) this.sound.win();
  }

  private maybeShowBossTaunt(argue: MashState): void {
    // Стартовая реплика и далее каждые 15% пути от старта до победы.
    const lines =
      this.argumentSystem.context === 'client' ? CLIENT_ARGUE_TAUNTS : BOSS_ARGUE_LINES;
    const span = Math.max(0.1, 1 - argue.startValue);
    const progress = clamp((argue.mashValue - argue.startValue) / span, 0, 1);
    const target = Math.min(lines.length - 1, Math.floor(progress / 0.15));
    while (argue.tauntIndex <= target) {
      this.ui.pushBossTaunt(lines[argue.tauntIndex]);
      argue.tauntIndex++;
    }
  }

  private updateBossArgue(dt: number): void {
    if (!this.modalOpen) return;
    const finished = this.argumentSystem.update(dt);
    this.updateBossTimerUi(this.argumentSystem.timeRatio);
    const argue = this.argumentSystem.mashState;
    if (argue) this.ui.setBossMarker(argue.mashValue);
    if (finished) this.finishBossMash();
  }

  private updateBossTimerUi(ratio: number): void {
    this.ui.updateBossTimer(ratio);
  }

  private finishBossMash(): void {
    const finished = this.argumentSystem.consumeFinished();
    if (!finished) return;
    const { kind, state: argue } = finished;

    if (kind === 'client') {
      this.finishClientArgueMash(argue);
      return;
    }

    this.boss.resolve();
    this.zina.reset();
    if (this.run.shift === 1) this.breakScanner();
    const scannerNote =
      this.run.shift === 1 ? ' Галя разбила сканер: подсветка ячеек отключена.' : '';
    const won = argue.mashValue > CLIENT_ARGUE_WIN_THRESHOLD;

    if (won) {
      const beforeWin = this.run.stress;
      this.addStress(-30);
      const drop = Math.max(0, Math.round(beforeWin - this.run.stress));
      this.run.buffTimer = 20;
      this.ui.setBuff(20);
      this.ui.setScanSpeed(1.5);
      this.ui.showBossResult(
        'Вы победили в споре!',
        `Тётка отступила. Желание уволиться −${drop}, скорость и обслуживание ускорены на 20 секунд.${scannerNote}`,
        true,
        BOSS_WIN_LINE,
      );
      this.events.emit('bossDefeated', { kind: 'boss' });
    } else {
      const before = this.run.stress;
      if (before >= 50) {
        this.run.stress = 100;
        this.pendingGameOver = true;
        this.ui.showBossResult(
          'Тётка победила',
          `Вы проиграли спор. Желание уволиться было слишком высоким — заявление подписано.${scannerNote}`,
          false,
          BOSS_LOSE_LINE,
        );
      } else {
        this.run.stress = 85;
        this.ui.showBossResult(
          'Тётка победила',
          `Вы проиграли спор. Желание уволиться достигло критического уровня.${scannerNote}`,
          false,
          BOSS_LOSE_LINE,
        );
      }
    }

    this.events.emit('argumentResolved', { kind: 'boss', won });
    this.updateHud();
    this.updateStressUi();
  }

  onBossDone(): void {
    if (this.isGameOver()) return;
    if (!this.modalOpen) return;
    const context = this.argumentSystem.context;
    const client = this.argueClient;
    this.ui.hideBoss();
    this.encounter.closeModal();
    this.bossClient?.hideBubble();
    client?.hideBubble();
    this.argumentSystem.clear();
    this.argueClient = null;

    if (this.pendingGameOver) {
      this.pendingGameOver = false;
      this.gameOver();
      return;
    }
    if (this.scannerBreakPending) {
      this.scannerBreakPending = false;
      this.encounter.closeScannerBreakCard();
      if (!loadScannerBreakSeen()) {
        this.finishBossStep();
        this.showScannerBreakCard();
        return;
      }
      this.ui.toast(
        'Сканер разбит: подсветка ячеек отключена. Новый сканер — в магазине за 5000 ₽.',
        'boss',
      );
    }
    if (context === 'client') {
      if (client) this.handleArrival({ type: 'service', client });
      return;
    }
    if (this.zinaOrderPending) {
      this.startZinaOrder();
      return;
    }
    this.finishBossStep();
  }

  private startZinaOrder(): void {
    if (this.isGameOver()) return;
    const zina = this.bossClient;
    if (!zina) {
      this.zinaOrderPending = false;
      this.finishBossStep();
      return;
    }

    this.restockCells();
    const pendingCell = this.zinaPendingCellId;
    const cell =
      (pendingCell
        ? this.warehouse
            .available(this.progression.activeShelfCount)
            .find((value) => value.id === pendingCell)
        : null) ?? this.pickZinaCell();
    if (!cell) {
      this.zinaOrderPending = false;
      this.zinaPendingCellId = null;
      this.finishBossStep();
      return;
    }

    const order = this.createZinaOrder(cell);
    this.warehouse.reserve([cell.id]);
    this.zinaPendingCellId = null;
    this.zinaOrderPending = false;
    zina.isBoss = false;
    zina.label.element.classList.remove('boss');
    zina.order = order;
    zina.maxPatience = 30;
    zina.setPatience(30);
    zina.hasShouted = false;
    zina.state = 'waiting';
    zina.root.position.set(QUEUE_SPOTS[0].x, 0, QUEUE_SPOTS[0].z);
    zina.setQueueIndex(0);
    zina.setTarget(true);
    zina.rig.setCarry(false);
    zina.patienceDrainMultiplier = this.patienceMultiplier();
    zina.showBubble('Забери мою посылку, милок!', 3);
    this.service.begin(zina, order);
    this.boss.trigger();
    this.updateQueue();
    this.ui.closePanels();
    this.ui.setOrderChip('Ячейка', order.cellId, 'cell');
    if (this.scannerWorks()) {
      this.setHighlight(order.shelf, order.column);
    } else {
      this.setHighlight(-1, -1);
    }
    this.ui.banner(
      'Заказ Бабы Зины',
      `Ячейка ${order.cellId}. Заберите посылку и отдайте Зине.`,
      3,
    );
    this.updateHud();
    this.updatePrompt();
  }

  private createZinaOrder(cell: {
    id: string;
    shelfIndex: number;
    column: number;
    level: number;
  }): Order {
    return createOrderRecord(
      [
        {
          shelf: cell.shelfIndex,
          column: cell.column,
          level: cell.level,
          cellId: cell.id,
          actualShelf: cell.shelfIndex,
          actualColumn: cell.column,
          actualLevel: cell.level,
          actualCellId: cell.id,
          mixed: false,
          picked: false,
        },
      ],
      { scanned: true },
    );
  }

  private finishBossStep(): void {
    if (this.isGameOver()) return;
    if (this.bossClient) {
      this.bossClient.leave(0);
      this.removeFromQueue(this.bossClient);
      this.bossClient = null;
    }

    const next = this.director.nextStepIndex;
    if (next === null) {
      this.endShift();
      return;
    }
    this.startBreak(5.2, next);
    this.updatePrompt();
  }

  private spawnFinalBoss(): void {
    if (this.isGameOver()) return;
    if (this.run.shift !== 5) return;
    this.clearClients();
    this.world.setDayPhase(3);
    this.finalBoss.begin();
    this.finalBossGalya = null;
    this.finalBossValera = null;
    this.finalBossOrder = null;
    this.fittingOccupied = [false, false];
    this.fittingFull = false;
    this.fittingTimers = [5, 9];
    this.encounter.enterBoss();
    this.encounter.closeModal();
    this.bossClient = null;
    this.boss.begin('final');
    this.boss.trigger();
    this.argumentSystem.clear();
    this.argueClient = null;
    this.zina.reset();
    this.zinaOrderPending = false;
    this.zinaPendingCellId = null;
    this.pendingGameOver = false;
    this.service.carryingReturn = false;
    this.player.setCarry(false);
    this.ui.setFittingRooms(0, 2, true);
    this.ui.setFinalBossDebuff(false);
    this.ui.setFinalBossStatus(true, 1, 'скандал на входе');

    const galya = new Client({
      scene: this.scene,
      id: this.nextClientId++,
      archetype: BOSS_ARCHETYPE,
      order: null,
      patience: 999,
      queueIndex: 0,
      isBoss: true,
    });
    galya.onGone = (value) => this.onClientGone(value);
    galya.onPatienceZero = (value) => this.onClientPatienceZero(value);
    galya.onLabelClick = (value) => this.onClientLabelClick(value);
    galya.preplaceAtFront();
    this.finalBossGalya = galya;
    this.clients.push(galya);
    this.queue.push(galya);
    this.updateQueue();

    const valera = new Client({
      scene: this.scene,
      id: this.nextClientId++,
      archetype: VALERA_ARCHETYPE,
      order: null,
      patience: 999,
      queueIndex: 0,
      isBoss: true,
    });
    valera.onGone = (value) => this.onClientGone(value);
    valera.onLabelClick = (value) => this.onClientLabelClick(value);
    valera.label.element.classList.remove('boss');
    valera.placeAt({ x: 1.15, z: 1.85 });
    this.finalBossValera = valera;
    this.clients.push(valera);

    this.ui.closePanels();
    this.ui.setOrderChip(null);
    this.ui.banner('Финальный босс', 'Галя привела Валеру. Семейный спор начинается.', 3);
    this.sound.boss();
    this.updateHud();
    this.updatePrompt();
    this.showFinalBossDialogue('ФАЗА 1 / 3', FINAL_BOSS_ENTRANCE_LINES, 'Дальше');
  }

  private showFinalBossDialogue(
    phase: string,
    lines: BossDialogueLine[],
    button: string,
  ): void {
    this.encounter.openModal();
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;
    this.ui.closePanels();
    this.ui.showFinalBossDialogue(phase, lines, button);
  }

  onFinalBossDialogueDone(): void {
    if (!this.finalBoss.active || !this.modalOpen) return;
    this.ui.hideBoss();
    this.encounter.closeModal();

    if (this.finalBoss.stage === 'entrance') {
      this.startFinalBossCollect();
      return;
    }
    if (this.finalBoss.stage === 'mid') {
      this.startFinalBossBarcode(this.finalBoss.barcode);
      return;
    }
    if (this.finalBoss.stage === 'fittingTalk') {
      this.startFinalBossReturns();
    }
  }

  private applyFinalBossDebuff(): void {
    this.finalBoss.applyDebuff();
    this.ui.setFinalBossDebuff(true);
    this.ui.setScanSpeed(this.baseScanSpeed());
    this.updatePatienceMultipliers();
    this.ui.toast(
      'Дебафф «Семейный спор»: терпение +40%, скорость −15%, скан −20%.',
      'error',
    );
  }

  private startFinalBossCollect(): void {
    const galya = this.finalBossGalya;
    if (!galya) {
      this.finishFinalBoss(false);
      return;
    }
    this.applyFinalBossDebuff();
    galya.isBoss = false;
    galya.label.element.classList.remove('boss');
    galya.maxPatience = 120;
    galya.setPatience(120);
    galya.hasShouted = false;
    galya.state = 'waiting';
    galya.root.position.set(QUEUE_SPOTS[0].x, 0, QUEUE_SPOTS[0].z);
    galya.setQueueIndex(0);
    galya.patienceDrainMultiplier = this.patienceMultiplier();
    this.finalBoss.startCollect();
    this.ui.banner(
      'Фаза 2',
      'Галя бросает на стойку три штрихкода: 2, 3 и 4 ячейки. Успейте всё.',
      3,
    );
    this.startFinalBossBarcode(0);
  }

  private startFinalBossBarcode(index: number): void {
    const galya = this.finalBossGalya;
    if (!galya) {
      this.finishFinalBoss(false);
      return;
    }
    const count = this.finalBoss.startBarcode(index);
    const order = this.createFinalBossBarcodeOrder(count);
    if (!order) return; // collect + no order is retried by updateFinalBoss.
    this.finalBossOrder = order;
    galya.order = this.finalBossOrder;
    galya.state = 'waiting';
    galya.root.position.set(QUEUE_SPOTS[0].x, 0, QUEUE_SPOTS[0].z);
    galya.setQueueIndex(0);
    galya.maxPatience = Math.max(galya.maxPatience, 120);
    galya.patienceDrainMultiplier = this.patienceMultiplier();
    galya.showBubble(`Штрихкод ${index + 1}/3: ${count} ячеек. Быстрее!`, 3);
    this.finalBoss.setTauntSeconds(randInt(3, 5));
    this.ui.setFinalBossStatus(
      true,
      2,
      `штрихкод ${index + 1}/3 · ${count} ячейки`,
    );
    this.ui.toast(`Галя: штрихкод ${index + 1}/3, ${count} ячеек!`, 'boss');
    this.sound.boss();
    this.updateHud();
    this.updatePrompt();
  }

  private showFinalBossMidDialogue(): void {
    this.finalBoss.showMidDialogue();
    this.ui.setFinalBossStatus(true, 2, 'штрихкод 2/3 · третий — Валерин');
    this.showFinalBossDialogue('ФАЗА 2 / 3', FINAL_BOSS_MID_LINES, 'Дальше');
  }

  private handleFinalBossDelivery(active: ServiceSession<Client>): void {
    const client = active.client;
    this.run.served++;
    this.run.combo++;
    this.events.emit('clientServed', { clientId: client.id, kind: 'finalBoss' });
    this.addStress(-1);
    this.addReputation(0.2);
    client.setTarget(false);
    client.showBubble('Наконец-то!', 1.2);
    this.player.setCarry(false);
    this.service.clear();
    this.scannerPanel.reset();
    this.releaseOrder(active.order);
    client.order = null;
    client.state = 'waiting';
    this.finalBossOrder = null;
    const outcome = this.finalBoss.completeBarcodeDelivery();
    this.ui.closePanels();
    this.ui.setOrderChip(null);
    this.setHighlight(-1, -1);
    this.sound.deliver();

    if (outcome === 'fitting') {
      client.maxPatience = 999;
      client.setPatience(999);
      client.patienceDrainMultiplier = 1;
      this.ui.setFinalBossStatus(true, 3, 'Валера идёт в примерочную');
      this.ui.banner('Галя', 'ВАЛЕРА! ПОМЕРЬ! Я СКАЗАЛА, ПОМЕРЬ!', 3);
      client.showBubble('ВАЛЕРА! ПОМЕРЬ!', 3);
      const valera = this.finalBossValera;
      if (valera) {
        valera.walkTo({ x: 3.15, z: 2.8 });
        valera.showBubble('ДА НОРМАЛЬНАЯ ОНА!', 2);
      }
    } else if (outcome === 'mid') {
      this.showFinalBossMidDialogue();
    } else {
      this.startFinalBossBarcode(this.finalBoss.barcode);
    }

    this.updateHud();
    this.updatePrompt();
  }

  private updateFinalBoss(dt: number): void {
    if (!this.finalBoss.active) return;

    if (this.finalBoss.stage === 'collect' && this.finalBossGalya) {
      if (!this.finalBossOrder) {
        this.startFinalBossBarcode(this.finalBoss.barcode);
        if (!this.finalBossOrder) return;
      }
      if (this.finalBoss.tickTaunt(dt)) {
        const line = pick(GALYA_SHOUT_LINES);
        this.finalBossGalya.showBubble(line, 2.2);
        this.ui.toast(`Галя: ${line}`, 'boss');
        this.addStress(2);
        this.sound.shout();
        if (this.phase === 'gameover') return;
      }
    }

    if (this.finalBoss.stage !== 'fittingWalk' || !this.finalBossValera) return;
    const valera = this.finalBossValera;
    if (!valera.isAt({ x: 3.15, z: 2.8 }, 0.4) || valera.state !== 'waiting') return;

    this.finalBoss.enterFitting();
    this.fittingOccupied = [true, false];
    this.fittingFull = false;
    this.ui.setFittingRooms(1, 2, true);
    this.ui.setFinalBossStatus(true, 3, 'Валера в примерочной');
    this.showFinalBossDialogue('ФАЗА 3 / 3', FINAL_BOSS_FITTING_LINES, 'Забрать возврат');
  }

  private startFinalBossReturns(): void {
    const galya = this.finalBossGalya;
    this.finalBoss.startReturns();
    this.fittingOccupied = [true, false];
    this.fittingFull = false;
    this.ui.setFittingRooms(1, 2, true);
    if (galya) {
      galya.state = 'waiting';
      galya.order = null;
      galya.maxPatience = 999;
      galya.setPatience(999);
      galya.patienceDrainMultiplier = 1;
      galya.root.position.set(QUEUE_SPOTS[0].x, 0, QUEUE_SPOTS[0].z);
      galya.setQueueIndex(0);
      galya.root.visible = true;
      galya.label.visible = true;
      galya.rig.setCarry(true, '#d95d5d');
      galya.showBubble('ВОЗВРАТ ВСЕГО! Возврат 1/3', 999);
    }
    this.ui.setFinalBossStatus(true, 3, 'возврат 1/3');
    this.ui.banner(
      'Возврат всего',
      'Галя отдаёт первый возврат. Отнесите его в шкафчик «Возврат».',
      3,
    );
    this.ui.toast('Галя: ВОЗВРАТ ВСЕГО!', 'boss');
    this.updateHud();
    this.updatePrompt();
  }

  private takeFinalBossReturn(): void {
    const galya = this.finalBossGalya;
    if (!galya || !this.finalBoss.returnPending) return;
    if (this.service.carryingReturn) {
      this.ui.toast('Сначала сдайте текущий возврат в шкафчик «Возврат».', 'error');
      return;
    }
    if (this.service.active) {
      this.ui.toast('Сначала завершите текущий заказ', 'error');
      return;
    }
    if (!this.isServableFront(galya)) {
      this.ui.toast('Галя уже не ждёт у стойки', 'error');
      return;
    }

    this.finalBoss.takeReturn();
    this.service.carryingReturn = true;
    this.player.setCarry(true, '#d95d5d');
    galya.rig.setCarry(false);
    galya.showBubble(`Возврат ${4 - this.finalBoss.returnsLeft}/3`, 2);
    this.ui.closePanels();
    this.ui.setOrderChip('Возврат', `Осталось ${this.finalBoss.returnsLeft}`, 'return');
    this.ui.setFinalBossStatus(true, 3, `возвраты: ${this.finalBoss.returnsLeft}`);
    this.ui.toast('Отнесите возврат в шкафчик «Возврат» в зоне сотрудника.', 'boss');
    this.sound.pickup();
    this.updateHud();
    this.updatePrompt();
  }

  private finishFinalBoss(success: boolean): void {
    if (this.isGameOver()) return;
    if (!this.finalBoss.active) return;
    if (success) this.events.emit('bossDefeated', { kind: 'final' });
    else this.shiftFailed = true;
    this.finalBoss.finish();
    this.service.carryingReturn = false;
    this.player.setCarry(false);
    this.ui.setFinalBossDebuff(false);
    this.ui.setFinalBossStatus(false, 0, '');
    this.ui.setOrderChip(null);
    this.fittingOccupied = [false, false];
    this.fittingFull = false;
    this.fittingTimers = [5, 9];
    this.ui.setFittingRooms(0, 2, false);

    const galya = this.finalBossGalya;
    const valera = this.finalBossValera;
    if (galya) {
      this.removeFromQueue(galya);
      galya.leave(0);
    }
    if (valera) valera.leave(0);
    this.finalBossGalya = null;
    this.finalBossValera = null;
    this.finalBossOrder = null;

    if (success) {
      this.addReputation(0.5);
      this.sound.win();
      this.ui.banner('Финал', 'Галя и Валера уходят. ПВЗ выстоял!', 3);
    }
    this.updateHud();
    this.updatePrompt();
    this.endShift();
  }

  private endShift(): void {
    if (this.isGameOver()) return;
    this.encounter.enterResults();
    this.encounter.openModal();
    this.run.totalServed += this.run.served;

    // Королева и примерочные не должны оставаться на экране итогов.
    this.queenScenario.clearForResults();
    this.fittingOccupied = [false, false];
    this.fittingFull = false;
    this.fittingTimers = [5, 9];
    this.finalBoss.reset();
    this.finalBossGalya = null;
    this.finalBossValera = null;
    this.finalBossOrder = null;
    // Results must not retain leaving/final clients until the next reset.
    this.clearClients();
    this.service.carryingReturn = false;
    this.player.setCarry(false);
    this.ui.setFittingRooms(0, 2, false);
    this.ui.setQueenStatus(false, 0);
    this.ui.setFinalBossStatus(false, 0, '');
    this.ui.setFinalBossDebuff(false);
    this.ui.setOrderChip(null);
    this.updatePatienceMultipliers();
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;
    this.ui.closePanels();

    this.finalizeQuests();
    const economy = evaluateShift({
      served: this.run.served,
      lost: this.run.lost,
      questsCompleted: this.questLog.completedCount,
      shiftFailed: this.shiftFailed,
      stress: this.run.stress,
    });
    if (economy.reputationBonus > 0) this.addReputation(economy.reputationBonus);
    this.addMoney(economy.salary);
    this.run.totalEarned += economy.salary;
    this.ui.setQuests([], false);

    this.events.emit('shiftEnded', {
      shift: this.run.shift,
      money: this.run.money,
      served: this.run.served,
      lost: this.run.lost,
      failed: this.shiftFailed,
    });
    this.ui.updateStress(this.run.stress);
    this.ui.showResults(
      {
        shift: this.run.shift,
        stars: economy.stars,
        title: economy.title,
        served: this.run.served,
        lost: this.run.lost,
        earned: this.run.shiftEarnings,
        stress: this.run.stress,
        baseSalary: economy.baseSalary,
        questBonus: economy.questBonus,
        quests: this.questViews(),
        failed: this.shiftFailed,
      },
      this.run.upgrades,
      this.run.money,
      {
        shift: this.run.shift,
        totalServed: this.run.totalServed,
        totalEarned: this.run.totalEarned,
        best: this.best,
        reputation: this.run.reputation,
      },
      this.ownedDecor,
      this.scannerBroken,
    );
    if (this.run.shift === 1 && !loadResultsIntroSeen()) {
      this.ui.showResultsIntro();
      saveResultsIntroSeen();
    }
    this.ui.setNextShiftFinal(this.run.shift >= 5);

    if (economy.stars === 3) this.sound.win();
    else this.sound.deliver();
  }

  nextShift(): void {
    if (this.phase !== 'results') return;
    this.ui.hideResults();
    this.encounter.closeModal();
    if (this.run.shift >= 5) {
      this.restartGame();
      return;
    }
    this.beginShift(this.run.shift + 1);
  }

  buyUpgrade(id: UpgradeId): void {
    const definition = UPGRADES.find((upgrade) => upgrade.id === id);
    if (!definition) return;
    if (id === 'scanner' && !this.scannerBroken) return;
    const level = this.run.upgrades[id];
    const cost = upgradeCost(definition, level);
    if (cost === null) return;
    if (this.run.money < cost) {
      this.ui.toast('Не хватает денег', 'error');
      return;
    }
    this.run.money -= cost;
    this.run.upgrades[id] = level + 1;
    if (id === 'scanner') {
      this.highlightEnabled = this.scannerWorks();
      this.ui.toast('Сканер заменён: подсветка ячеек снова работает.', 'success');
    }
    this.sound.cash();
    this.updateHud();
    this.ui.updateShop(this.run.upgrades, this.run.money, this.ownedDecor, this.scannerBroken);
  }

  buyDecor(id: DecorId): void {
    const definition = DECOR_ITEMS.find((item) => item.id === id);
    if (!definition || this.ownedDecor[id]) return;
    if (this.run.money < definition.cost) {
      this.ui.toast('Не хватает денег', 'error');
      return;
    }
    this.run.money -= definition.cost;
    this.ownedDecor[id] = true;
    if (definition.permanent) {
      saveDecorIds(
        DECOR_ITEMS.filter(
          (item) => item.permanent && this.ownedDecor[item.id],
        ).map((item) => item.id),
      );
    }
    this.world.applyDecor(this.ownedDecor);
    this.sound.cash();
    this.updateHud();
    this.ui.updateShop(this.run.upgrades, this.run.money, this.ownedDecor, this.scannerBroken);
  }

  private gameOver(): void {
    if (this.phase === 'gameover') return;
    this.encounter.enterGameOver();
    this.pendingGameOver = false;
    this.zina.reset();
    this.encounter.openModal();
    this.run.stress = 100;
    this.tutorialActive = false;
    this.encounter.closeTutorial();
    this.encounter.closeScannerBreakCard();
    this.clearTutorialMarker();
    this.ui.setTutorialTarget(null);
    this.ui.hideTutorial();
    this.movement.clearPath();
    this.pendingAction = null;
    this.service.reset();
    this.player.setCarry(false);
    this.queenScenario.stop();
    this.finalBoss.reset();
    if (this.finalBossGalya) {
      this.finalBossGalya.root.visible = false;
      this.finalBossGalya.label.visible = false;
    }
    if (this.finalBossValera) {
      this.finalBossValera.root.visible = false;
      this.finalBossValera.label.visible = false;
    }
    this.finalBossGalya = null;
    this.finalBossValera = null;
    this.finalBossOrder = null;
    this.fittingOccupied = [false, false];
    this.fittingFull = false;
    this.ui.setFittingRooms(0, 2, false);
    this.ui.setQueenStatus(false, 0);
    this.ui.setFinalBossStatus(false, 0, '');
    this.ui.setFinalBossDebuff(false);
    this.ui.setQuests([], false);
    this.ui.setOrderChip(null);
    this.ui.updateStress(100);
    this.argumentSystem.clear();
    this.argueClient = null;
    this.ui.closePanels();

    this.best = Math.max(this.best, this.run.money);
    saveBest(this.best);
    this.ui.setBest(this.best);
    this.sound.gameOver();
    this.ui.showGameOver({
      shift: this.run.shift,
      served: this.run.totalServed + this.run.served,
      money: this.run.money,
    });
  }

  restartGame(): void {
    this.clearClients();
    this.run.reset();
    this.ownedDecor = this.createRunDecor();
    this.world.applyDecor(this.ownedDecor);
    this.scannerBroken = false;
    this.scannerBreakPending = false;
    this.encounter.closeScannerBreakCard();
    this.zinaPendingCellId = null;
    this.ui.setReputation(this.run.reputation);
    this.service.reset();
    this.scannerPanel.closeScanner();
    this.player.setCarry(false);
    this.argumentSystem.clear();
    this.argueClient = null;
    this.boss.reset();
    this.zina.reset();
    this.bossClient = null;
    this.pendingGameOver = false;
    this.encounter.closeModal();
    this.tutorialActive = false;
    this.encounter.closeTutorial();
    this.tutorialPending = !loadTutorialDone();
    this.tutorialStep = 'welcome';
    this.clearTutorialMarker();
    this.ui.setTutorialTarget(null);
    this.encounter.enterMenu();
    this.movement.clearPath();
    this.pendingAction = null;
    this.ui.hideAllModals();
    this.ui.setOrderChip(null);
    this.ui.setBuff(0);
    this.ui.setScanSpeed(1);
    this.ui.updateStress(0);
    this.ui.setPrompt('');
    this.setupMenu();
    this.ui.showStart(this.best);
    this.updateHud();
  }

  openHelp(): void {
    if (this.modalOpen) return;
    if (this.phase === 'menu' || this.phase === 'results' || this.phase === 'gameover') return;
    this.encounter.openHelp();
    this.movement.clearPath();
    this.pendingAction = null;
    this.marker.visible = false;
    this.ui.showHelp();
  }

  closeHelp(): void {
    if (!this.helpOpen) return;
    this.encounter.closeHelp();
    this.ui.hideHelp();
  }

  dismissCellPanel(): void {
    const active = this.service.active;
    if (active) this.scannerPanel.dismissFor(active.order.cellId);
    this.scannerPanel.hidePanel();
    this.ui.closeCellPanel();
  }

  onScannerClosed(): void {
    this.scannerPanel.closeScanner();
  }

  onScanComplete(): void {
    if (this.service.carryingReturn) {
      this.scannerPanel.closeScanner();
      this.ui.closeScanner();
      this.ui.toast('Сначала сдайте возврат в шкафчик «Возврат».', 'error');
      return;
    }
    const client = this.scannerPanel.scanTarget;
    if (!client || !client.order) {
      this.scannerPanel.closeScanner();
      this.ui.closeScanner();
      return;
    }
    if (!this.isServableFront(client) || !this.playerNearService()) {
      this.scannerPanel.closeScanner();
      this.ui.closeScanner();
      this.ui.toast('Подойдите к стойке, чтобы отсканировать заказ', 'error');
      this.updatePrompt();
      return;
    }

    client.order.scanned = true;
    this.service.begin(client, client.order);
    this.scannerPanel.closeScanner();
    this.ui.showScanResult(this.orderCellList(client.order));
    if (this.highlightEnabled) {
      this.setHighlight(client.order.shelf, client.order.column);
    } else {
      this.setHighlight(-1, -1);
    }
    this.ui.setOrderChip('Ячейки', this.orderCellList(client.order), 'cell');
    this.events.emit('orderScanned', {
      clientId: client.id,
      cellId: client.order.cellId,
    });
    this.sound.scanSuccess();
    this.updatePrompt();
    this.onTutorialAction('scanned');
  }

  private openScanner(client: Client): void {
    if (this.service.carryingReturn) {
      this.ui.toast('Сначала сдайте возврат в шкафчик «Возврат».', 'error');
      return;
    }
    if (this.service.active) {
      if (this.service.active.client === client && this.service.active.order.scanned) {
        this.ui.showScanResult(this.orderCellList(this.service.active.order));
        this.ui.setOrderChip('Ячейки', this.orderCellList(this.service.active.order), 'cell');
        return;
      }
      this.ui.toast('Сначала завершите текущий заказ', 'error');
      return;
    }
    if (!client.order) return;
    if (client.order.scanned) {
      this.service.begin(client, client.order);
      this.ui.showScanResult(this.orderCellList(client.order));
      if (this.highlightEnabled) {
        this.setHighlight(client.order.shelf, client.order.column);
      } else {
        this.setHighlight(-1, -1);
      }
      this.ui.setOrderChip('Ячейки', this.orderCellList(client.order), 'cell');
      return;
    }
    this.scannerPanel.openScanner(client);
    this.ui.openScanner(client.archetype.name);
    this.sound.scanStart();
    this.onTutorialAction('scanner_opened');
  }

  private isServableFront(client: Client): boolean {
    const queen = client === this.queenClient;
    return (
      this.queue[0] === client &&
      client.state === 'waiting' &&
      (queen || !client.isBoss) &&
      client.isAt(QUEUE_SPOTS[0], 0.3)
    );
  }

  private playerNearService(): boolean {
    return (
      Math.hypot(this.movement.position.x - SERVICE_POINT.x, this.movement.position.z - SERVICE_POINT.z) < 1.1
    );
  }

  private handleArrival(action: PendingAction): void {
    if (action.type === 'service') {
      const current = this.queue[0];
      if (!current || current !== action.client || !this.isServableFront(current)) {
        this.ui.toast('Клиент уже не ждёт у стойки', 'error');
        this.updatePrompt();
        return;
      }
      if (current === this.queenClient && this.queen.hasReturn) {
        this.takeQueenReturn();
        return;
      }
      if (this.service.carryingReturn) {
        this.ui.toast('Сначала сдайте возврат в шкафчик «Возврат».', 'error');
        return;
      }
      if (current === this.finalBossGalya && this.finalBoss.active) {
        if (this.finalBoss.returnPending) {
          this.takeFinalBossReturn();
          return;
        }
        if (this.finalBoss.stage !== 'collect') {
          this.ui.toast(
            this.finalBoss.stage === 'fittingWalk'
              ? 'Валера ещё идёт в примерочную. Подождите.'
              : 'Галя ждёт завершения примерки.',
            'info',
          );
          return;
        }
      }
      if (this.service.active) {
        if (this.service.active.client === current) {
          if (this.service.readyToDeliver) {
            this.deliver();
          } else {
            this.ui.showScanResult(this.orderCellList(this.service.active.order));
          }
        } else {
          this.ui.toast('Сначала завершите текущий заказ', 'error');
        }
        return;
      }
      if (this.tryStartClientArgument(current)) return;
      this.openScanner(current);
    } else if (action.type === 'shelf') {
      const active = this.service.active;
      if (!active || !active.order.scanned) {
        this.ui.toast('Сначала отсканируйте заказ', 'error');
        return;
      }
      if (this.service.readyToDeliver) {
        this.ui.toast('Посылка уже в руках. Отнесите её клиенту.', 'error');
        return;
      }
      if (active.order.shelf !== action.shelfIndex) {
        this.ui.toast(`Вам нужен стеллаж ${SHELF_LETTERS[active.order.shelf]}`, 'error');
        return;
      }
      this.scannerPanel.focusShelf(action.shelfIndex);
      this.openCellPanelFor(active.order);
    } else if (action.type === 'return-shelf') {
      this.depositReturn();
    } else if (action.type === 'toy') {
      this.tryToy();
    }
  }

  private openCellPanelFor(order: Order): void {
    const active = this.service.active;
    if (!active || active.order !== order || this.service.readyToDeliver) return;
    const shelf = this.world.shelves[order.shelf];
    if (!shelf) return;

    this.ui.closeScanner();
    this.scannerPanel.focusShelf(order.shelf);
    this.scannerPanel.showPanel(cellPanelKeyFor(order, this.highlightEnabled));

    if (order.searchMode) {
      this.ui.setOrderChip('Поиск', `Стеллаж ${shelf.letter}`, 'search');
    } else {
      this.ui.setOrderChip('Ячейка', order.cellId, 'cell');
    }

    this.ui.openCellPanel(
      buildCellPanelModel({
        order,
        shelfLetter: shelf.letter,
        cells: shelf.cells.map((cell) => ({
          id: cell.id,
          column: cell.column,
          level: cell.level,
          color: cell.color,
        })),
        columns: SHELF_DEFS[order.shelf].columns,
        highlightEnabled: this.highlightEnabled,
        signal: this.service.lastSignal,
      }),
    );

    this.onTutorialAction('cell_panel_opened');
  }

  chooseCellById(id: string): void {
    const active = this.service.active;
    if (!active || !active.order.scanned || this.service.readyToDeliver) return;
    const order = active.order;
    const cell = this.world.cells.find((value) => value.id === id);
    if (!cell || cell.shelfIndex !== order.shelf) return;

    if (order.searchMode) {
      if (order.checkedCells.includes(id)) return;
      if (id === order.actualCellId) {
        this.takeParcel(cell, order);
        return;
      }

      order.checkedCells.push(id);
      const actual = this.world.cells.find((value) => value.id === order.actualCellId);
      if (!actual) return;
      const distance =
        Math.abs(cell.column - actual.column) + Math.abs(cell.level - actual.level);
      this.service.setSignalForDistance(distance);
      this.addStress(2);
      this.sound.error();
      this.ui.toast(`Не то. ${this.service.lastSignal.text}.`, 'error');
      this.scannerPanel.showPanel(cellPanelKeyFor(order, this.highlightEnabled));
      this.openCellPanelFor(order);
      return;
    }

    if (id === order.cellId) {
      if (order.mixed && !order.mixedTriggered) {
        order.mixedTriggered = true;
        order.searchMode = true;
        order.checkedCells.push(order.cellId);
        const displayed = this.world.cells.find((value) => value.id === order.cellId);
        if (displayed) this.setCellStock(displayed.id, false);
        active.client.setPatience(active.client.patience + 15);
        this.service.resetSignal();
        this.addStress(2);
        this.sound.error();
        this.ui.toast('Прошлая смена перепутала ячейки! Ищите по сигналу.', 'boss');
        this.ui.banner(
          'Перепутанные ячейки',
          'Посылки не там, где ожидалось. Сканер подскажет.',
          2.5,
        );
        this.setHighlight(-1, -1);
        this.scannerPanel.hidePanel();
        this.openCellPanelFor(order);
        return;
      }
      this.takeParcel(cell, order);
      return;
    }

    this.addStress(3);
    this.questLog.resetStreak();
    this.refreshQuestUi();
    this.sound.error();
    this.ui.shakeCell(id);
    this.ui.toast(`Не та ячейка. Нужна ${order.cellId}.`, 'error');
  }

  private takeParcel(
    cell: { id: string; parcel: THREE.Object3D; color: string },
    order: Order,
  ): void {
    this.setCellStock(cell.id, false);
    this.service.takeNextItem(cell.color);

    this.service.active?.client.setTarget(true);
    this.player.setCarry(true, this.service.carryColors);
    this.ui.closeCellPanel();
    this.ui.closeScanner();
    this.scannerPanel.clearPanel();

    if (!this.service.readyToDeliver) {
      if (this.highlightEnabled) {
        this.setHighlight(order.shelf, order.column);
      } else {
        this.setHighlight(-1, -1);
      }
      this.ui.setOrderChip('Сбор посылок', this.orderCellList(order), 'cell');
      this.ui.toast(`Посылка взята. Осталось: ${this.orderCellList(order)}`, 'success');
    } else {
      this.setHighlight(-1, -1);
      this.ui.setOrderChip('В руках', 'Отнесите клиенту', 'carry');
      this.ui.toast('Все посылки собраны. Отнесите их клиенту.', 'success');
    }

    this.sound.pickup();
    this.onQuestParcelFound();
    this.updatePrompt();
    this.onTutorialAction('parcel_taken');

    if (this.finalBoss.active && this.finalBoss.stage === 'collect' && order === this.finalBossOrder) {
      const picked = order.items.filter((item) => item.picked).length;
      this.ui.setFinalBossStatus(
        true,
        2,
        `штрихкод ${this.finalBoss.barcode + 1}/3 · ${picked}/${order.items.length}`,
      );
    }
  }

  private deliver(): void {
    const active = this.service.active;
    if (!active || !this.service.readyToDeliver) return;
    const client = active.client;
    if (!this.isServableFront(client)) {
      this.ui.toast('Клиент уже не ждёт у стойки', 'error');
      this.cancelActiveOrder();
      return;
    }

    if (
      client === this.finalBossGalya &&
      this.finalBoss.active &&
      this.finalBoss.stage === 'collect'
    ) {
      this.handleFinalBossDelivery(active);
      return;
    }

    if (client === this.queenClient) {
      this.run.served++;
      this.run.combo++;
      this.events.emit('clientServed', { clientId: client.id, kind: 'queen' });
      this.addStress(-2);
      this.addReputation(0.1);
      client.setTarget(false);
      client.showBubble(pick(THANKS_LINES), 1.2);
      const left = this.queen.deliver(active.order.items.length);
      this.ui.setQueenStatus(true, left);
      this.player.setCarry(false);
      this.service.clear();
      this.scannerPanel.reset();
      this.releaseOrder(active.order);
      this.ui.closePanels();
      this.setHighlight(-1, -1);
      this.sound.deliver();
      if (left <= 0) {
        this.queenScenario.finish();
      } else {
        this.ui.toast(
          `Королева получила ${active.order.items.length} товара. Осталось ${left}.`,
          'success',
        );
        this.queenScenario.sendToFitting();
      }
      this.updateHud();
      this.updatePrompt();
      return;
    }

    this.run.served++;
    this.run.combo++;
    this.events.emit('clientServed', { clientId: client.id, kind: 'regular' });
    this.addStress(-2);
    this.addReputation(0.1);
    client.setTarget(false);
    client.showBubble(pick(THANKS_LINES), 1.6);
    client.leave(1.0);
    this.removeFromQueue(client);
    this.releaseOrder(active.order);
    this.service.clear();
    this.player.setCarry(false);
    this.scannerPanel.clearPanel();
    this.ui.closePanels();
    this.setHighlight(-1, -1);
    this.sound.deliver();
    this.ui.toast('Посылка выдана. Зарплата — в конце смены.', 'success');
    this.updateHud();
    this.updatePrompt();
    this.onTutorialAction('delivered');

    if (client === this.bossClient && this.run.shift === 3) {
      this.events.emit('bossDefeated', { kind: 'boss' });
      this.bossClient = null;
      this.finishBossStep();
    } else if (client === this.bossClient && this.run.shift === 2) {
      this.events.emit('bossDefeated', { kind: 'boss' });
      this.bossClient = null;
      this.finishBossStep();
    }
  }

  private cancelActiveOrder(): void {
    const active = this.service.clear();
    if (!active) return;
    active.client.setTarget(false);
    if (active.carried) {
      this.player.setCarry(false);
    }
    this.releaseOrder(active.order);
    if (active.carried) this.restockCells();
    this.scannerPanel.reset();
    this.ui.closePanels();
    this.setHighlight(-1, -1);
    this.updatePrompt();
  }

  private tryToy(): void {
    // Базовый тап слабый (0.2), но без перезарядки; улучшение даёт +0.1 за уровень.
    if (this.run.toyReliefUsed >= 30) {
      this.ui.toast('Лимит антистресса на смену исчерпан: максимум −30%.', 'info');
      return;
    }
    const baseRelief = Number((0.2 + this.run.upgrades.toy * 0.1).toFixed(1));
    const relief = Math.min(baseRelief, 30 - this.run.toyReliefUsed);
    const before = this.run.stress;
    this.addStress(-relief);
    const actual = Math.max(0, before - this.run.stress);
    this.run.toyReliefUsed = Math.min(30, this.run.toyReliefUsed + actual);
    this.ui.setToyRelief(this.run.toyReliefUsed);
    this.run.toySquish = 0.18;
    this.sound.toy();
    this.ui.toast(`Антистресс: −${actual.toFixed(1).replace('.', ',')}`, 'success');
    this.updatePrompt();
  }

  private setupMenu(): void {
    if (this.isGameOver()) return;
    this.clearClients();
    this.updateShelfProgression(1);
    this.queenScenario.reset();
    this.ui.setQueenStatus(false, 0);
    this.fittingActive = false;
    this.fittingOccupied = [false, false];
    this.fittingTimers = [0, 0];
    this.fittingFull = false;
    this.finalBoss.reset();
    this.finalBossGalya = null;
    this.finalBossValera = null;
    this.finalBossOrder = null;
    this.questLog.clear();
    this.announcedQuests.clear();
    this.shiftFailed = false;
    this.ui.setQuests([], false);
    this.ui.setFittingRooms(0, 2, false);
    this.ui.setFinalBossStatus(false, 0, '');
    this.ui.setFinalBossDebuff(false);
    this.encounter.enterMenu();
    this.encounter.closeModal();
    this.encounter.closeHelp();
    this.director.reset();
    this.argumentSystem.clear();
    this.argueClient = null;
    this.boss.reset();
    this.zina.reset();
    this.zinaOrderPending = false;
    this.zinaPendingCellId = null;
    this.bossClient = null;
    this.service.reset();
    this.scannerPanel.closeScanner();
    this.player.setCarry(false);
    this.movement.reset(PLAYER_START);
    this.playerRoot.position.set(PLAYER_START.x, 0, PLAYER_START.z);
    this.playerRoot.rotation.y = 0;
    this.pendingAction = null;
    this.marker.visible = false;
    this.scannerPanel.clearPanel();
    this.ui.closePanels();
    this.ui.setOrderChip(null);
    this.ui.setBuff(0);
    this.ui.setScanSpeed(1);
    this.ui.setToyRelief(0);
    this.world.tv.visible = false;

    for (let index = 0; index < 2; index++) {
      const client = new Client({
        scene: this.scene,
        id: this.nextClientId++,
        archetype: ARCHETYPES[index % ARCHETYPES.length],
        order: null,
        patience: 999,
        queueIndex: index,
        isMenu: true,
      });
      this.clients.push(client);
    }

    this.ui.updateStress(0);
    this.updateHud();
    this.updatePrompt();
  }

  private updateShelfProgression(shift: number): void {
    this.progression.begin(
      shift,
      SHELF_DEFS.map((def) => def.activeFromShift),
      areMultiOrdersEnabled(shift),
    );
    for (let index = 0; index < this.world.shelves.length; index++) {
      const shelf = this.world.shelves[index];
      const active = index < this.progression.activeShelfCount;
      shelf.group.visible = active;
      for (const label of shelf.labels) label.visible = active;
    }
    this.nav.setActiveShelfCount(this.progression.activeShelfCount);
  }

  private clearClients(): void {
    for (const client of this.clients) {
      this.releaseOrder(client.order);
      client.destroy();
    }
    this.clients = [];
    this.queue = [];
    this.service.reset();
    this.scannerPanel.closeScanner();
    this.player.setCarry(false);
    this.warehouse.clearReservations();
  }

  private restockCells(): void {
    const carried = new Set<string>();
    const order = this.service.active?.order;
    if (order) {
      for (const item of order.items) {
        if (!item.picked) continue;
        carried.add(item.cellId);
        carried.add(item.actualCellId);
      }
    }
    this.warehouse.restock(carried);
    this.syncWarehouseView();
  }

  private syncWarehouseView(): void {
    for (const cell of this.world.cells) {
      cell.parcel.visible = this.warehouse.hasStock(cell.id);
    }
  }

  private setCellStock(id: string, stocked: boolean): void {
    this.warehouse.setStock(id, stocked);
    const cell = this.world.cells.find((value) => value.id === id);
    if (cell) cell.parcel.visible = stocked;
  }

  private updateProximity(): void {
    const active = this.service.active;
    if (!active || this.service.readyToDeliver || !active.order.scanned) {
      if (this.scannerPanel.nearShelf !== null || this.scannerPanel.panelKey !== null) {
        this.scannerPanel.clearPanel();
        this.ui.closeCellPanel();
      }
      return;
    }

    const order = active.order;
    const shelf = this.world.shelves[order.shelf];
    const distance = Math.hypot(
      this.movement.position.x - shelf.interaction.x,
      this.movement.position.z - shelf.interaction.z,
    );

    if (distance < 1.35) {
      this.scannerPanel.focusShelf(order.shelf);
      if (this.scannerPanel.isDismissed(order.cellId)) return;
      const key = cellPanelKeyFor(order, this.highlightEnabled);
      if (this.scannerPanel.shouldOpenPanel(key)) {
        this.openCellPanelFor(order);
      }
    } else if (this.scannerPanel.nearShelf !== null || this.scannerPanel.panelKey !== null) {
      this.scannerPanel.clearPanel();
      this.ui.closeCellPanel();
    }
  }

  private updatePlayer(dt: number): void {
    const step = this.movement.update(dt, this.currentSpeed());
    if (step.moving) this.playerRoot.rotation.y = step.facing;

    if (step.arrived) {
      this.marker.visible = false;
      const action = this.pendingAction;
      this.pendingAction = null;
      if (action) {
        this.faceAction(action);
        this.handleArrival(action);
      }
    }

    this.playerRoot.position.set(
      this.movement.position.x,
      0,
      this.movement.position.z,
    );
    const mood = !step.moving && this.run.stress >= 80 ? 'impatient' : 'idle';
    this.player.update(dt, step.moving, this.time, mood);
  }

  private faceAction(action: PendingAction): void {
    if (action.type === 'shelf') {
      this.playerRoot.rotation.y = this.world.shelves[action.shelfIndex]?.faceRotation ?? 0;
      return;
    }
    if (action.type === 'return-shelf') {
      this.playerRoot.rotation.y = Math.PI;
      return;
    }
    this.playerRoot.rotation.y = 0;
  }

  private scannerWorks(): boolean {
    return !this.scannerBroken || this.run.upgrades.scanner > 0;
  }

  private breakScanner(): void {
    if (this.run.shift !== 1 || this.scannerBroken) return;
    this.scannerBroken = true;
    this.scannerBreakPending = true;
    this.highlightEnabled = false;
    this.setHighlight(-1, -1);
  }

  private patienceMultiplier(): number {
    if (this.tutorialActive) return 0;
    const tv = this.ownedDecor.tv ? 0.8 : 1;
    const fitting = this.fittingFull ? 1.2 : 1;
    const queen = this.queen.active ? this.queen.irritation : 1;
    const family = this.finalBoss.debuff ? 1.4 : 1;
    return tv * fitting * queen * family;
  }

  private baseScanSpeed(): number {
    return this.finalBoss.debuff ? 0.8 : 1;
  }

  private updatePatienceMultipliers(): void {
    const multiplier = this.patienceMultiplier();
    for (const client of this.clients) client.patienceDrainMultiplier = multiplier;
  }

  private updateFittingRooms(dt: number): void {
    if (!this.fittingActive) return;
    if (this.queen.inFitting) {
      if (!this.fittingFull) {
        this.fittingOccupied = [true, true];
        this.fittingFull = true;
        this.updatePatienceMultipliers();
        this.ui.setFittingRooms(2, 2, true);
      }
      return;
    }
    if (this.finalBoss.valeraInFitting) {
      if (!this.fittingOccupied[0] || this.fittingOccupied[1]) {
        this.fittingOccupied = [true, false];
        this.fittingFull = false;
        this.updatePatienceMultipliers();
        this.ui.setFittingRooms(1, 2, true);
      }
      return;
    }
    if (this.finalBoss.active) {
      // Во время финального босса примерочные заняты по сюжету, а не случайно.
      if (this.fittingOccupied[0] || this.fittingOccupied[1]) {
        this.fittingOccupied = [false, false];
        this.fittingFull = false;
        this.updatePatienceMultipliers();
        this.ui.setFittingRooms(0, 2, true);
      }
      return;
    }
    let changed = false;

    for (let index = 0; index < this.fittingOccupied.length; index++) {
      this.fittingTimers[index] -= dt;
      if (this.fittingTimers[index] > 0) continue;
      this.fittingOccupied[index] = !this.fittingOccupied[index];
      this.fittingTimers[index] = this.fittingOccupied[index] ? randInt(7, 13) : randInt(5, 10);
      changed = true;
    }

    const full = this.fittingOccupied.every(Boolean);
    if (full !== this.fittingFull) {
      this.fittingFull = full;
      this.updatePatienceMultipliers();
      this.ui.toast(
        full ? 'Обе примерочные заняты — очередь раздражается!' : 'Примерочная освободилась.',
        full ? 'error' : 'info',
      );
      changed = true;
    }

    if (changed) {
      this.ui.setFittingRooms(this.fittingOccupied.filter(Boolean).length, 2, true);
    }
  }

  private spawnQueen(): void {
    this.queenScenario.spawn();
  }

  private updateQueen(dt: number): void {
    const step = this.director.currentStep;
    this.queenScenario.update(
      dt,
      this.run.shift === 4 && step?.type === 'wave' && step.wave >= 2,
    );
  }

  // Keep the e2e/dev-console entry point while QueenScenario owns the flow.
  private returnQueen(): void {
    this.queenScenario.returnQueen();
  }

  private takeQueenReturn(): void {
    this.queenScenario.takeReturn();
  }

  private createQueenClient(order: Order): Client {
    const queen = new Client({
      scene: this.scene,
      id: this.nextClientId++,
      archetype: QUEEN_ARCHETYPE,
      order,
      patience: 999,
      queueIndex: 0,
      isBoss: true,
    });
    queen.onGone = (value) => this.onClientGone(value);
    queen.onLabelClick = (value) => this.onClientLabelClick(value);
    return queen;
  }

  private canTakeQueenReturn(queen: Client): boolean {
    if (this.service.carryingReturn) {
      this.ui.toast('У вас уже есть возврат. Сдайте его в шкафчик «Возврат».', 'error');
      return false;
    }
    if (this.service.active) {
      this.ui.toast('Сначала завершите текущий заказ', 'error');
      return false;
    }
    if (!this.isServableFront(queen)) {
      this.ui.toast('Королева уже не ждёт у стойки', 'error');
      return false;
    }
    return true;
  }

  private beginQueenReturnCarry(): void {
    this.service.carryingReturn = true;
    this.player.setCarry(true, '#d95d5d');
    this.service.clear();
    this.scannerPanel.closeScanner();
    this.ui.closePanels();
    this.ui.setOrderChip('Возврат', 'Отнесите в шкафчик «Возврат»', 'return');
    this.ui.toast('Королева отдала возврат. Отнесите его в шкафчик «Возврат».', 'boss');
    this.sound.pickup();
    this.updateHud();
    this.updatePrompt();
  }

  private clearFittingRooms(resetTimers: boolean): void {
    this.fittingOccupied = [false, false];
    this.fittingFull = false;
    if (resetTimers) this.fittingTimers = [5, 9];
    this.ui.setFittingRooms(0, 2, true);
  }

  private occupyQueenFitting(): void {
    this.fittingOccupied = [true, true];
    this.fittingFull = true;
    this.ui.setFittingRooms(2, 2, true);
  }

  private depositReturn(): void {
    if (!this.service.carryingReturn) {
      this.ui.toast('Сейчас нет возврата для сдачи.', 'info');
      return;
    }
    if (!this.playerNearReturnShelf()) {
      this.ui.toast('Подойдите к шкафчику «Возврат» в зоне сотрудника.', 'error');
      return;
    }

    if (this.finalBoss.returnInHand) {
      this.service.carryingReturn = false;
      this.player.setCarry(false);
      const left = this.finalBoss.depositReturn();
      this.ui.setOrderChip(null);
      this.addReputation(0.1);
      this.events.emit('returnDeposited', { kind: 'finalBoss' });
      this.sound.deliver();
      if (left > 0) {
        const galya = this.finalBossGalya;
        if (galya) {
          galya.rig.setCarry(true, '#d95d5d');
          galya.showBubble(`Возврат ${4 - left}/3`, 3);
        }
        this.ui.setFinalBossStatus(true, 3, `возвраты: ${left}`);
        this.ui.toast(
          `Возврат сдан. Осталось ${left}. Заберите следующий у Гали.`,
          'success',
        );
        this.updateHud();
        this.updatePrompt();
        return;
      }
      this.finishFinalBoss(true);
      return;
    }

    this.service.carryingReturn = false;
    this.player.setCarry(false);
    this.queen.deliverReturn();
    this.ui.setOrderChip(null);
    this.addReputation(0.1);
    this.events.emit('returnDeposited', { kind: 'queen' });
    this.sound.deliver();
    if (this.queen.active && this.queenClient && this.queen.budget > 0) {
      this.ui.toast('Возврат сдан. Королева скоро вернётся с новым заказом.', 'success');
    } else {
      this.ui.toast('Возврат сдан в шкафчик.', 'success');
    }
    this.updateHud();
    this.updatePrompt();
  }

  private playerNearReturnShelf(): boolean {
    return Math.hypot(
      this.movement.position.x - RETURN_POINT.x,
      this.movement.position.z - RETURN_POINT.z,
    ) < 1.1;
  }

  private onReturnShelfClick(): void {
    if (!this.service.carryingReturn) {
      this.ui.toast(
        this.finalBoss.returnPending
          ? 'Сначала заберите возврат у Гали у стойки.'
          : this.queen.hasReturn
            ? 'Сначала заберите возврат у Королевы у стойки.'
            : 'Возвратов сейчас нет. Королева приносит их после примерки.',
        'info',
      );
      return;
    }
    this.moveTo(RETURN_POINT, { type: 'return-shelf' });
  }

  private currentSpeed(): number {
    const stressFactor = this.run.stress >= 85 ? 0.7 : this.run.stress >= 60 ? 0.85 : 1;
    const buffFactor = this.run.buffTimer > 0 ? 1.3 : 1;
    const familyFactor = this.finalBoss.debuff ? 0.85 : 1;
    return (
      PLAYER_SPEED *
      (1 + 0.08 * this.run.upgrades.speed) *
      stressFactor *
      buffFactor *
      familyFactor
    );
  }

  private moveTo(target: Vec2, action: PendingAction | null): void {
    if (this.modalOpen) return;
    const resolved = this.nav.resolveTarget(target);
    if (!resolved) {
      this.pendingAction = null;
      this.ui.toast('Туда не пройти', 'error');
      return;
    }
    const distance = this.movement.distanceTo(resolved);
    this.pendingAction = action;

    if (distance < 0.24) {
      this.movement.snapTo(resolved);
      this.playerRoot.position.set(resolved.x, 0, resolved.z);
      this.marker.visible = false;
      if (action) {
        this.faceAction(action);
        this.pendingAction = null;
        this.handleArrival(action);
      }
      return;
    }

    const path = this.nav.findPath(this.movement.position, resolved);
    if (path.length === 0) {
      this.pendingAction = null;
      this.ui.toast('Туда не пройти', 'error');
      return;
    }

    this.movement.setPath(path);
    const final = path[path.length - 1];
    this.marker.position.set(final.x, 0.03, final.z);
    this.marker.visible = true;
  }

  private onClientLabelClick(client: Client): void {
    if (this.modalOpen || this.helpOpen) return;
    if (this.phase === 'menu' || this.phase === 'results' || this.phase === 'gameover') return;
    if (this.service.carryingReturn) {
      this.ui.toast('Сначала сдайте возврат в шкафчик «Возврат».', 'error');
      return;
    }
    if (client.isMenu || (client.isBoss && client !== this.queenClient)) return;
    if (client.state === 'leaving' || client.state === 'gone') {
      this.ui.toast('Клиент уже уходит', 'error');
      return;
    }
    if (this.queue[0] !== client) {
      this.ui.toast('Сначала обслужите первого в очереди', 'error');
      return;
    }
    this.moveTo(SERVICE_POINT, { type: 'service', client });
    this.onTutorialAction('client_clicked');
  }

  private handleClickData(data: Record<string, unknown>, point: THREE.Vector3): void {
    const type = data.type;

    if (type === 'floor') {
      this.moveTo({ x: point.x, z: point.z }, null);
      return;
    }

    if (type === 'return-shelf') {
      this.onReturnShelfClick();
      return;
    }

    if (
      this.service.carryingReturn &&
      (type === 'client' || type === 'counter' || type === 'shelf' || type === 'cell')
    ) {
      this.ui.toast('Сначала сдайте возврат в шкафчик «Возврат».', 'error');
      return;
    }

    if (type === 'client') {
      const client = data.client as Client | undefined;
      if (!client || client.isMenu || (client.isBoss && client !== this.queenClient)) return;
      if (client.state === 'leaving' || client.state === 'gone') {
        this.ui.toast('Клиент уже уходит', 'error');
        return;
      }
      if (this.queue[0] !== client) {
        this.ui.toast('Сначала обслужите первого в очереди', 'error');
        return;
      }
      this.moveTo(SERVICE_POINT, { type: 'service', client });
      this.onTutorialAction('client_clicked');
      return;
    }

    if (type === 'counter') {
      const front = this.queue[0];
      if (!front) {
        this.ui.toast('Очередь пуста. Клиенты скоро подойдут.', 'info');
        return;
      }
      this.moveTo(SERVICE_POINT, { type: 'service', client: front });
      this.onTutorialAction('client_clicked');
      return;
    }

    if (type === 'shelf') {
      this.onShelfClick(Number(data.shelfIndex));
      return;
    }

    if (type === 'cell') {
      const shelfIndex = Number(data.shelfIndex);
      const cellIdValue = String(data.cellId);
      if (
        this.service.active &&
        this.service.active.order.scanned &&
        !this.service.readyToDeliver &&
        this.service.active.order.shelf === shelfIndex &&
        this.playerNearShelf(shelfIndex)
      ) {
        this.chooseCellById(cellIdValue);
      } else {
        this.onShelfClick(shelfIndex);
      }
      return;
    }

    if (type === 'toy') {
      this.moveTo(SERVICE_POINT, { type: 'toy' });
    }
  }

  private onShelfClick(shelfIndex: number): void {
    const active = this.service.active;
    if (!active || !active.order.scanned) {
      this.ui.toast('Сначала отсканируйте заказ', 'error');
      return;
    }
    if (this.service.readyToDeliver) {
      this.ui.toast('Посылка уже в руках. Отнесите её клиенту.', 'error');
      return;
    }
    if (active.order.shelf !== shelfIndex) {
      this.ui.toast(`Вам нужен стеллаж ${SHELF_LETTERS[active.order.shelf]}`, 'error');
      return;
    }
    this.moveTo(this.world.shelves[shelfIndex].interaction, { type: 'shelf', shelfIndex });
  }

  private playerNearShelf(shelfIndex: number): boolean {
    const shelf = this.world.shelves[shelfIndex];
    if (!shelf) return false;
    return (
      Math.hypot(
        this.movement.position.x - shelf.interaction.x,
        this.movement.position.z - shelf.interaction.z,
      ) < 1.35
    );
  }

  private setHighlight(shelfIndex: number, column: number): void {
    for (const shelf of this.world.shelves) {
      for (const highlight of shelf.columnHighlights) {
        highlight.group.visible = false;
      }
    }
    if (shelfIndex < 0 || column < 0) return;
    const shelf = this.world.shelves[shelfIndex];
    const highlight = shelf?.columnHighlights[column];
    if (highlight) {
      highlight.group.visible = true;
      highlight.material.opacity = 0.2;
    }
  }

  private updateWorldAnimations(dt: number): void {
    this.world.update(this.time);
    this.updateTutorialMarker();

    if (this.run.toySquish > 0) {
      this.run.toySquish = Math.max(0, this.run.toySquish - dt);
      const squash = this.run.toySquish / 0.18;
      this.world.toy.scale.set(1 + 0.25 * squash, 1 - 0.35 * squash, 1 + 0.25 * squash);
    } else {
      this.world.toy.scale.set(1, 1, 1);
    }

    if (this.marker.visible) {
      const pulse = 1 + Math.sin(this.time * 7) * 0.1;
      this.marker.scale.setScalar(pulse);
      this.markerMaterial.opacity = 0.65 + Math.sin(this.time * 7) * 0.2;
    }

    for (const shelf of this.world.shelves) {
      for (const highlight of shelf.columnHighlights) {
        if (highlight.group.visible) {
          highlight.material.opacity = 0.16 + Math.sin(this.time * 5) * 0.07;
        }
      }
    }
  }

  private addMoney(amount: number): void {
    this.run.money += amount;
    this.run.shiftEarnings += amount;
    this.updateHud();
  }

  private addReputation(amount: number): void {
    this.run.reputation = Number(clamp(this.run.reputation + amount, 0, 5).toFixed(2));
    this.ui.setReputation(this.run.reputation);
  }

  private addStress(amount: number, deferGameOver = false): void {
    if (this.isGameOver()) return;
    const delta = amount > 0 ? amount * (1 - 0.1 * this.run.upgrades.tolerance) : amount;
    this.run.stress = Number(clamp(this.run.stress + delta, 0, 100).toFixed(2));
    this.updateStressUi();
    if (this.run.stress >= 100) {
      if (deferGameOver) this.pendingGameOver = true;
      else this.gameOver();
    }
  }

  private updateStressUi(): void {
    this.ui.updateStress(this.run.stress);
  }

  private updateHud(): void {
    let waveLabel = 'Готов к смене';
    if (this.phase === 'results') waveLabel = 'Смена завершена';
    else if (this.phase === 'gameover') waveLabel = 'Уволен';
    else if (this.phase === 'menu') waveLabel = 'Готов к смене';
    else if (this.phase === 'break') waveLabel = 'Передышка';
    else {
      const step = this.director.currentStep;
      if (step?.type === 'boss') {
        waveLabel = this.run.shift === 5 ? 'Финальный босс' : 'Босс';
      } else if (step?.type === 'wave') {
        waveLabel = `Волна ${step.wave}/3`;
      }
    }

    const progress = this.director.progress;
    this.ui.updateHud({
      shift: this.run.shift,
      waveLabel,
      progress,
      money: this.run.money,
      served: this.run.served,
      lost: this.run.lost,
    });
  }

  private updatePrompt(): void {
    if (this.modalOpen || this.helpOpen || this.tutorialOpen) {
      this.ui.setPrompt('');
      return;
    }
    if (this.phase === 'menu' || this.phase === 'results' || this.phase === 'gameover') {
      this.ui.setPrompt('');
      return;
    }

    if (this.service.carryingReturn) {
      this.ui.setPrompt(
        this.playerNearReturnShelf()
          ? 'Нажмите на шкафчик «Возврат», чтобы сдать возврат.'
          : 'Отнесите возврат в шкафчик «Возврат» в зоне сотрудника.',
      );
      return;
    }

    if (this.queen.hasReturn && this.queenClient && this.queue[0] === this.queenClient) {
      this.ui.setPrompt(
        this.queenClient.state === 'waiting'
          ? 'Королева принесла возврат. Подойдите к стойке и заберите его.'
          : 'Королева выходит из примерочной с возвратом. Подождите её у стойки.',
      );
      return;
    }

    if (this.finalBoss.active && this.finalBoss.returnPending) {
      this.ui.setPrompt('Заберите возврат у Гали у стойки и отнесите его в шкафчик «Возврат».');
      return;
    }

    if (this.service.active) {
      const order = this.service.active.order;
      const remaining = order.items.filter((item) => !item.picked);
      if (this.service.readyToDeliver) {
        this.ui.setPrompt(
          order.items.length > 1
            ? 'Все посылки собраны. Отнесите их клиенту у стойки.'
            : 'Отнесите посылку клиенту у стойки.',
        );
      } else if (order.scanned) {
        if (order.searchMode) {
          this.ui.setPrompt('Ячейки перепутаны. Ищите по сигналу сканера.');
        } else if (this.scannerPanel.nearShelf === order.shelf) {
          this.ui.setPrompt(
            remaining.length > 1
              ? `Возьмите ${order.cellId}. Осталось: ${this.orderCellList(order)}.`
              : `Выберите ячейку ${order.cellId}.`,
          );
        } else if (remaining.length > 1) {
          this.ui.setPrompt(`Соберите посылки: ${this.orderCellList(order)}.`);
        } else {
          this.ui.setPrompt(
            `Стеллаж ${SHELF_LETTERS[order.shelf]} · колонка ${order.column + 1} · ячейка ${order.cellId}`,
          );
        }
      } else {
        this.ui.setPrompt('Удерживайте кнопку сканера, чтобы получить номер ячейки.');
      }
      return;
    }

    if (this.phase === 'break') {
      this.ui.setPrompt('Передышка. Потапай антистресс-игрушку на стойке.');
      return;
    }

    if (this.phase === 'boss') {
      if (this.finalBoss.active) {
        if (this.finalBoss.stage === 'collect') {
          this.ui.setPrompt('Кликните по Гале, чтобы отсканировать три штрихкода.');
        } else if (this.finalBoss.stage === 'fittingWalk') {
          this.ui.setPrompt('Валера идёт в примерочную. Подождите.');
        } else if (this.finalBoss.stage === 'fittingTalk') {
          this.ui.setPrompt('Галя и Валера выясняют отношения в примерочной.');
        } else if (this.finalBoss.stage === 'returns') {
          this.ui.setPrompt('Заберите возврат у Гали у стойки.');
        } else {
          this.ui.setPrompt('Финальный босс. Держитесь.');
        }
        return;
      }
      if (this.run.shift === 2 && this.bossClient && !this.bossClient.isBoss) {
        this.ui.setPrompt('Баба Зина ждёт свою посылку. Заберите её на складе.');
        return;
      }
      this.ui.setPrompt(
        this.run.shift === 3
          ? 'Курьер Саня ждёт: заберите 4 заказа и успейте до его ухода.'
          : 'Босс идёт к стойке. Приготовьтесь.',
      );
      return;
    }

    const front = this.queue[0];
    if (front) {
      if (this.isServableFront(front)) {
        this.ui.setPrompt('Кликните по клиенту у стойки, чтобы отсканировать заказ.');
      } else {
        this.ui.setPrompt('Клиент подходит к стойке...');
      }
      return;
    }

    if (this.phase === 'playing') {
      this.ui.setPrompt('Очередь пуста. Ждём клиентов...');
    } else {
      this.ui.setPrompt('');
    }
  }
}
