import type { CellPanelModel } from '../systems/scannerPanelSystem';
import { LEVELS } from '../data';
import {
  byId,
  clear,
  createCellButton,
  setProgressFill,
} from './components';

export interface ScannerActions {
  onScanComplete: () => void;
  onScannerClosed: () => void;
  onCellDismissed: () => void;
  onChooseCell: (cellId: string) => void;
  onSoundInit: () => void;
  onSoundClick: () => void;
}

export class ScannerView {
  private readonly panel = byId('scanner-panel');
  private readonly client = byId('scanner-client');
  private readonly scanView = byId('scanner-scan-view');
  private readonly resultView = byId('scanner-result-view');
  private readonly scanHold = byId('scan-hold') as HTMLButtonElement;
  private readonly scanFill = byId('scan-fill');
  private readonly scanText = byId('scan-text');
  private readonly scanCell = byId('scan-cell');
  private readonly scanCellLabel = byId('scan-cell-label');
  private readonly barcodeLine = byId('barcode-line');
  private readonly scanOk = byId('scan-ok') as HTMLButtonElement;
  private readonly scannerClose = byId('scanner-close') as HTMLButtonElement;

  private readonly cellPanel = byId('cell-panel');
  private readonly cellKicker = byId('cell-panel-kicker');
  private readonly cellSub = byId('cell-panel-sub');
  private readonly cellGrid = byId('cell-grid');
  private readonly cellClose = byId('cell-close') as HTMLButtonElement;
  private readonly signal = byId('signal');
  private readonly signalText = byId('signal-text');
  private readonly signalSegments = Array.from(
    document.querySelectorAll<HTMLElement>('.signal-bar i'),
  );

  private scanActive = false;
  private scanComplete = false;
  private scanHolding = false;
  private scanProgress = 0;
  private scanSpeed = 1;
  private tutorialCellTarget: string | null = null;
  private actions: ScannerActions | null = null;

