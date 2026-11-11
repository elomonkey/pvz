interface YandexPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>): Promise<void>;
}

interface YandexSDK {
  features?: {
    LoadingAPI?: {
      ready?: () => void;
    };
  };
  getPlayer?: (options?: unknown) => Promise<YandexPlayer>;
  adv?: {
    showRewardedVideo?: (options: unknown) => void;
    showFullscreenAdv?: (options: unknown) => void;
  };
}

declare global {
  interface Window {
    YaGames?: {
      init: () => Promise<YandexSDK>;
    };
    ysdk?: YandexSDK;
  }
}

const BEST_KEY = 'pvz_tycoon_best';
const DECOR_KEY = 'pvz_tycoon_decor';
const TUTORIAL_KEY = 'pvz_tycoon_tutorial_done';
const SCANNER_BREAK_KEY = 'pvz_tycoon_scanner_break_seen';
const RESULTS_INTRO_KEY = 'pvz_tycoon_results_intro_seen';

export function loadBest(): number {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function loadDecorIds(): string[] {
  try {
    const raw = localStorage.getItem(DECOR_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function saveDecorIds(ids: string[]): void {
  try {
    localStorage.setItem(DECOR_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    /* noop */
  }
}

export function loadTutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveTutorialDone(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* noop */
  }
}

export function loadScannerBreakSeen(): boolean {
  try {
    return localStorage.getItem(SCANNER_BREAK_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveScannerBreakSeen(): void {
  try {
    localStorage.setItem(SCANNER_BREAK_KEY, '1');
  } catch {
    /* noop */
  }
}

export function loadResultsIntroSeen(): boolean {
  try {
    return localStorage.getItem(RESULTS_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveResultsIntroSeen(): void {
  try {
    localStorage.setItem(RESULTS_INTRO_KEY, '1');
  } catch {
    /* noop */
  }
}

export function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.round(score)));
  } catch {
    /* noop */
  }

  const ysdk = window.ysdk;
  if (!ysdk?.getPlayer) return;
  void ysdk
    .getPlayer({ scopes: false })
    .then((player) => player.setData({ best: Math.round(score) }))
    .catch(() => {
      /* noop */
    });
}

/**
 * Инициализация Yandex Games SDK.
 * Если SDK не подключён (локальная разработка), игра просто работает дальше.
 */
export async function initYandex(): Promise<number | null> {
  const sdk = window.YaGames;
  if (!sdk) return null;

  try {
    const ysdk = await sdk.init();
    window.ysdk = ysdk;
    try {
      ysdk.features?.LoadingAPI?.ready?.();
    } catch {
      /* noop */
    }

    if (!ysdk.getPlayer) return null;
    const player = await ysdk.getPlayer({ scopes: false });
    const data = await player.getData(['best']);
    const best = data.best;
    if (typeof best === 'number' && Number.isFinite(best)) {
      if (best > loadBest()) {
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {
          /* noop */
        }
      }
      return best;
    }
  } catch {
    /* noop */
  }
  return null;
}
