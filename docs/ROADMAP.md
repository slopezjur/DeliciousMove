# Gameplay variety backlog

## Implemented

- Rotating score, color collection, jelly, blocker, and ingredient objectives.
- Layered ice, frosting, and crates with adjacent-match and special damage.
- Notched, narrow-bridge, and separated-island layouts with segment-aware gravity.
- Cherries and marked delivery exits.
- Chocolate that expands after a valid turn unless chocolate was cleared.

These mechanics enter gradually from level 2, then rotate through ten-level families.
Mixed levels require every displayed objective before bonus play starts. The responsive
HUD and board guide support English and Spanish. See the README for exact rules.

## Remaining ideas

1. **Choose a perk between levels**
   - Offer one of three temporary bonuses, such as a starting special or a color collection boost.
   - Give each perk a clear duration and avoid combinations that remove the move-budget challenge.

2. **Optional bonus-phase exit**
   - Let the player bank unused moves immediately or continue for global score.
   - Show the score-versus-time tradeoff clearly. Current bonus play freezes remaining moves;
     an exit alone would shorten sessions rather than create a risk of losing banked moves.

3. **Authored challenge levels**
   - Use a short authored puzzle with a specific objective and limited moves.
   - Build on the existing objective and layout support.
   - Rotate puzzle families rather than only increasing target scores.

4. **Seeded daily challenge**
   - Share a fixed board, rules version, and move budget for score comparisons.
   - Start with local results and a shareable seed; online leaderboards require storage
     and score validation.

Prioritize playtesting and balancing the implemented families before adding more systems.
The bonus-phase exit is a smaller improvement that can be delivered independently.
