export interface Vec2 {
  x: number;
  z: number;
}

export type PropKind = 'none' | 'bag' | 'backpack' | 'phone' | 'cane' | 'selfie';
export type PersonBuild = 'slim' | 'regular' | 'round' | 'tall';
export type HairStyle = 'short' | 'bob' | 'long' | 'bun' | 'bald';
export type Headwear = 'none' | 'cap' | 'scarf';
export type PersonAccessory =
  | 'none'
  | 'glasses'
  | 'sunglasses'
  | 'headphones'
  | 'earrings'
  | 'tie'
  | 'lanyard';

export interface Archetype {
  id: string;
  name: string;
  coat: string;
  pants: string;
  skin: string;
  hair: string;
  accent: string;
  prop: PropKind;
  scale: number;
  shout: string[];
  build?: PersonBuild;
  hairStyle?: HairStyle;
  headwear?: Headwear;
  accessory?: PersonAccessory;
}

export type UpgradeId = 'speed' | 'charm' | 'tolerance' | 'toy' | 'scanner';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  max: number;
  costs: number[];
}

export type DecorId = 'tv' | 'clock' | 'sign' | 'rug' | 'cat' | 'walls' | 'floor';

export interface DecorDef {
  id: DecorId;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  permanent: boolean;
}

export type DecorOwnership = Record<DecorId, boolean>;

export function createDecorState(): DecorOwnership {
  return { tv: false, clock: false, sign: false, rug: false, cat: false, walls: false, floor: false };
}

// L-образная комната: основной зал справа, склад-крыло слева.
export const ROOM = {
  minX: -8.2,
  maxX: 5.0,
  minZ: -2.0,
  maxZ: 3.8,
  wallH: 3.2,
};

export interface ShelfDef {
  x: number;
  z: number;
  rotation: number;
  face: number;
  columns: number;
  cellW: number;
  activeFromShift: number;
}

export const SHELF_LETTERS = ['A', 'B', 'C'] as const;

// Два стеллажа в складском крыле. Со второй смены появляется компактный C.
export const SHELF_DEFS: ShelfDef[] = [
  {
    x: -3.8,
    z: 0.29,
    rotation: Math.PI,
    face: 0,
    columns: 4,
    cellW: 0.56,
    activeFromShift: 1,
  },
  {
    x: -6.45,
    z: 0.29,
    rotation: Math.PI,
    face: 0,
    columns: 4,
    cellW: 0.56,
    activeFromShift: 1,
  },
  {
    x: -7.55,
    z: -0.85,
    rotation: Math.PI / 2,
    face: -Math.PI / 2,
    columns: 3,
    cellW: 0.45,
    activeFromShift: 2,
  },
];

export const LEVELS = 3;
export const CELL_H = 0.58;
export const SHELF_H = 2.12;
export const SHELF_D = 0.52;

export function shelfWidth(def: ShelfDef): number {
  return def.columns * def.cellW + 0.24;
}

export const COUNTER = {
  x: 1.3,
  z: 0.25,
  w: 5.8,
  d: 0.6,
  h: 1.08,
};

export const SERVICE_POINT: Vec2 = { x: 0.4, z: -0.55 };
// Шкафчик возвратов в расширенной зоне сотрудника.
export const STAFF_SHELF = { x: 3.45, z: -1.15, w: 1.35, d: 0.42, h: 1.65 };
export const RETURN_POINT: Vec2 = { x: 2.75, z: -0.6 };
export const QUEUE_X = 0.4;
export const QUEUE_SPOTS: Vec2[] = [
  { x: QUEUE_X, z: 1.15 },
  { x: QUEUE_X, z: 1.85 },
  { x: QUEUE_X, z: 2.55 },
  { x: QUEUE_X, z: 3.25 },
];
export const ENTRY_POINT: Vec2 = { x: -0.9, z: 4.68 };
export const ENTRY_TURN_POINT: Vec2 = { x: 2.05, z: 4.68 };
export const EXIT_POINT: Vec2 = { x: 2.5, z: 4.68 };
export const PLAYER_START = SERVICE_POINT;

// Игрушка стоит на стойке со стороны сотрудника, рядом с монитором.
// Так она не пересекается с клиентом и по ней сложнее промахнуться при выдаче.
export const TOY = { x: -0.55, z: 0.07, y: 1.245 };
export const TV = { x: -1.56, z: 2.45, y: 2.2 };
export const STORAGE_WALL_X = -1.7;
export const STORAGE_DOOR = { x: -1.6, z: -0.6, width: 1.2 };
export const FRONT_DOOR = { x: 1.8, z: 3.6, width: 0.8 };

