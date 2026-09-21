import { IStorage } from '../persistence/Storage.ts';

export type Locale = 'en' | 'es';
export const LANGUAGE_KEY = 'deliciousmove.language';

const en = {
  bonusShort: 'Bonus',
  levelMoves: 'Level moves', bankMoves: 'Bank', lives: 'Lives', livesFull: 'Full', nextLife: '+1 in {time}',
  retryLevel: 'Retry level', continuePlay: 'Continue', noLives: 'No lives left', livesAvailable: 'Lives left: {count}.',
  retryDetail: 'One life used. Retry level {level} with fresh level moves and shuffles; only unspent banked moves remain.',
  waitForLife: 'Next life in {time}. Your progress is kept.',
  resourcesPreserved: 'Unreadable or newer resources preserved; resource saving is paused.',
  resourcesUnavailable: 'Lives and banked moves cannot be saved in this browser.',
  bestLevel: 'Best level cleared', bestScore: 'Best total score',
  recordsTip: 'Personal records update only after completing a level and survive New Game.',
  recordsUnavailable: 'Records cannot be saved in this browser.',
  recordsPreserved: 'Unreadable or newer records preserved; record saving is paused.',
  bonusExplanation: 'Objectives complete! Moves are frozen. Keep matching for extra points until no moves remain.',
  allRequired: 'Complete every goal below to unlock the bonus round.',
  objectives: 'Objectives', practiceMode: 'Practice level {level} · Progress is not saved',
  collectColor: 'Collect {color}', clearBlocker: 'Clear {blocker}',
  objective_score: 'Minimum score', objective_jelly: 'Clear jelly', objective_ingredient: 'Deliver cherries',
  color_0: 'red', color_1: 'blue', color_2: 'green', color_3: 'yellow', color_4: 'purple', color_5: 'orange',
  blocker_ice: 'ice', blocker_frosting: 'frosting', blocker_crate: 'crates', blocker_chocolate: 'chocolate',
  featureHelp: 'Board guide',
  hintJelly: 'Pink outlines are jelly. Clear the candy on them to remove it.',
  hintIce: 'Ice locks candies. Nearby clears or blasts remove one layer per cascade.',
  hintBlockers: 'Clear beside frosting or crates, or hit them with specials. Dots show layers left.',
  hintShape: 'Gaps split gravity. Each section refills independently.',
  hintIngredients: 'Cherries cannot match or explode. Clear below them to reach the green exits.',
  hintChocolate: 'Chocolate spreads once per turn unless you clear some. Specials and cherries are protected.',
  settings: 'Settings', language: 'Language', sound: 'Sound', soundOn: 'On', soundOff: 'Off',
  checkpointPending: 'Saves at level end', checkpointSaved: '✓ Level checkpoint saved',
  level: 'Level', globalScore: 'Global Score', moves: 'Moves', shuffles: 'Shuffles',
  score: 'Score', target: 'Min Target', frozen: '❄️ FROZEN', bonus: 'BONUS ROUND',
  globalTip: 'Total score accumulated across all levels',
  movesTip: 'Spend level moves first, then banked moves. In the bonus round neither is spent.',
  shufflesTip: 'Rescue reshuffles left this level', soundTip: 'Toggle sound',
  debugTip: 'Toggle diagnostics (or press `)', languageTip: 'Change language (L)',
  newGame: 'New Game', newGameConfirm: 'Start a new game? Your current run will be replaced.',
  easy: 'EASY', medium: 'MEDIUM', hard: 'HARD', very_hard: 'VERY HARD',
  victoryTitle: '🎉 Sweet Victory!', cleared: 'Level {level} cleared.',
  banked: '🎉 {moves} unused moves banked for Level {level}!',
  nextWaiting: 'Level {level} is waiting!', nextLevel: 'Next Level →', tryAgain: 'Try Again',
  outTitle: '💔 Out of Moves', outDetail: 'You ran out of moves before reaching the target.',
  deadlockTitle: '🧩 No Moves Possible', deadlockDetail: 'The board jammed and could not be reshuffled.',
  reached: 'You reached level {level}.', finalScore: 'Final Score', playAgain: 'Play Again',
  shuffle: 'SHUFFLE!', delicious: 'DELICIOUS!', tasty: 'TASTY!', sugarCrush: 'SUGAR CRUSH!', sweet: 'SWEET!',
  diagnostics: '🐞 Game Diagnostics & Telemetry', copy: '📋 Copy Report', copyTip: 'Copy full JSON report',
  unlock: '🔓 Unlock Input', unlockTip: 'Unlock input when the game is ready',
  reshuffle: '🔀 Reshuffle', reshuffleTip: 'Force board reshuffle', close: 'Close',
  copied: '✅ Copied!', copyFailed: '❌ Copy Failed', state: 'State', locked: 'Locked',
  levelDifficulty: 'Level / Difficulty', movesLeft: 'Moves Left', bank: 'Banked',
  possibleMoves: 'Possible Moves', scoreTarget: 'Score / Target', specials: 'Specials',
  boardSpecials: 'Specials on Board', none: 'None', recentMoves: 'Recent Moves (Last 8)',
  time: 'Time', action: 'Action', position: 'Position', steps: 'Steps', noMoves: 'No moves recorded yet',
  boardDump: 'Board Grid ASCII Dump',
  save_none: 'Progress saves after each completed level', save_saved: 'Completed-level checkpoint saved', save_unavailable: 'Saving unavailable in this browser.',
  save_invalid: 'Unreadable save preserved. New Game starts a separate run.',
  save_newer: 'This save needs a newer game. Original save preserved.',
  save_incompatible: 'This save needs a compatibility update. Original save preserved.',
  save_recovered: 'Backup restored. Saving paused to preserve the damaged original.',
} as const;

