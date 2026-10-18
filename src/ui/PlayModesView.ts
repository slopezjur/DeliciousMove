import type { ILocalization } from '../i18n/ILanguageService.ts';
import type { MessageKey } from '../i18n/LanguageService.ts';
import { LESSON_IDS, lessonMove, type LessonId } from '../modes/Laboratory.ts';
import { type PlayMode, utcDay } from '../modes/PlayMode.ts';
import { PUZZLE_IDS } from '../core/AuthoredLevels.ts';
import type { SessionSnapshot } from '../core/GameSession.ts';
import type { LevelConfig } from '../core/LevelProgression.ts';
import { GAME_RULES_VERSION } from '../persistence/SaveCodec.ts';
import type { ICollectionReader } from '../core/Collection.ts';
import type { IClipboardService } from './IClipboardService.ts';
import { BrowserClipboardService } from './ClipboardService.ts';

export interface ModeStatus { lessonDone: boolean; bossCountdown?: number }

export function playUrl(params: Record<string, string> = {}): string {
  const url = new URL(window.location.href); url.search = ''; url.hash = '';
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function lessonTitle(id: LessonId): MessageKey {
  return `${['four', 'five', 'square', 'ice'].includes(id) ? 'lesson' : 'combo'}_${id}` as MessageKey;
}

export class PlayModesView {
  private snapshot?: SessionSnapshot;
  private config?: LevelConfig;
  private status: ModeStatus = { lessonDone: false };
  private shareText = '';

  constructor(private readonly language: ILocalization, readonly mode: PlayMode,
    private readonly collection: Pick<ICollectionReader, 'snapshot'>, private readonly reset: () => void,
    private readonly clipboard: IClipboardService = new BrowserClipboardService()) {
    language.subscribe(() => this.render());
  }

  open(): void {
    const dialog = document.createElement('dialog'); dialog.className = 'feature-dialog'; dialog.setAttribute('aria-labelledby', 'modes-title');
    const draw = () => {
      dialog.replaceChildren();
      const title = document.createElement('h2'); title.id = 'modes-title'; title.textContent = this.language.t('playModes'); dialog.append(title);
      const campaign = this.link(this.language.t('returnCampaign'), {}); dialog.append(campaign);
      this.section(dialog, 'dailyChallenge', 'dailyInfo', [this.link(this.language.t('dailyChallenge'), { mode: 'daily', day: utcDay(), rules: String(GAME_RULES_VERSION) })]);
      this.section(dialog, 'laboratory', 'labInfo', LESSON_IDS.map(lesson => this.link(this.language.t(lessonTitle(lesson)), { mode: 'lab', lesson })));
      this.section(dialog, 'puzzleRoom', 'puzzleInfo', PUZZLE_IDS.map(puzzle => this.link(this.language.t(`puzzle_${puzzle}`), { mode: 'puzzle', puzzle })));
      const close = document.createElement('button'); close.textContent = this.language.t('close'); close.onclick = () => dialog.close(); dialog.append(close);
    };
    draw(); document.body.append(dialog);
    const unsubscribe = this.language.subscribe(draw);
    dialog.addEventListener('close', () => { unsubscribe(); dialog.remove(); }, { once: true }); dialog.showModal();
  }

  update(snapshot: SessionSnapshot, config: LevelConfig, status: ModeStatus): void {
    this.snapshot = snapshot; this.config = config; this.status = { ...status }; this.render();
  }

  render(): void {
    const root = document.getElementById('feature-status');
    if (!root) return;
    root.replaceChildren();
    if (this.mode.kind === 'campaign') {
      const journey = this.snapshot?.journey;
      if (journey) {
        this.text(root, this.language.t(`route_${journey.route}`));
        for (const perk of journey.perks) this.text(root, this.language.t(perk.levelsLeft === 1 ? 'activePerkOne' : 'activePerk', { name: this.language.t(`perk_${perk.id}`), levels: perk.levelsLeft }));
      }
    } else {
      const title = this.mode.kind === 'daily' ? this.language.t('dailyDate', { day: this.mode.day, rules: GAME_RULES_VERSION })
        : this.mode.kind === 'lab' ? this.language.t(lessonTitle(this.mode.lesson)) : this.language.t(`puzzle_${this.mode.puzzle}`);
      this.text(root, title, true);
      const actions = document.createElement('div'); actions.className = 'mode-actions';
      actions.append(this.link(this.language.t('returnCampaign'), {})); root.append(actions);
      if (this.mode.kind === 'lab') {
        const { from, to } = lessonMove(this.mode.lesson);
        this.text(root, this.language.t(`lessonTip_${this.mode.lesson}`));
        this.text(root, this.language.t(this.status.lessonDone ? 'labSuccess' : 'labMove', { fromRow: from.row + 1, fromCol: from.col + 1, toRow: to.row + 1, toCol: to.col + 1 }));
        const reset = document.createElement('button'); reset.textContent = this.language.t('retryLesson'); reset.onclick = this.reset;
        const index = LESSON_IDS.indexOf(this.mode.lesson);
        actions.append(reset, this.link(this.language.t('nextLesson'), { mode: 'lab', lesson: LESSON_IDS[(index + 1) % LESSON_IDS.length] }));
      } else if (this.mode.kind === 'daily') {
        const mode = this.mode, result = this.collection.snapshot().daily[`${mode.day}:${GAME_RULES_VERSION}`];
        if (result) this.text(root, this.language.t('dailyBest', { score: result.score, moves: result.moves }));
        const share = document.createElement('button'); share.textContent = this.language.t(result ? 'shareResult' : 'shareChallenge');
        share.onclick = async () => {
          const url = playUrl({ mode: 'daily', day: mode.day, rules: String(GAME_RULES_VERSION) });
          const message = result ? `${this.language.t('dailyShare', { day: mode.day, ...result, rules: GAME_RULES_VERSION })}\n${url}` : url;
          try {
            const copied = await this.clipboard.copyText(message);
            this.shareText = copied ? this.language.t('shareCopied') : `${this.language.t('shareFailed')} ${url}`;
          }
          catch { this.shareText = `${this.language.t('shareFailed')} ${url}`; }
          this.render();
        };
        actions.append(share);
        if (this.shareText) this.text(root, this.shareText);
      }
    }
    if (this.config?.challenge) {
      this.text(root, this.language.t(`puzzle_${this.config.challenge}`), true);
      const guide = this.config.challenge === 'fountain' ? 'bossGuide' : this.config.challenge === 'conveyor' ? 'conveyorGuide'
        : this.config.challenge === 'portals' ? 'portalGuide' : undefined;
      if (guide) this.text(root, this.language.t(guide));
    }
    if (this.status.bossCountdown !== undefined) {
      const turns = this.status.bossCountdown;
      this.text(root, this.language.t(turns === 1 ? 'bossCountdownOne' : 'bossCountdown', { turns }));
    }
    root.hidden = !root.childNodes.length;
  }

  private text(parent: HTMLElement, text: string, strong = false): void {
    const element = document.createElement(strong ? 'strong' : 'p'); element.textContent = text; parent.append(element);
  }

  private link(label: string, params: Record<string, string>): HTMLAnchorElement {
    const link = document.createElement('a'); link.className = 'feature-link'; link.href = playUrl(params); link.textContent = label; return link;
  }

  private section(parent: HTMLElement, title: MessageKey, detail: MessageKey, links: HTMLAnchorElement[]): void {
    const section = document.createElement('section'); section.className = 'mode-section';
    const heading = document.createElement('h3'); heading.textContent = this.language.t(title);
    const description = document.createElement('p'); description.textContent = this.language.t(detail);
    const list = document.createElement('div'); list.className = 'mode-grid'; list.append(...links);
    section.append(heading, description, list); parent.append(section);
  }
}
