import { Game } from './Game.ts';

window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('game-container');
  if (container) {
    const game = new Game();
    await game.init(container);
  }
});
