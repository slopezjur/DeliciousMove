import { Game } from './Game.ts';

window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('game-container');
  if (container) {
    const practice = import.meta.env.DEV ? (await import('./dev/practice.ts')).practiceDependencies() : undefined;
    const game = new Game(practice);
    await game.init(container);
  }
});