export const SHELF_POINTS: Vec2[] = [
  { x: -3.2, z: -0.55 },
  { x: -5.7, z: -0.55 },
  { x: -6.05, z: -0.77 },
];

// Статичная камера из второй версии: общий 3/4-вид на L-образную комнату.
export const CAMERA = {
  pos: { x: 3.2, y: 8.8, z: -7.0 },
  target: { x: -0.8, y: 0.6, z: 0.75 },
  viewHeight: 11.0,
  minAspectWidth: 15.0,
};

export const MAX_STRESS = 100;
export const MAX_QUEUE = 4;

export const PALETTE = {
  bg: '#e3ece7',
  floor: '#d8c6a6',
  floorLine: '#c9b48f',
  clientFloor: '#d9c8a8',
  staffFloor: '#c8b795',
  storageFloor: '#b9b4a8',
  wall: '#f2efe7',
  wallTrim: '#d8cdbd',
  shelfFrame: '#c99766',
  shelfBoard: '#e0bb8a',
  cellDark: '#59645c',
  counterBase: '#7f9f89',
  counterTop: '#e0bb8a',
  cream: '#fff4e3',
  ink: '#26313a',
  accent: '#f0b44c',
  blue: '#6f9fc4',
  green: '#7f9f89',
  red: '#d9776a',
  purple: '#8e5a6e',
  toy: '#ffb703',
  tv: '#1b232c',
};

export const PARCEL_COLORS = [
  '#d98b72',
  '#6f9fc4',
  '#e4c58c',
  '#8fae9b',
  '#a98bb5',
  '#d98fa8',
  '#7fb8c9',
  '#e0a36f',
  '#c97a5f',
  '#6f9e8e',
];

export const ARCHETYPES: Archetype[] = [
  {
    id: 'student',
    name: 'Студент',
    coat: '#4d7ea8',
    pants: '#2f3e4e',
    skin: '#e7b38a',
    hair: '#3a2a20',
    accent: '#f2cc8f',
    prop: 'backpack',
    scale: 0.96,
    shout: ['Мне ещё на пару!', 'У меня десять заказов!', 'Я просто спросить...'],
    build: 'slim',
    hairStyle: 'short',
    accessory: 'headphones',
  },
  {
    id: 'mom',
    name: 'Мама с коляской',
    coat: '#d98fa3',
    pants: '#4a3f4f',
    skin: '#f0c8a8',
    hair: '#6b4a3a',
    accent: '#f7e1b5',
    prop: 'bag',
    scale: 1.0,
    shout: ['У меня ребёнок в машине!', 'Вы можете быстрее?', 'Я на минуточку!'],
    build: 'regular',
    hairStyle: 'bob',
    accessory: 'earrings',
  },
  {
    id: 'courier',
    name: 'Курьер',
    coat: '#f2b134',
    pants: '#2e3a46',
    skin: '#d9a06f',
    hair: '#2b2b2b',
    accent: '#3d8bfd',
    prop: 'phone',
    scale: 1.02,
    shout: ['У меня двадцать адресов!', 'Где накладная?', 'Я на работе вообще-то!'],
    build: 'slim',
    hairStyle: 'short',
    headwear: 'cap',
  },
  {
    id: 'elderly',
    name: 'Пенсионерка',
    coat: '#b8a98a',
    pants: '#5a4a3a',
    skin: '#e3b892',
    hair: '#d7d7d7',
    accent: '#d95d5d',
    prop: 'cane',
    scale: 0.95,
    shout: ['Я тут полчаса стою!', 'Позовите начальника!', 'Внуки ждут!'],
    build: 'round',
    hairStyle: 'bun',
    accessory: 'glasses',
  },
  {
    id: 'blogger',
    name: 'Блогерша',
    coat: '#9b5de5',
    pants: '#2b2b38',
    skin: '#f0c8a8',
    hair: '#e05252',
    accent: '#00bbf9',
    prop: 'selfie',
    scale: 0.98,
    shout: ['Я это всё снимаю!', 'Подписчики увидят!', 'Это контент!'],
    build: 'slim',
    hairStyle: 'long',
    accessory: 'earrings',
  },
  {
    id: 'office',
    name: 'Офисный',
    coat: '#6b7a8f',
    pants: '#2f3e4e',
    skin: '#e7b38a',
    hair: '#3a2a20',
    accent: '#81b29a',
    prop: 'bag',
    scale: 1.0,
    shout: ['У меня встреча!', 'Вы сорвали мне день!', 'Сколько можно?'],
    build: 'regular',
    hairStyle: 'short',
    accessory: 'tie',
  },
];

