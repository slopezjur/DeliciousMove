# Local progress and compatibility

## Player behavior

The game stores progress in browser localStorage, not cookies. Nothing is uploaded.
Only a completed level creates a checkpoint, after its final animations and bonus
phase finish. Ordinary moves, reaching the score target, rescue shuffles, a loss,
and starting the next level do not overwrite that checkpoint.

Reloading restores the last completed level's victory screen. Choose **Next Level**
to continue with its banked moves and global score. An unfinished level is restarted
from that checkpoint, not resumed mid-level. Before the first victory there is no
checkpoint. **New Game** asks for confirmation, archives the previous checkpoint,
and removes it from automatic resume; the new run saves after its first victory.
**Play Again** after losing also starts a new run and archives the prior checkpoint.

Language is an independent preference: the primary browser language selects Spanish
for `es` / `es-*`, with English as the fallback. The EN/ES button or **L** overrides
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

The checkpoint contains `schemaVersion`, `rulesVersion`, `savedAt`, board dimensions,
all tile identities/colors/specials/positions, the next tile ID, complete session
configuration/counters, and the mulberry32 random-generator state. Snapshots are
independent copies, not references to mutable game objects.

`Board`, `GameSession`, and `IStatefulRandomSource` export/restore domain snapshots.
`SaveCodec` validates and migrates them. `SaveStore` handles browser storage,
checkpoint policy and preservation. `Game` saves only after completed turn playback
and reconstructs presentation without triggering level initialization on restore.

Validation rejects malformed JSON, duplicate IDs/cells, incomplete grids, unknown
tile types, invalid counters/states, and unsupported random algorithms.
An invalid primary may recover from a readable backup, but automatic writes stay
paused to preserve the damaged original. Future-version and unmigratable saves are
also preserved without overwrite. Starting a new run explicitly archives the
original before allowing a new checkpoint.

## Adding a breaking change

The first released save format is schema 1 / rules 1. There are no invented legacy
migrations. Register actual transformations when a released format changes.

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
  [1, (old) => {
    const { savedAt, ...rest } = old;
    return { ...rest, checkpointAt: savedAt, schemaVersion: 2 };
  }],
]);
```

That example also requires updating the current interface, validator and writer to
use `checkpointAt`, setting the current schema to 2, and installing this registry
as the default. Constructor injection allows fixture testing against future
versions without changing production defaults.

Missing migration paths deliberately suspend writes. A client from an older release
must never downgrade a newer save. Recovery archives are retained; future save
management UI may expose export/restore and explicit cleanup.
