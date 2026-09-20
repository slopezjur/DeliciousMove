# Gameplay variety backlog

The current loop changes score targets and budgets, but keeps the same primary objective.
Prioritize features that change which move is worth making.

1. **Rotating objectives**
   - Collect selected colors, clear jelly-covered cells, or deliver ingredients.
   - Start with one additional objective type and alternate it with score levels.
   - Keep objective progress separate from scoring so HUD and victory rules share one source of truth.

2. **Varied board layouts**
   - Introduce holes, separated areas, and deliberate obstacle arrangements.
   - Model non-playable cells separately from empty refillable cells.
   - Validate opening moves and gravity paths for each layout.

3. **Choose a perk between levels**
   - Offer one of three temporary bonuses, such as a starting special or a color collection boost.
   - Give each perk a clear duration and avoid combinations that remove the move-budget challenge.

4. **Optional bonus-phase exit**
   - Let the player bank unused moves immediately or continue for global score.
   - Show the score-versus-time tradeoff clearly. Current bonus play freezes remaining moves;
     an exit alone would shorten sessions rather than create a risk of losing banked moves.

5. **A special challenge every fourth level**
   - Use a short authored puzzle with a specific objective and limited moves.
   - Introduce challenges once objective and layout support exists.
   - Rotate puzzle families rather than only increasing target scores.

6. **Seeded daily challenge**
   - Share a fixed board, rules version, and move budget for score comparisons.
   - Start with local results and a shareable seed; online leaderboards require storage
     and score validation.

Recommended delivery order: rotating objectives, board layouts, then perks.
The bonus-phase exit is a smaller improvement that can be delivered independently.
