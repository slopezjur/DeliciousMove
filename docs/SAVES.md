# Local progress and compatibility

## Player behavior

The game stores progress in browser localStorage, not cookies. Nothing is uploaded.
Only a completed level creates a checkpoint, after its final animations and bonus
phase finish. Ordinary moves, completing objectives, rescue shuffles, a loss,
and starting the next level do not overwrite that checkpoint.
The automatic Last chance finale is also transient: no checkpoint or life debit
occurs during its playback. Failure is charged only after it finishes without
completing all objectives; a successful rescue enters the existing bonus phase.

Reloading restores the victory screen if the next level has not started. Otherwise,
the next level restarts using the checkpoint's global score and the resource ledger's
remaining bank. Board, objectives, base moves and shuffles restart; no mid-level board
is resumed. A recorded failure restores the retry screen without charging twice.
Before the first victory there is no checkpoint; level 1 uses the same life ledger.
**New Game** asks for confirmation, archives the previous checkpoint, and removes it
from automatic resume; the new run saves after its first victory. It does not refill
lives. **Retry level** retains the run and resets only the failed level; its earned
score is discarded and spent bank moves are not refunded.

Language is an independent preference: the primary browser language selects Spanish
for `es` / `es-*`, with English as the fallback. The language selector in Settings shows the current choice; it or **L** overrides
that choice immediately and persists it independently of level completion.
The shortcut ignores editable fields and modified/repeated key events.

Storage belongs to the browser profile and origin. `localhost:3000` and
`127.0.0.1:3000` have separate saves, as do development and production.
Clearing site data removes local progress. If storage is blocked or full, gameplay
continues and the HUD explains that saving is unavailable.

## Format and ownership

- `deliciousmove.save`: current checkpoint JSON.
- `deliciousmove.save.backup`: previous readable checkpoint, rotated before replacement.
- `deliciousmove.save.recovery.<timestamp>[.<suffix>]`: originals archived by explicit restart.
- `deliciousmove.language`: explicit `en` or `es` preference.
- `deliciousmove.records`: version-1 lifetime records (`bestLevel`, `bestScore`).
- `deliciousmove.resources`: version-1 consumable ledger (`lives`, `nextLifeAt`,
  `observedAt`, optional `attempt` containing checkpoint identity, level, remaining
  `bank`, and an optional failure reason). This is not a board checkpoint.

`PlayerResources` owns an injectable wall clock. Lives start/cap at five and regenerate
once per 1,800,000 ms, including offline. Full lives do not accumulate extra regeneration
credit; another failure preserves an already-running deadline. Clock rollback cannot
advance regeneration. Failure is recorded once for the current attempt; retry clears
its failure marker without charging. The checkpoint identity is its timestamp and level
(or `new` before the first victory). Only a matching attempt ledger can resume that run.
Bank spending is persisted immediately, independently of the completed-level checkpoint.
Starting or retrying an attempt reconciles the session with the ledger's lower bank
balance, including spending recorded by another tab. Reconciliation cannot grant moves
or alter base moves; retry still discards failed-attempt score and resets its shuffles.
Supported legacy non-victory saves reconcile against their own level's attempt, not
the next level. Their restored board/progress stays intact, but spent bank moves and
recorded failures are not refunded. This compatibility path does not enable new
mid-level saves. Tabs do not synchronize live boards; this is not transactional cloud sync.
New Game clears the attempt, not the lives or regeneration deadline. This is local
convenience storage, not a server-authoritative anti-cheat system.

Malformed or newer resource formats are preserved and automatic resource writes pause,
with a HUD warning; gameplay continues with in-memory resources. A future resource-format
change must add an explicit version migration with clock, bank, and idempotency fixtures
before permitting writes. Blocked storage similarly falls back to in-memory state.

Records mean highest **completed** level and highest cumulative score at a completed
level. They update after victory playback, never during an unfinished level or a loss.
New Game does not reset records. An existing completed checkpoint seeds missing records;
the two maxima are merged independently, including when another tab saved a higher result.
Records have their own version because they outlive individual run checkpoints. Unknown
versions or malformed records are preserved without overwrite; the HUD reports the issue.
Future record format changes must add an explicit migration before enabling writes.

