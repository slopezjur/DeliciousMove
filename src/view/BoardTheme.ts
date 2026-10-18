import type { BoardTheme } from '../core/Collection.ts';

export const BOARD_PALETTES: Record<BoardTheme, { frame: number; inner: number; cell: number; alternate: number; trim: number }> = {
  classic: { frame: 0x240f3b, inner: 0x120622, cell: 0x0d0618, alternate: 0x180b28, trim: 0xffd700 },
  mint: { frame: 0x124636, inner: 0x082b23, cell: 0x0b3027, alternate: 0x174236, trim: 0xa8f3cf },
  cocoa: { frame: 0x563320, inner: 0x29170f, cell: 0x321c14, alternate: 0x472a1c, trim: 0xf1c28c },
  royal: { frame: 0x293d70, inner: 0x111d39, cell: 0x162442, alternate: 0x25385a, trim: 0xf5d99a },
};