export const BOSS_ARCHETYPE: Archetype = {
  id: 'boss',
  name: 'Галя',
  coat: '#8e2f4f',
  pants: '#2b2b2b',
  skin: '#e0a97f',
  hair: '#2b2b2b',
  accent: '#f2b134',
  prop: 'bag',
  scale: 1.14,
  shout: ['Вы вообще работаете?', 'Я жалобу напишу!', 'Позовите начальника!'],
  build: 'round',
  hairStyle: 'bun',
  accessory: 'earrings',
};

export const BABA_ARCHETYPE: Archetype = {
  id: 'baba-zina',
  name: 'Баба Зина',
  coat: '#8a9bb5',
  pants: '#4a3f52',
  skin: '#e8c3a1',
  hair: '#d7d7d7',
  accent: '#e9d8a6',
  prop: 'cane',
  scale: 0.98,
  shout: ['Ой, милок, помоги!', 'Глаза уже не те...', 'А код где?'],
  build: 'round',
  hairStyle: 'bun',
  headwear: 'scarf',
  accessory: 'glasses',
};

export const SHIFT_STORIES = [
  {
    day: 'Понедельник',
    text: 'Галя устраивает скандал и обещает вернуться.',
  },
  {
    day: 'Вторник',
    text: 'Баба Зина рассказывает слухи о конфликте в местном ПВЗ. Галя жаловалась соседям.',
  },
  {
    day: 'Среда',
    text: 'Курьер Саня привёз сразу несколько заказов и очень спешит.',
  },
  {
    day: 'Четверг',
    text: 'Открываются примерочные. Но в ПВЗ уже спешит Королева примерочной.',
  },
  {
    day: 'Пятница',
    text: 'Галя возвращается с мужем Валерой. Финальная примерка и возврат всего.',
  },
];

export const VALERA_ARCHETYPE: Archetype = {
  id: 'valera',
  name: 'Валера',
  coat: '#6b7a8f',
  pants: '#2e3a46',
  skin: '#d9a06f',
  hair: '#4a3a2a',
  accent: '#f2b134',
  prop: 'bag',
  scale: 1.03,
  shout: ['ДА НОРМАЛЬНАЯ ОНА!', 'ТАК ЗАЧЕМ ТЫ МЕНЯ ПРИВЕЛА?!', 'Я НЕ ВИНОВАТ!'],
  build: 'regular',
  hairStyle: 'short',
  headwear: 'cap',
};

export interface BossDialogueLine {
  speaker: string;
  text: string;
  tone?: 'galya' | 'valera' | 'narrator';
}

export const FINAL_BOSS_ENTRANCE_LINES: BossDialogueLine[] = [
  { speaker: 'Галя', text: 'ВАЛЕРА! РАЗБЕРИСЬ!', tone: 'galya' },
  { speaker: 'Валера', text: 'А что сразу я? Это твои посылки!', tone: 'valera' },
  { speaker: 'Галя', text: 'ТЕБЯ ВООБЩЕ НИКТО НЕ СПРАШИВАЛ!', tone: 'galya' },
  { speaker: 'Валера', text: 'Ну и пожалуйста. Опять я виноват.', tone: 'valera' },
  { speaker: 'Галя', text: 'Всё, работаем. И без глупостей!', tone: 'galya' },
  {
    speaker: 'Рассказчик',
    text: 'Валера пытается поспорить, но Галя перебивает. Семейный спор действует до конца смены.',
    tone: 'narrator',
  },
];

export const FINAL_BOSS_MID_LINES: BossDialogueLine[] = [
  { speaker: 'Галя', text: 'Стоп. Третий штрихкод не мой. Это Валерин.', tone: 'galya' },
  { speaker: 'Валера', text: 'Я ничего не заказывал!', tone: 'valera' },
  { speaker: 'Галя', text: 'ЗНАЧИТ, БУДЕШЬ МЕРИТЬ.', tone: 'galya' },
];

export const GALYA_SHOUT_LINES = [
  'Быстрее!',
  'У вас что, совсем ноги не ходят?',
  'Я тут не одна стою!',
  'Шевелитесь, я считаю!',
  'Вы там уснули?',
  'Мне ещё возврат оформлять!',
  'Ну и скорость...',
  'Валера, не отвлекай!',
  'Долго мне ещё ждать?',
];

