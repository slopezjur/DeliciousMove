import type { ILocalization } from '../i18n/ILanguageService.ts';
import { applyRoute, PERK_IDS, type JourneyChoice, type JourneyState } from '../core/Journey.ts';
import type { LevelConfig } from '../core/LevelProgression.ts';
import { objectiveLabel } from './ObjectivesView.ts';

/** The selection commits only when the form is submitted. Escape preserves victory. */
export interface IJourneyChooser {
  choose(config: LevelConfig, current?: JourneyState): Promise<JourneyChoice | undefined>;
}

export class JourneyView implements IJourneyChooser {
  constructor(private readonly language: ILocalization) {}

  choose(config: LevelConfig, current?: JourneyState): Promise<JourneyChoice | undefined> {
    const dialog = document.createElement('dialog'); dialog.className = 'feature-dialog journey-dialog';
    const form = document.createElement('form'); form.method = 'dialog';
    const heading = document.createElement('h2'); heading.id = 'journey-title'; dialog.setAttribute('aria-labelledby', heading.id);
    form.append(heading);
    const draw = () => {
      const previous = new FormData(form);
      const route = previous.get('route') ?? 'safe', perk = previous.get('perk') ?? 'airdrop';
      form.replaceChildren(heading); heading.textContent = this.language.t('chooseRoute');
      const subtitle = document.createElement('p'); subtitle.textContent = this.language.t('routePreview', { level: config.level }); form.append(subtitle);
      const objectives = document.createElement('p');
      objectives.textContent = (config.objectives ?? []).filter(o => o.kind !== 'score')
        .map(o => `${objectiveLabel(this.language, o)}: ${o.target}`).join(' · ');
      if (objectives.textContent) form.append(objectives);
      if (config.challenge) {
        const challenge = document.createElement('p'); challenge.textContent = this.language.t(`puzzle_${config.challenge}`); form.append(challenge);
      }
      const routes = document.createElement('fieldset');
      const legend = document.createElement('legend'); legend.textContent = this.language.t('chooseRoute'); routes.append(legend);
      for (const id of ['safe', 'challenge'] as const) {
        const preview = applyRoute(config, { route: id, perks: [] });
        this.option(routes, 'route', id, this.language.t(`route_${id}`),
          this.language.t(id === 'safe' ? 'routeSafeInfo' : 'routeChallengeInfo'),
          this.language.t('routeBudget', { moves: preview.moves, score: preview.targetScore.toLocaleString(this.language.locale) }), route === id);
      }
      form.append(routes);
      const perks = document.createElement('fieldset');
      const title = document.createElement('legend'); title.textContent = this.language.t('choosePerk'); perks.append(title);
      const duration = document.createElement('p'); duration.textContent = this.language.t('perkDuration', { levels: current?.route === 'challenge' ? 4 : 3 }); perks.append(duration);
      for (const id of PERK_IDS) this.option(perks, 'perk', id,
        this.language.t(`perk_${id}`), this.language.t(`perkInfo_${id}`), '', perk === id);
      form.append(perks);
      const actions = document.createElement('div'); actions.className = 'feature-actions';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = this.language.t('close'); cancel.onclick = () => dialog.close();
      const start = document.createElement('button'); start.type = 'submit'; start.className = 'primary-action'; start.textContent = this.language.t('beginLevel');
      actions.append(cancel, start); form.append(actions);
    };
    dialog.append(form); document.body.append(dialog); draw();
    const unsubscribe = this.language.subscribe(draw);
    return new Promise(resolve => {
      let result: JourneyChoice | undefined;
      form.addEventListener('submit', () => {
        const values = new FormData(form);
        result = { route: values.get('route') as JourneyChoice['route'], perk: values.get('perk') as JourneyChoice['perk'] };
      });
      dialog.addEventListener('close', () => { unsubscribe(); dialog.remove(); resolve(result); }, { once: true });
      dialog.showModal();
    });
  }

  private option(parent: HTMLElement, name: string, value: string, title: string, description: string, detail: string, selected: boolean): void {
    const label = document.createElement('label'); label.className = 'feature-choice';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = name; radio.value = value; radio.checked = selected; radio.required = true;
    const content = document.createElement('span');
    const heading = document.createElement('strong'); heading.textContent = title;
    const text = document.createElement('span'); text.textContent = description;
    content.append(heading, text);
    if (detail) { const small = document.createElement('small'); small.textContent = detail; content.append(small); }
    label.append(radio, content); parent.append(label);
  }
}
