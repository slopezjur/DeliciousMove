import { describe, it, expect, vi } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { GameSession } from '../src/core/GameSession.ts';
import { InfiniteLevelProgression } from '../src/core/LevelProgression.ts';
import { TileColor, SpecialType } from '../src/core/TileTypes.ts';
import { GameTelemetryService } from '../src/core/telemetry/GameTelemetryService.ts';
import { IDeadlockResolver } from '../src/core/ShuffleEngine.ts';
import { IInputController } from '../src/input/InputController.ts';
import { DebugOverlayView } from '../src/ui/DebugOverlayView.ts';
import { IClipboardService } from '../src/ui/IClipboardService.ts';
import { BrowserClipboardService } from '../src/ui/ClipboardService.ts';

describe('GameTelemetryService', () => {
  const setup = () => {
    const board = new Board(4, 4);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        board.createTile(r, c, TileColor.Red);
      }
    }

    const session = new GameSession(new InfiniteLevelProgression());
    session.startLevel(1);

    const deadlockResolver: IDeadlockResolver = {
      findPossibleMoves: vi.fn().mockReturnValue([{ from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }]),
      hasPossibleMoves: vi.fn().mockReturnValue(true),
      shuffleBoard: vi.fn().mockReturnValue({ success: true, mapping: new Map() }),
    };

    let locked = false;
    const inputController: IInputController = {
      setLocked: (l: boolean) => { locked = l; },
      isLocked: () => locked,
    };

    const telemetry = new GameTelemetryService({
      board,
      session,
      deadlockResolver,
      inputController,
    });

    return { board, session, deadlockResolver, inputController, telemetry };
  };

  it('records swap actions and updates history', () => {
    const { telemetry } = setup();

    telemetry.recordSwap({ row: 0, col: 0 }, { row: 0, col: 1 }, true, 120, 2, ['Airplane'], []);
    telemetry.recordSwap({ row: 1, col: 0 }, { row: 1, col: 1 }, false, 0, 0);

    const moves = telemetry.getRecentMoves();
    expect(moves.length).toBe(2);
    expect(moves[0].action).toBe('swap');
    expect(moves[0].valid).toBe(true);
    expect(moves[0].scoreGained).toBe(120);
    expect(moves[0].specialsFormed).toEqual(['Airplane']);

    expect(moves[1].action).toBe('swap');
    expect(moves[1].valid).toBe(false);
  });

  it('records direct special activations', () => {
    const { telemetry } = setup();

    telemetry.recordActivation({ row: 2, col: 2 }, SpecialType.Airplane, 250, 1, ['Airplane']);
    const moves = telemetry.getRecentMoves();

    expect(moves.length).toBe(1);
    expect(moves[0].action).toBe('activate');
    expect(moves[0].specialType).toBe(SpecialType.Airplane);
    expect(moves[0].scoreGained).toBe(250);
  });

  it('captures full state snapshot including specials, ASCII board, and lock status', () => {
    const { board, inputController, telemetry } = setup();

    // Place an airplane and a striped candy on the board
    board.set(0, 0, { id: 99, row: 0, col: 0, color: TileColor.Blue, special: SpecialType.Airplane });
    board.set(1, 1, { id: 100, row: 1, col: 1, color: TileColor.Green, special: SpecialType.StripedHorizontal });
    inputController.setLocked(true);

    const snapshot = telemetry.getSnapshot();
    expect(snapshot.level).toBe(1);
    expect(snapshot.isInputLocked).toBe(true);
    expect(snapshot.specialsOnBoard[SpecialType.Airplane]).toBe(1);
    expect(snapshot.specialsOnBoard[SpecialType.StripedHorizontal]).toBe(1);
    expect(snapshot.possibleMovesCount).toBe(1);
    expect(snapshot.boardAscii).toContain('B^');
    expect(snapshot.boardAscii).toContain('G-');
  });

  it('exports valid diagnostic JSON bundle', () => {
    const { telemetry } = setup();
    telemetry.recordSwap({ row: 0, col: 0 }, { row: 0, col: 1 }, true, 60, 1);

    const jsonStr = telemetry.exportDiagnosticJson();
    const parsed = JSON.parse(jsonStr);

    expect(parsed.level).toBe(1);
    expect(parsed.recentMoves.length).toBe(1);
    expect(parsed.boardAscii).toBeDefined();
  });
});

describe('Clipboard & Debug Overlay Separation', () => {
  it('BrowserClipboardService handles environments where clipboard is absent or present', async () => {
    const clipboard = new BrowserClipboardService();
    const result = await clipboard.copyText('test');
    expect(typeof result).toBe('boolean');
  });

  it('DebugOverlayView delegates copy to injected IClipboardService', async () => {
    const mockTelemetry: any = {
      exportDiagnosticJson: vi.fn().mockReturnValue('{"test": 123}'),
    };
    const mockClipboard: IClipboardService = {
      copyText: vi.fn().mockResolvedValue(true),
    };

    const overlay = new DebugOverlayView(mockTelemetry, { onUnlockInput: vi.fn(), onForceShuffle: vi.fn() }, mockClipboard);
    const success = await overlay.copyToClipboard();

    expect(success).toBe(true);
    expect(mockClipboard.copyText).toHaveBeenCalledWith('{"test": 123}');
  });
});
