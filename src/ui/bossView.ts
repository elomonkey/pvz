import {
  ZINA_BARCODE_SEGMENTS,
  type BossDialogueLine,
  type ZinaBarcodeSegment,
} from '../data';
import {
  byId,
  clear,
  createDialogueLine,
  setProgressFill,
} from './components';
import { BossDialogueScene } from './bossDialogueScene';
import './bossDialogue.css';

export interface BossActions {
  onServe: () => void;
  onArgue: () => void;
  onMash: () => void;
  onDone: () => void;
  onFinalDialogueDone: () => void;
  onZinaMove: (index: number) => void;
  onSoundInit: () => void;
  onClosePanels: () => void;
}

export class BossView {
  private actions: BossActions | null = null;

  private readonly modal = byId('boss-modal');
  private readonly kicker = byId('boss-kicker');
  private readonly badge = byId('boss-badge');
  private readonly name = byId('boss-name');
  private readonly quote = byId('boss-quote');
  private readonly serveTitle = byId('boss-serve-title');
  private readonly serveLabel = byId('boss-serve-label');
  private readonly serveStress = byId('boss-serve-stress');
  private readonly serveTail = byId('boss-serve-tail');
  private readonly argueTitle = byId('boss-argue-title');
  private readonly argueSub = byId('boss-argue-sub');
  private readonly choiceView = byId('boss-choice-view');
  private readonly argueView = byId('boss-argue-view');
  private readonly resultView = byId('boss-result-view');
  private readonly serve = byId('boss-serve') as HTMLButtonElement;
  private readonly argue = byId('boss-argue') as HTMLButtonElement;
  private readonly mash = byId('boss-mash') as HTMLButtonElement;
  private readonly feedback = byId('boss-feedback');
  private readonly score = byId('boss-score');
  private readonly roundLine = byId('boss-round-line');
  private readonly timerFill = byId('boss-timer-fill');
  private readonly tauntList = byId('boss-taunt-list');
  private readonly dialogPanel = byId('boss-dialog-panel');
  private readonly dialogHead = byId('boss-dialog-head');
  private readonly zinaView = byId('boss-zina-view');
  private readonly zinaPuzzle = byId('zina-puzzle');
  private readonly zinaBarcodeTarget = byId('zina-barcode-target');
  private readonly zinaTimerFill = byId('zina-timer-fill');
  private readonly zinaFeedback = byId('zina-feedback');
  private readonly resultTitle = byId('boss-result-title');
  private readonly resultDetail = byId('boss-result-detail');
  private readonly resultQuote = byId('boss-result-quote');
  private readonly done = byId('boss-done') as HTMLButtonElement;
  private readonly finalView = byId('boss-final-view');
  private readonly finalPhaseLabel = byId('final-boss-phase-label');
  private readonly finalDialogue = byId('final-boss-dialogue');
  private readonly finalDone = byId('final-boss-done') as HTMLButtonElement;
  private readonly tugMarker = byId('tug-marker');
  private readonly tugBossEnd = byId('tug-boss-end');
  private readonly scene = new BossDialogueScene(this.modal);

