export type ElementTag = keyof HTMLElementTagNameMap;

export function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Не найден элемент #${id}`);
  return element;
}

export interface OfferCardOptions {
  cardClass?: string;
  icon: string;
  artId?: string;
  name: string;
  description: string;
  status: string;
  maxed?: boolean;
  buttonLabel: string;
  buttonTone: 'gold' | 'ghost';
  buttonDisabled: boolean;
  onClick: () => void;
}

export interface QuestRowOptions {
  title: string;
  progress: string;
  completed: boolean;
  failed: boolean;
}

export interface ResultsQuestRowOptions {
  label: string;
  detail: string;
  completed: boolean;
  failed: boolean;
}

export interface DialogueLineOptions {
  speaker: string;
  text: string;
  tone?: string;
}

export interface CellButtonOptions {
  id: string;
  color: string;
  levelLabel: string;
  checked?: boolean;
  onClick: () => void;
}

export function el<K extends ElementTag>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  node.innerHTML = '';
}

/** Заполнение полосы прогресса: ratio в диапазоне 0..1. */
export function setProgressFill(node: HTMLElement, ratio: number): void {
  node.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

/** Карточка товара/улучшения для магазина результатов. */
export function createOfferCard(options: OfferCardOptions): HTMLDivElement {
  const card = el('div', options.cardClass ? `upgrade-card ${options.cardClass}` : 'upgrade-card');
  if (options.maxed) card.classList.add('maxed');

  const icon = el('div', 'upgrade-icon', options.icon);
  if (options.artId) {
    card.dataset.offer = options.artId;
    icon.dataset.art = options.artId;
    icon.setAttribute('aria-hidden', 'true');
  }
  const name = el('div', 'upgrade-name', options.name);
  const description = el('div', 'upgrade-desc', options.description);
  const status = el('div', 'upgrade-levels', options.status);

  const button = el('button', `btn small ${options.buttonTone}`);
  button.type = 'button';
  button.disabled = options.buttonDisabled;
  if (options.artId && options.buttonLabel.endsWith(' ₽')) {
    const coins = el('span', 'offer-price-icon');
    coins.setAttribute('aria-hidden', 'true');
    button.append(coins, document.createTextNode(options.buttonLabel));
  } else {
    button.textContent = options.buttonLabel;
  }
  button.addEventListener('click', options.onClick);

  card.append(icon, name, description, status, button);
  return card;
}

export function createQuestRow(options: QuestRowOptions): HTMLDivElement {
  const row = el('div', 'quest-row');
  if (options.completed) row.classList.add('completed');
  if (options.failed) row.classList.add('failed');

  const check = el(
    'span',
    'quest-check',
    options.completed ? '✓' : options.failed ? '✕' : '○',
  );
  row.append(
    check,
    el('span', 'quest-title', options.title),
    el('span', 'quest-progress', options.progress),
  );
  return row;
}

export function createResultsQuestRow(
  options: ResultsQuestRowOptions,
): HTMLDivElement {
  const row = el('div', 'results-quest-row');
  if (options.completed) row.classList.add('done');
  if (options.failed) row.classList.add('failed');
  const detail = el('small', undefined, options.detail);
  row.append(el('span', undefined, options.label), detail);
  return row;
}

export function createDialogueLine(options: DialogueLineOptions): HTMLDivElement {
  const row = el('div', `final-boss-line ${options.tone ?? 'narrator'}`);
  row.append(
    el('span', 'final-boss-speaker', options.speaker),
    el('span', 'final-boss-text', options.text),
  );
  return row;
}

export function createCellButton(options: CellButtonOptions): HTMLButtonElement {
  const button = el('button', 'cell-btn');
  button.type = 'button';
  button.dataset.cellId = options.id;
  if (options.checked) {
    button.classList.add('checked');
    button.disabled = true;
  }

  const parcel = el('span', 'cell-parcel');
  parcel.style.setProperty('--parcel', options.color);
  button.append(
    parcel,
    el('span', 'cell-id', options.id),
    el('span', 'cell-level', options.levelLabel),
  );
  button.addEventListener('click', options.onClick);
  return button;
}
