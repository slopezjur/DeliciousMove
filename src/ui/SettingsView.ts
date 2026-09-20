/** Native modal semantics provide focus containment, Escape, and background inertness. */
export class SettingsView {
  constructor() {
    const dialog = document.getElementById('settings-dialog') as HTMLDialogElement | null;
    const toggle = document.getElementById('settings-toggle-btn');
    if (!dialog || !toggle) return;

    toggle.addEventListener('click', () => dialog.showModal());
    document.getElementById('settings-close-btn')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    // Leave the top layer before opening diagnostics or the restart confirmation.
    for (const id of ['debug-toggle-btn', 'new-game-btn']) {
      document.getElementById(id)?.addEventListener('click', () => dialog.close(), { capture: true });
    }
  }
}