export type MessageKey = keyof typeof en;

const es: Record<MessageKey, string> = {
  bonusShort: 'Extra',
  levelMoves: 'Del nivel', bankMoves: 'Reserva', lives: 'Vidas', livesFull: 'Completas', nextLife: '+1 en {time}',
  retryLevel: 'Reintentar nivel', continuePlay: 'Continuar', noLives: 'Sin vidas', livesAvailable: 'Vidas restantes: {count}.',
  retryDetail: 'Una vida consumida. Reintenta el nivel {level} con movimientos y mezclas nuevos; solo conservas la reserva no gastada.',
  waitForLife: 'Próxima vida en {time}. Tu progreso se conserva.',
  resourcesPreserved: 'Recursos ilegibles o más recientes conservados; su guardado está pausado.',
  resourcesUnavailable: 'No se pueden guardar las vidas ni la reserva en este navegador.',
  bestLevel: 'Mejor nivel superado', bestScore: 'Mejor puntuación total',
  recordsTip: 'Los récords se actualizan al completar un nivel y se conservan al iniciar una nueva partida.',
  recordsUnavailable: 'No se pueden guardar los récords en este navegador.',
  recordsPreserved: 'Récords ilegibles o más recientes conservados; su guardado está pausado.',
  bonusExplanation: '¡Objetivos completados! Los movimientos están congelados. Sigue combinando para sumar puntos hasta que no queden jugadas.',
  allRequired: 'Completa todos estos objetivos para desbloquear la ronda extra.',
  objectives: 'Objetivos', practiceMode: 'Nivel de práctica {level} · No se guarda el progreso',
  collectColor: 'Recoge {color}', clearBlocker: 'Elimina {blocker}',
  objective_score: 'Puntuación mínima', objective_jelly: 'Elimina gelatina', objective_ingredient: 'Entrega cerezas',
  color_0: 'rojos', color_1: 'azules', color_2: 'verdes', color_3: 'amarillos', color_4: 'morados', color_5: 'naranjas',
  blocker_ice: 'hielo', blocker_frosting: 'glaseado', blocker_crate: 'cajas', blocker_chocolate: 'chocolate',
  featureHelp: 'Guía del tablero',
  hintJelly: 'Los bordes rosas son gelatina. Elimina el caramelo de encima para quitarla.',
  hintIce: 'El hielo bloquea caramelos. Las eliminaciones cercanas o explosiones quitan una capa por cascada.',
  hintBlockers: 'Elimina junto al glaseado o las cajas, o usa especiales. Los puntos indican las capas restantes.',
  hintShape: 'Los huecos dividen la gravedad. Cada sección se rellena por separado.',
  hintIngredients: 'Las cerezas no se combinan ni explotan. Despeja debajo para llevarlas a las salidas verdes.',
  hintChocolate: 'El chocolate se extiende una vez por turno si no eliminas alguno. No cubre especiales ni cerezas.',
  settings: 'Ajustes', language: 'Idioma', sound: 'Sonido', soundOn: 'Activado', soundOff: 'Silenciado',
  checkpointPending: 'Guardado al terminar el nivel', checkpointSaved: '✓ Nivel completado guardado',
  level: 'Nivel', globalScore: 'Puntuación total', moves: 'Movimientos', shuffles: 'Mezclas',
  score: 'Puntuación', target: 'Objetivo mínimo', frozen: '❄️ CONGELADOS', bonus: 'RONDA EXTRA',
  globalTip: 'Puntuación acumulada en todos los niveles',
  movesTip: 'Primero gastas los movimientos del nivel y después la reserva. En la ronda extra no gastas ninguno.',
  shufflesTip: 'Mezclas de rescate restantes en este nivel', soundTip: 'Activar o silenciar sonido',
  debugTip: 'Mostrar diagnóstico (o pulsa `)', languageTip: 'Cambiar idioma (L)',
  newGame: 'Nueva partida', newGameConfirm: '¿Empezar una nueva partida? Se reemplazará la partida actual.',
  easy: 'FÁCIL', medium: 'MEDIO', hard: 'DIFÍCIL', very_hard: 'MUY DIFÍCIL',
  victoryTitle: '🎉 ¡Dulce victoria!', cleared: 'Nivel {level} superado.',
  banked: '🎉 ¡{moves} movimientos guardados para el nivel {level}!',
  nextWaiting: '¡Te espera el nivel {level}!', nextLevel: 'Siguiente nivel →', tryAgain: 'Reintentar',
  outTitle: '💔 Sin movimientos', outDetail: 'Te has quedado sin movimientos antes de alcanzar el objetivo.',
  deadlockTitle: '🧩 Sin jugadas posibles', deadlockDetail: 'El tablero se ha bloqueado y no se ha podido mezclar.',
  reached: 'Has llegado al nivel {level}.', finalScore: 'Puntuación final', playAgain: 'Volver a jugar',
  shuffle: '¡MEZCLA!', delicious: '¡DELICIOSO!', tasty: '¡SABROSO!', sugarCrush: '¡EXPLOSIÓN DE AZÚCAR!', sweet: '¡DULCE!',
  diagnostics: '🐞 Diagnóstico y telemetría', copy: '📋 Copiar informe', copyTip: 'Copiar informe JSON completo',
  unlock: '🔓 Desbloquear', unlockTip: 'Desbloquear controles cuando la partida esté lista',
  reshuffle: '🔀 Mezclar', reshuffleTip: 'Forzar una mezcla del tablero', close: 'Cerrar',
  copied: '✅ ¡Copiado!', copyFailed: '❌ Error al copiar', state: 'Estado', locked: 'Bloqueado',
  levelDifficulty: 'Nivel / Dificultad', movesLeft: 'Movimientos restantes', bank: 'Guardados',
  possibleMoves: 'Jugadas posibles', scoreTarget: 'Puntuación / Objetivo', specials: 'Especiales',
  boardSpecials: 'Especiales en el tablero', none: 'Ninguno', recentMoves: 'Últimas jugadas (8)',
  time: 'Hora', action: 'Acción', position: 'Posición', steps: 'Cascadas', noMoves: 'Todavía no hay jugadas registradas',
  boardDump: 'Tablero en formato ASCII',
  save_none: 'El progreso se guarda al completar cada nivel', save_saved: 'Progreso del nivel completado guardado', save_unavailable: 'No se puede guardar en este navegador.',
  save_invalid: 'Partida ilegible conservada. Nueva partida inicia otra sesión.',
  save_newer: 'Esta partida necesita una versión más reciente. Se conserva el original.',
  save_incompatible: 'Esta partida necesita una actualización de compatibilidad. Se conserva el original.',
  save_recovered: 'Copia restaurada. Guardado pausado para conservar el original dañado.',
};

export class LanguageService {
  private listeners = new Set<() => void>();
  public locale: Locale;

  constructor(private readonly storage?: Pick<IStorage, 'getItem' | 'setItem'>, preferred = 'en') {
    this.locale = preferred.toLowerCase().split('-')[0] === 'es' ? 'es' : 'en';
    try {
      const saved = storage?.getItem(LANGUAGE_KEY);
      if (saved === 'en' || saved === 'es') this.locale = saved;
    } catch { /* Locale selection remains available without storage. */ }
  }

  public t(key: MessageKey, params: Record<string, string | number> = {}): string {
    const message = this.locale === 'es' ? es[key] : en[key];
    return message.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '{' + name + '}'));
  }

  public toggle(): void {
    this.setLocale(this.locale === 'en' ? 'es' : 'en');
  }

  public setLocale(locale: Locale): void {
    if (locale === this.locale) return;
    this.locale = locale;
    try { this.storage?.setItem(LANGUAGE_KEY, this.locale); } catch { /* Best-effort preference. */ }
    this.listeners.forEach((listener) => listener());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public isKey(value: string): value is MessageKey {
    return Object.prototype.hasOwnProperty.call(en, value);
  }
}
