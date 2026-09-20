# Local progress and compatibility

## Player behavior

The game stores progress in browser localStorage, not cookies. Nothing is uploaded.
Only a completed level creates a checkpoint, after its final animations and bonus
phase finish. Ordinary moves, completing objectives, rescue shuffles, a loss,
and starting the next level do not overwrite that checkpoint.

Reloading restores the last completed level's victory screen. Choose **Next Level**
to continue with its banked moves and global score. An unfinished level is restarted
from that checkpoint, not resumed mid-level. Before the first victory there is no
checkpoint. **New Game** asks for confirmation, archives the previous checkpoint,
and removes it from automatic resume; the new run saves after its first victory.
**Play Again** after losing also starts a new run and archives the prior checkpoint.

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
`SaveCodec` validates and migrates them. `SaveStore` handles browser storage,
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

The current save format is **schema 2 / rules 3**. Installed 1→2 migrations retain
the original board, score, level, banked moves, global score, and RNG. A legacy
checkpoint receives an explicit score objective and matching progress. Missing
terrain means a full rectangle. It still resumes at its victory screen; only
advancing to the next level selects a new objective/layout family.
The rules 2→3 migration retains the saved level's original requirements and completion
state. Only newly generated levels add mandatory minimum score alongside the feature
objectives. Already completed jelly/ice levels are never made incomplete retroactively.

Migration occurs in memory on load and never rewrites the original raw checkpoint.
The next completed-level save writes schema 2 / rules 3 and rotates the readable original to backup.
Clients running v1 must reject v2 saves rather than reinterpret new cell/object data.
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
  [2, (old) => {
    const { savedAt, ...rest } = old;
    return { ...rest, checkpointAt: savedAt, schemaVersion: 3 };
  }],
]);
```

That example also requires updating the current interface, validator and writer to
use `checkpointAt`, setting the current schema to 3, and extending the existing
default registry without removing the 1→2 migration. Constructor injection allows fixture testing against future
versions without changing production defaults.

Missing migration paths deliberately suspend writes. A client from an older release
must never downgrade a newer save. Recovery archives are retained; future save
management UI may expose export/restore and explicit cleanup.