export const FINAL_BOSS_FITTING_LINES: BossDialogueLine[] = [
  { speaker: 'Галя', text: 'Валера, снимай куртку! Она тебе мала!', tone: 'galya' },
  { speaker: 'Валера', text: 'ДА НОРМАЛЬНАЯ ОНА!', tone: 'valera' },
  { speaker: 'Галя', text: 'ТЕБЯ ВООБЩЕ НИКТО НЕ СПРАШИВАЛ!', tone: 'galya' },
  { speaker: 'Валера', text: 'ТАК ЗАЧЕМ ТЫ МЕНЯ ПРИВЕЛА?!', tone: 'valera' },
  { speaker: 'Галя', text: 'ВОЗВРАТ ВСЕГО!', tone: 'galya' },
  {
    speaker: 'Рассказчик',
    text: 'Галя протягивает тебе первый возврат. Осталось сдать три.',
    tone: 'narrator',
  },
];

export const SANYA_ARCHETYPE: Archetype = {
  id: 'sanya',
  name: 'Курьер Саня',
  coat: '#f2b134',
  pants: '#2e3a46',
  skin: '#d9a06f',
  hair: '#2b2b2b',
  accent: '#3d8bfd',
  prop: 'phone',
  scale: 1.04,
  shout: ['У меня четыре адреса!', 'Быстрее, опаздываю!', 'Давайте все сразу!'],
  build: 'slim',
  hairStyle: 'short',
  headwear: 'cap',
};

export const QUEEN_ARCHETYPE: Archetype = {
  id: 'fitting-queen',
  name: 'Королева примерочной',
  coat: '#8e2f4f',
  pants: '#2b2b2b',
  skin: '#f0c8a8',
  hair: '#e05252',
  accent: '#ffd166',
  prop: 'selfie',
  scale: 1.08,
  shout: ['Мне всё не то!', 'Я передумала!', 'Где мои вещи?!'],
  build: 'tall',
  hairStyle: 'long',
  accessory: 'earrings',
};

export const QUEEN_LINES = [
  'Я передумала! Принесите другое.',
  'Это не мой размер! И это тоже.',
  'Королева не ждёт!',
  'Мне нужно всё и сразу!',
];

export const QUEEN_RETURN_LINES = [
  'Это не подошло! Заберите возврат.',
  'Мне не подошёл размер. Вот возврат.',
  'Королева передумала. Примите возврат!',
  'Заберите это обратно, я не буду носить.',
];

export const ZINA_INTRO_LINES = [
  'Милок, телефон просит штрихкод, а он порвался. Собери полоски по образцу.',
  'Внучок, помоги: штрихкод рассыпался на плитки. Сложи полоски, как на образце.',
  'Ой, милок, без штрихкода телефон не пускает. Собери его из плиток, будь добр.',
];

export interface ZinaBarcodeSegment {
  id: number;
  color: string;
  bars: number[];
}

// Четыре куска простого штрихкода: цветной корешок + свой рисунок полос.
export const ZINA_BARCODE_SEGMENTS: ZinaBarcodeSegment[] = [
  { id: 0, color: '#e05d5d', bars: [3, 1, 2] },
  { id: 1, color: '#4d8fe8', bars: [1, 3, 1, 2] },
  { id: 2, color: '#4caf6d', bars: [2, 1, 3] },
  { id: 3, color: '#f2b134', bars: [1, 2, 3, 1] },
];

export const ZINA_FILLER_TILE = ZINA_BARCODE_SEGMENTS.length;

export const ZINA_WIN_LINE = 'Вот спасибо, милок! Штрихкод подошёл. Забери мою посылку — я скажу, из какой ячейки.';
export const ZINA_LOSE_LINE = 'Эх, не собрала штрихкод... Придётся жаловаться, милок.';

export const BOSS_LINES = [
  'Вы вообще работаете? Мне быстро надо!',
  'Я тут полчаса стою! Позовите начальника!',
  'Вы обслуживающий персонал, вы обязаны!',
  'Я жалобу напишу! Мне надоело!',
  'У меня ребёнок в машине, быстро принесите заказ!',
  'Это что за отношение к клиентам?!',
];

// Реплики в правой ленте во время спора: стартовая и далее каждые 15%.
export const BOSS_ARGUE_LINES = [
  'Вы меня не переспорите!',
  'Я тут полчаса стою!',
  'Это ваша работа, вот и работайте!',
  'У меня ребёнок в машине!',
  'Я жалобу напишу!',
  'Вы вообще работаете?',
  'Позовите начальника!',
  'Мне надоело это терпеть!',
  'Вы обязаны мне помочь!',
  'Я всё сниму на видео!',
];

export const BOSS_WIN_LINE = 'Ладно, ваша взяла... но я ещё вернусь!';
export const BOSS_LOSE_LINE = 'А я говорила! Жалобу я уже написала.';
export const BOSS_SERVED_LINE = 'Наконец-то! Но я всё равно недовольна.';