  bind(actions: BossActions): void {
    this.actions = actions;
    this.serve.addEventListener('click', () => actions.onServe());
    this.argue.addEventListener('click', () => actions.onArgue());
    this.mash.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.onMash();
    });
    this.mash.addEventListener('keydown', event => {
      if (this.scene.active && !event.repeat && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        actions.onMash();
      }
    });
    this.done.addEventListener('click', () => actions.onDone());
    this.finalDone.addEventListener('click', () => actions.onFinalDialogueDone());
    this.zinaPuzzle.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tile-index]');
      if (!target) return;
      actions.onSoundInit();
      actions.onZinaMove(Number(target.dataset.tileIndex));
    });
  }

  showFinalBossDialogue(
    phase: string,
    lines: BossDialogueLine[],
    button: string,
  ): void {
    this.modal.classList.remove('client-argue');
    this.kicker.textContent = 'ФИНАЛЬНЫЙ БОСС';
    this.badge.textContent = '!';
    this.name.textContent = 'Галя и Валера';
    this.quote.textContent = 'Семейный спор';
    this.choiceView.classList.add('hidden');
    this.argueView.classList.add('hidden');
    this.zinaView.classList.add('hidden');
    this.resultView.classList.add('hidden');
    this.dialogPanel.classList.add('hidden');
    this.finalView.classList.remove('hidden');
    this.finalPhaseLabel.textContent = phase;
    clear(this.finalDialogue);
    for (const [index, line] of lines.entries()) {
      const row = createDialogueLine({ speaker: line.speaker, text: line.text, tone: line.tone });
      row.style.setProperty('--line-index', String(index));
      this.finalDialogue.appendChild(row);
    }
    this.finalDone.textContent = button;
    this.modal.classList.remove('hidden');
    this.actions?.onClosePanels();
    // Galya's existing family dialogue is kept intact, including Valera's lines.
    this.scene.open('galya', 'final', phase.includes('2') ? 'surprised' : 'angry');
  }

  showBoss(serveStress: number, line: string, name = 'Галя'): void {
    this.scene.close();
    this.modal.classList.remove('client-argue');
    this.kicker.textContent = 'БОСС';
    this.badge.textContent = '!';
    this.name.textContent = name;
    this.quote.textContent = line;
    this.serveTitle.textContent = 'Обслужить';
    this.serveLabel.textContent = 'Желание уволиться: +';
    this.serveStress.textContent = String(serveStress);
    this.serveTail.textContent = '. Тётка уйдёт, но вы выгорите.';
    this.argueTitle.textContent = 'Вступить в спор';
    this.argueSub.textContent =
      'Перетягивание на тапах. Победа — бустер, поражение — критический стресс.';
    this.dialogHead.textContent = 'ГОВОРИТ БОСС';
    this.tugBossEnd.textContent = 'Тётка';
    this.choiceView.classList.remove('hidden');
    this.argueView.classList.add('hidden');
    this.zinaView.classList.add('hidden');
    this.dialogPanel.classList.add('hidden');
    this.resultView.classList.add('hidden');
    this.finalView.classList.add('hidden');
    this.feedback.textContent = '';
    this.mash.classList.add('hidden');
    clear(this.tauntList);
    this.resultQuote.textContent = '';
    this.resultQuote.classList.add('hidden');
    this.modal.classList.remove('hidden');
    this.actions?.onClosePanels();
    if (name === 'Галя') this.scene.open('galya', 'choice', 'angry');
  }

  showClientArgue(name: string, line: string, concedeStress: number): void {
    this.scene.close();
    this.modal.classList.add('client-argue');
    this.kicker.textContent = 'СПОР С КЛИЕНТОМ';
    this.badge.textContent = '!';
    this.name.textContent = name;
    this.quote.textContent = line;
    this.serveTitle.textContent = 'Уступить';
    this.serveLabel.textContent = 'Стресс: +';
    this.serveStress.textContent = String(concedeStress);
    this.serveTail.textContent = '. Клиент успокоится, обслуживание продолжится.';
    this.argueTitle.textContent = 'Вступить в спор';
    this.argueSub.textContent =
      'Победа — −8 стресса и +0,1 репутации. Поражение — +10 стресса и −0,2 репутации.';
    this.dialogHead.textContent = 'ГОВОРИТ КЛИЕНТ';
    this.tugBossEnd.textContent = 'Клиент';
    this.choiceView.classList.remove('hidden');
    this.argueView.classList.add('hidden');
    this.zinaView.classList.add('hidden');
    this.dialogPanel.classList.add('hidden');
    this.resultView.classList.add('hidden');
    this.finalView.classList.add('hidden');
    this.feedback.textContent = '';
    this.mash.classList.add('hidden');
    clear(this.tauntList);
    this.resultQuote.textContent = '';
    this.resultQuote.classList.add('hidden');
    this.modal.classList.remove('hidden');
    this.actions?.onClosePanels();
  }

  showBossArgue(): void {
    this.choiceView.classList.add('hidden');
    this.argueView.classList.remove('hidden');
    this.zinaView.classList.add('hidden');
    this.dialogPanel.classList.remove('hidden');
    this.resultView.classList.add('hidden');
    this.finalView.classList.add('hidden');
    this.feedback.textContent = '';
    this.roundLine.classList.add('mash-line');
    this.mash.classList.add('hidden');
    clear(this.tauntList);
    this.tugMarker.classList.remove('mashing');
    this.setBossMarker(0);
    this.score.textContent = 'Перетягивание';
    this.scene.setMode('argue');
  }

  pushBossTaunt(text: string): void {
    clear(this.tauntList);
    const bubble = document.createElement('div');
    bubble.className = 'boss-taunt';
    bubble.textContent = text;
    this.tauntList.appendChild(bubble);
    if (this.scene.active) {
      this.quote.textContent = text;
      this.scene.pulse();
    }
  }

  showZinaGame(
    name: string,
    line: string,
    target: number[],
    board: (number | null)[],
    time: number,
    total: number,
  ): void {
    this.scene.close();
    this.modal.classList.remove('client-argue');
    this.kicker.textContent = 'БОСС';
    this.badge.textContent = '!';
    this.name.textContent = name;
    this.quote.textContent = line;
    this.dialogHead.textContent = 'ГОВОРИТ БОСС';
    this.tugBossEnd.textContent = 'Тётка';
    this.choiceView.classList.add('hidden');
    this.argueView.classList.add('hidden');
    this.dialogPanel.classList.add('hidden');
    this.resultView.classList.add('hidden');
    this.finalView.classList.add('hidden');
    this.zinaView.classList.remove('hidden');
    this.setZinaFeedback('', true);
    this.renderZinaBarcodeTarget(target);
    this.renderZinaPuzzle(board, target);
    this.updateZinaTimer(time / total);
    this.modal.classList.remove('hidden');
    this.actions?.onClosePanels();
    this.scene.open('zina', 'puzzle', time / total < 0.28 ? 'angry' : 'stern');
  }

  renderZinaPuzzle(board: (number | null)[], target: number[]): void {
    const focusedTile = this.zinaPuzzle.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.tileIndex
      : undefined;
    const targets = [0, 1, 3, 4];
    clear(this.zinaPuzzle);

    board.forEach((value, index) => {
      const targetOrder = targets.indexOf(index);
      const isTarget = targetOrder >= 0;
      const targetSegment = isTarget ? ZINA_BARCODE_SEGMENTS[target[targetOrder]] : null;

      if (value === null) {
        const empty = document.createElement('div');
        empty.className = 'zina-tile empty';
        empty.classList.toggle('target', isTarget);
        if (targetSegment) empty.style.setProperty('--target-color', targetSegment.color);
        if (isTarget) {
          const badge = document.createElement('span');
          badge.className = 'zina-tile-badge';
          badge.textContent = String(targetOrder + 1);
          empty.appendChild(badge);
        }
        this.zinaPuzzle.appendChild(empty);
        return;
      }

      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'zina-tile';
      tile.dataset.tileIndex = String(index);
      tile.classList.toggle('target', isTarget);
      if (targetSegment) tile.style.setProperty('--target-color', targetSegment.color);

      const isFiller = value >= ZINA_BARCODE_SEGMENTS.length;
      if (isFiller) {
        tile.classList.add('filler');
        tile.setAttribute('aria-label', 'Пустая плитка');
        const dots = document.createElement('span');
        dots.className = 'zina-filler-dots';
        dots.textContent = '• • •';
        tile.appendChild(dots);
      } else {
        const segment = ZINA_BARCODE_SEGMENTS[value];
        tile.classList.add('barcode');
        tile.setAttribute('aria-label', 'Фрагмент штрихкода');
        if (segment) {
          tile.style.setProperty('--seg', segment.color);
          tile.appendChild(this.createBarcodeBars(segment));
        }
        tile.classList.toggle('correct', isTarget && value === target[targetOrder]);
      }

      if (isTarget) {
        const badge = document.createElement('span');
        badge.className = 'zina-tile-badge';
        badge.textContent = String(targetOrder + 1);
        tile.appendChild(badge);
      }
      this.zinaPuzzle.appendChild(tile);
    });
    // Rebuilding the board must not drop keyboard focus after a tile moves.
    if (this.scene.active && focusedTile !== undefined) {
      const tile = this.zinaPuzzle.querySelector<HTMLElement>(`[data-tile-index="${focusedTile}"]`);
      if (tile) tile.focus({ preventScroll: true });
      else this.scene.focusControl();
    }
  }

  updateZinaTimer(ratio: number): void {
    setProgressFill(this.zinaTimerFill, ratio);
    this.zinaTimerFill.classList.toggle('danger', ratio < 0.28);
    this.scene.setEmotion(ratio < 0.28 ? 'angry' : 'stern', false);
  }

  setZinaFeedback(text: string, good: boolean): void {
    this.zinaFeedback.textContent = text;
    this.zinaFeedback.classList.toggle('good', good);
    if (!good && text) this.scene.pulse();
  }

  startBossMash(): void {
    this.roundLine.textContent = 'Переспорьте аргументы!';
    this.roundLine.classList.add('mash-line');
    this.mash.classList.remove('hidden');
    this.tugMarker.classList.add('mashing');
    this.feedback.textContent = 'Тапайте по кнопке — шкала поедет в вашу сторону.';
    this.feedback.classList.remove('good');
    this.score.textContent = 'Перетягивание';
    this.updateBossTimer(1);
    this.scene.focusControl();
  }

  setBossMarker(value: number): void {
    const clamped = Math.max(-1, Math.min(1, value));
    this.tugMarker.style.left = `${50 + clamped * 40}%`;
    this.scene.reactToAdvantage(clamped);
  }

  updateBossTimer(ratio: number): void {
    setProgressFill(this.timerFill, ratio);
    this.timerFill.classList.toggle('danger', ratio < 0.28);
  }

  showBossResult(
    title: string,
    detail: string,
    success: boolean,
    finalQuote = '',
  ): void {
    this.choiceView.classList.add('hidden');
    this.argueView.classList.add('hidden');
    this.zinaView.classList.add('hidden');
    this.dialogPanel.classList.add('hidden');
    this.finalView.classList.add('hidden');
    this.resultView.classList.remove('hidden');
    this.resultTitle.textContent = title;
    this.resultDetail.textContent = detail;
    this.resultQuote.textContent = finalQuote;
    this.resultQuote.classList.toggle('hidden', !finalQuote);
    this.resultTitle.classList.toggle('win', success);
    this.resultTitle.classList.toggle('lose', !success);
    if (this.scene.active && finalQuote) this.quote.textContent = finalQuote;
    this.scene.setMode('result');
    this.scene.setEmotion(
      success ? 'surprised' : this.modal.dataset.portraitCharacter === 'zina' ? 'angry' : 'stern',
    );
  }

  hideBoss(): void {
    this.scene.close();
    this.modal.classList.add('hidden');
    this.finalView.classList.add('hidden');
  }

  private renderZinaBarcodeTarget(target: number[]): void {
    clear(this.zinaBarcodeTarget);
    for (const id of target) {
      const segment = ZINA_BARCODE_SEGMENTS[id];
      if (!segment) continue;
      const segmentEl = document.createElement('div');
      segmentEl.className = 'zina-barcode-segment';
      segmentEl.style.setProperty('--seg', segment.color);
      segmentEl.appendChild(this.createBarcodeBars(segment));
      this.zinaBarcodeTarget.appendChild(segmentEl);
    }
  }

  private createBarcodeBars(segment: ZinaBarcodeSegment): HTMLElement {
    const bars = document.createElement('div');
    bars.className = 'zina-barcode-bars';
    for (const width of segment.bars) {
      const bar = document.createElement('span');
      bar.style.flex = `${width} 1 0`;
      bars.appendChild(bar);
    }
    return bars;
  }
}