The checkpoint contains `schemaVersion`, `rulesVersion`, `savedAt`, board dimensions,
all tile identities/colors/specials/positions/kinds/layers, optional cell terrain
(playable mask, jelly, ice, exits), the next tile ID, objective definitions/progress, complete session
configuration/counters, and the mulberry32 random-generator state. Snapshots are
independent copies, not references to mutable game objects.

`Board`, `GameSession`, and `IStatefulRandomSource` export/restore domain snapshots.
`SaveCodec` validates and migrates them through the `ISaveCodec` contract. `SaveStore` handles browser storage,
checkpoint policy and preservation. `Game` saves only after completed turn playback
and reconstructs presentation without triggering level initialization on restore.

Validation rejects malformed JSON, duplicate IDs/cells, incomplete playable grids,
tiles in gaps, unknown tile types, invalid durability/counters/states, inconsistent
jelly/blocker/ingredient progress, and unsupported random algorithms.
An invalid primary may recover from a readable backup, but automatic writes stay
paused to preserve the damaged original. Future-version and unmigratable saves are
also preserved without overwrite. Starting a new run explicitly archives the
original before allowing a new checkpoint.

## Adding a breaking change

The current save format is **schema 3 / rules 5**. Installed 1→2 migrations retain
the original board, score, level, banked moves, global score, and RNG. A legacy
checkpoint receives an explicit score objective and matching progress. Missing
terrain means a full rectangle. It still resumes at its victory screen; only
advancing to the next level selects a new objective/layout family.
The rules 2→3 migration retains the saved level's original requirements and completion
state. Only newly generated levels add mandatory minimum score alongside the feature
objectives. Already completed jelly/ice levels are never made incomplete retroactively.
Schema 2→3 splits the old total move count into `levelMovesLeft` and remaining
`accumulatedMoves`: base = max(0, old total - old initial bank), bank = min(old initial
bank, old total). Their sum must equal `movesLeft`; base cannot exceed the saved level
allowance. Rules 3→4 preserves existing checkpoint configuration and completion. New
levels/retries use the lower move allowances and incidental-special protection rules.
Rules 4→5 preserves the entire checkpoint and RNG unchanged while enabling Last chance
on future turns. Previously recorded failures are not retroactively rescued or refunded.
The `last_chance` session state is transient and cannot be exported as a checkpoint.

Migration occurs in memory on load and never rewrites the original raw checkpoint.
The next completed-level save writes schema 3 / rules 5 and rotates the readable original to backup.
Older clients must reject newer saves rather than reinterpret their counters or cell/object data.
Old diagnostic turn replays may produce different results after a gameplay bug fix;
exact replay still requires the game revision that produced the report.

1. Increment `SAVE_SCHEMA_VERSION` for serialization changes, or
   `GAME_RULES_VERSION` for changes that make a saved board/session incompatible.
   Cosmetic changes and translations normally require neither.
2. Register a pure migration keyed by the **source** version in the appropriate
   default registry passed to `SaveCodec`. Production `SaveStore` uses that codec.
3. Each migration returns the full checkpoint with that version increased by exactly
   one. Do not silently reset counters, discard progress, or reseed randomness.
4. Retain all supported upgrade steps. Schema migrations run before rules migrations;
   final validation uses the current format.
5. Add fixtures from each released version, chained-migration tests and explicit
   no-path/newer-version tests. Test reload, banked moves, next-level generation,
   preserved raw originals, and quota failures.

Example of a future field rename (illustrative, not an installed migration):

```ts
const schemaMigrations: MigrationRegistry = new Map([
  [3, (old) => {
    const { savedAt, ...rest } = old;
    return { ...rest, checkpointAt: savedAt, schemaVersion: 4 };
  }],
]);
```

That example also requires updating the current interface, validator and writer to
use `checkpointAt`, setting the current schema to 4, and extending the existing
default registry without removing earlier migrations. Constructor injection allows fixture testing against future
versions without changing production defaults.

Missing migration paths deliberately suspend writes. A client from an older release
must never downgrade a newer save. Recovery archives are retained; future save
management UI may expose export/restore and explicit cleanup.