export const CLIENT_ARGUE_LINES = [
  'Я тут полчаса стою! Почему так долго?',
  'Вы что, не видите, что я спешу?',
  'Почему нельзя было предупредить?',
  'Мне кажется, вы специально копаетесь.',
  'Сколько можно ждать?',
  'Я буду жаловаться!',
  'У вас вообще есть совесть?',
  'Мне надоело это терпеть!',
];

export const CLIENT_ARGUE_TAUNTS = [
  'Вы меня не переспорите!',
  'Я тут полчаса стою!',
  'Это ваша работа!',
  'Мне некогда!',
  'Я жалобу напишу!',
  'Вы специально копаетесь!',
  'Позовите начальника!',
  'Мне надоело!',
  'Вы обязаны мне помочь!',
  'Я всё сниму на видео!',
];

export const CLIENT_ARGUE_WIN_LINES = [
  'Ладно, ладно. Вы правы, извините.',
  'Хорошо, убедили. Пойду спокойно.',
  'Ну вот, сразу бы так. Без обид.',
];

export const CLIENT_ARGUE_LOSE_LINES = [
  'Вот именно! Придётся вам меня обслужить.',
  'Так-то лучше. И побыстрее, пожалуйста.',
  'Я так и знал(а), что вы признаете ошибку.',
];

export const CLIENT_ARGUE_CONCEDE_LINES = [
  'Ну наконец-то. Давайте быстрее.',
  'Ладно, но в следующий раз — без задержек.',
  'Хорошо, но я это запомню.',
];

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'speed',
    name: 'Кроссовки',
    icon: '👟',
    desc: '+8% скорость передвижения за уровень',
    max: 3,
    costs: [850, 1350, 1900],
  },
  {
    id: 'charm',
    name: 'Обаяние',
    icon: '🙂',
    desc: 'Легче договариваться: −5 к стрессу за обслуживание тётки, меньше стресса и фора в спорах с клиентами',
    max: 3,
    costs: [950, 1500, 2100],
  },
  {
    id: 'tolerance',
    name: 'Терпимость',
    icon: '🧘',
    desc: '−10% к росту желания уволиться за уровень',
    max: 3,
    costs: [900, 1450, 2000],
  },
  {
    id: 'toy',
    name: 'Антистресс',
    icon: '🧸',
    desc: 'Базовый тап: 0,2 стресса, +0,1 за уровень. Максимум −30% за смену',
    max: 3,
    costs: [700, 1100, 1600],
  },
  {
    id: 'scanner',
    name: 'Сканер',
    icon: '📡',
    desc: 'Заменяет разбитый сканер: ячейки снова подсвечиваются',
    max: 1,
    costs: [5000],
  },
];

// Магазин оформления ПВЗ. Косметика покупается навсегда, телевизор — на забег.
export const DECOR_ITEMS: DecorDef[] = [
  {
    id: 'cat',
    name: 'Кот-талисман',
    icon: '🐈',
    desc: 'Фигурка на стойке',
    cost: 400,
    permanent: true,
  },
  {
    id: 'clock',
    name: 'Синие часы',
    icon: '🕒',
    desc: 'Новый циферблат на стене',
    cost: 450,
    permanent: true,
  },
  {
    id: 'rug',
    name: 'Морской коврик',
    icon: '🟦',
    desc: 'Синий ковёр в клиентской зоне',
    cost: 550,
    permanent: true,
  },
  {
    id: 'sign',
    name: 'Неоновая вывеска',
    icon: '🪧',
    desc: 'Подсветит вывеску ПВЗ',
    cost: 900,
    permanent: true,
  },
  {
    id: 'walls',
    name: 'Мятные стены',
    icon: '🎨',
    desc: 'Свежий цвет стен',
    cost: 1250,
    permanent: true,
  },
  {
    id: 'floor',
    name: 'Дубовый пол',
    icon: '🪵',
    desc: 'Тёплый пол в зале',
    cost: 1500,
    permanent: true,
  },
  {
    id: 'tv',
    name: 'Телевизор',
    icon: '📺',
    desc: 'Реклама отвлекает: терпение клиентов падает на 20% медленнее',
    cost: 2600,
    permanent: false,
  },
];

export const THANKS_LINES = ['Спасибо!', 'Наконец-то!', 'Спасибо, вы спасли мне день!', 'О, быстро!'];

export function cellId(shelf: number, column: number, level: number): string {
  // Полки считаем сверху вниз: 1 — верхняя, 3 — нижняя.
  return `${SHELF_LETTERS[shelf]}-${column + 1}-${LEVELS - level}`;
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