  bind(actions: ScannerActions): void {
    this.actions = actions;
    this.scannerClose.addEventListener('click', () => {
      this.closeScanner();
      actions.onScannerClosed();
    });
    this.scanOk.addEventListener('click', () => {
      this.closeScanner();
      actions.onScannerClosed();
    });

    this.scanHold.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.scanActive || this.scanComplete) return;
      actions.onSoundInit();
      this.scanHolding = true;
      this.scanHold.classList.add('holding');
      this.scanText.textContent = 'Сканирую...';
      try {
        this.scanHold.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
    });

    const release = (event?: PointerEvent): void => {
      if (!this.scanHolding) return;
      this.scanHolding = false;
      this.scanHold.classList.remove('holding');
      if (!this.scanComplete) {
        this.scanProgress = 0;
        setProgressFill(this.scanFill, 0);
        this.scanText.textContent = 'Сканировать заказ';
        this.barcodeLine.classList.remove('scanning');
      }
      if (event) {
        try {
          this.scanHold.releasePointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
      }
    };

    this.scanHold.addEventListener('pointerup', release);
    this.scanHold.addEventListener('pointercancel', release);
    this.scanHold.addEventListener('lostpointercapture', () => {
      if (this.scanHolding) release();
    });
    window.addEventListener('pointerup', () => release());
    window.addEventListener('pointercancel', () => release());

    this.cellClose.addEventListener('click', () => {
      this.closeCellPanel();
      actions.onCellDismissed();
    });

    this.cellGrid.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-cell-id]');
      if (!target) return;
      actions.onSoundInit();
      actions.onSoundClick();
      actions.onChooseCell(target.dataset.cellId ?? '');
    });
  }

  update(dt: number): void {
    if (this.scanHolding && this.scanActive && !this.scanComplete) {
      this.scanProgress = Math.min(
        1,
        this.scanProgress + dt / (0.72 / this.scanSpeed),
      );
      setProgressFill(this.scanFill, this.scanProgress);
      this.barcodeLine.classList.add('scanning');
      if (this.scanProgress >= 1) this.finishScan();
    }
  }

  setScanSpeed(speed: number): void {
    this.scanSpeed = speed;
  }

  setTutorialTarget(target: 'scan' | 'cell' | null, cellId?: string): void {
    this.tutorialCellTarget = target === 'cell' ? (cellId ?? null) : null;
    this.scanHold.classList.remove('tutorial-target');
    for (const button of this.cellGrid.querySelectorAll('.cell-btn')) {
      button.classList.remove('tutorial-target');
    }
    if (target === 'scan') {
      this.scanHold.classList.add('tutorial-target');
      return;
    }
    if (target === 'cell' && cellId) {
      this.cellGrid
        .querySelector<HTMLButtonElement>(`[data-cell-id="${cellId}"]`)
        ?.classList.add('tutorial-target');
    }
  }

  openScanner(clientName: string): void {
    this.closeCellPanel();
    this.panel.classList.remove('hidden');
    this.client.textContent = clientName;
    this.scanView.classList.remove('hidden');
    this.resultView.classList.add('hidden');
    this.scanActive = true;
    this.scanComplete = false;
    this.scanHolding = false;
    this.scanProgress = 0;
    setProgressFill(this.scanFill, 0);
    this.scanText.textContent = 'Сканировать заказ';
    this.scanHold.classList.remove('holding');
    this.barcodeLine.classList.remove('scanning');
  }

  showScanResult(cell: string): void {
    const multi = cell.includes('·');
    this.scanCellLabel.textContent = multi ? 'Номера ячеек' : 'Номер ячейки';
    this.scanCell.classList.toggle('multi', multi);
    this.panel.classList.remove('hidden');
    this.scanView.classList.add('hidden');
    this.resultView.classList.remove('hidden');
    clear(this.scanCell);
    if (multi) {
      for (const id of cell.split('·').map((value) => value.trim()).filter(Boolean)) {
        const item = document.createElement('span');
        item.className = 'scan-cell-id';
        item.textContent = id;
        this.scanCell.appendChild(item);
      }
    } else {
      this.scanCell.textContent = cell;
    }
    this.scanActive = false;
    this.scanComplete = true;
    this.scanHolding = false;
  }

  closeScanner(): void {
    this.panel.classList.add('hidden');
    this.scanActive = false;
    this.scanComplete = false;
    this.scanHolding = false;
    this.scanProgress = 0;
    setProgressFill(this.scanFill, 0);
    this.scanHold.classList.remove('holding');
    this.barcodeLine.classList.remove('scanning');
    this.scanView.classList.remove('hidden');
    this.resultView.classList.add('hidden');
  }

  openCellPanel(options: CellPanelModel): void {
    this.closeScanner();
    this.cellPanel.classList.remove('hidden');
    this.cellKicker.textContent = options.kicker;
    this.cellSub.textContent = options.sub;
    this.cellGrid.style.gridTemplateColumns = `repeat(${options.columns ?? 3}, minmax(0, 1fr))`;
    clear(this.cellGrid);
    this.cellGrid.classList.toggle('search', options.search);

    for (const cell of options.cells) {
      this.cellGrid.appendChild(
        createCellButton({
          id: cell.id,
          color: cell.color,
          levelLabel: `полка ${LEVELS - cell.level}`,
          checked: cell.checked,
          onClick: () => undefined,
        }),
      );
    }

    if (this.tutorialCellTarget) {
      this.cellGrid
        .querySelector<HTMLButtonElement>(`[data-cell-id="${this.tutorialCellTarget}"]`)
        ?.classList.add('tutorial-target');
    }

    if (options.signal) {
      this.setSignal(options.signal.text, options.signal.level);
    } else if (options.search) {
      this.setSignal('Сканер не уверен', 0);
    } else {
      this.signal.classList.add('hidden');
    }
  }

  closeCellPanel(): void {
    this.cellPanel.classList.add('hidden');
    this.signal.classList.add('hidden');
  }

  setSignal(text: string, level: number): void {
    this.signal.classList.remove('hidden');
    this.signalText.textContent = text;
    this.signalSegments.forEach((segment, index) => {
      segment.classList.toggle('active', index < level);
    });
  }

  shakeCell(cellId: string): void {
    const button = this.cellGrid.querySelector<HTMLButtonElement>(
      `[data-cell-id="${cellId}"]`,
    );
    if (!button) return;
    button.classList.remove('wrong');
    void button.offsetWidth;
    button.classList.add('wrong');
    window.setTimeout(() => button.classList.remove('wrong'), 420);
  }

  private finishScan(): void {
    this.scanHolding = false;
    this.scanComplete = true;
    this.scanActive = false;
    setProgressFill(this.scanFill, 1);
    this.scanHold.classList.remove('holding');
    this.barcodeLine.classList.remove('scanning');
    this.actions?.onScanComplete();
  }
}
