# Mini Game Hub Product Design Document

## 0. Status and naming

Official game names and ids for MVP:

- Block Blast: block-blast
- Bloom Burst: bloom-burst
- Snap Merge: snap-merge
- Color Flood: color-flood

All storage, routing, and leaderboard documents key off gameId, not display name.

Hosting target:
- GitHub Pages
- Repository name: minigames
- If you are using a user or org pages repo named gamehub (username.github.io), adjust the Vite base path accordingly.

## 1. Product summary

Build a mobile-first web app (portrait) that acts as a hub of endless, turn-based puzzle games.

Shared virtues across games:
- Place one piece
- Immediate deterministic resolution
- Clear a simple pattern
- Board fills steadily
- No randomness that feels unfair
- Explosions every turn, bigger explosions on clears
- Lose when the board is full or there are no legal moves

Shared meta systems:
- Main menu with game cards
- High score per game (local)
- Leaderboard per game (Firebase)
- Menu shows best score and rank (within top 50)
- Options menu with playtest tools
- Bottom ad slot placeholder (fixed height)

This is for internal playtesting. Do not build anti-cheat or moderation.

## 2. Goals

- Ship a cohesive MVP that feels like a real mobile game product.
- Add games as plug-ins with minimal glue.
- Ensure every game ends naturally.
- Ensure every action gives points and satisfying feedback.

## 3. Non-goals (MVP)

- Real ad network integration (placeholder only)
- Accounts UI (anonymous auth only)
- Perfect global rank calculation beyond top 50
- Complex analytics

## 4. Target platform and constraints

Primary:
- Mobile browsers in portrait
- iOS Safari and Android Chrome

Constraints:
- No page scroll during gameplay.
- Use safe area insets on iOS.
- Handle address bar resize without breaking the playfield.
- All routes must work on GitHub Pages (hash routing).

## 5. Routing

Use hash routing to avoid 404 on refresh:

- /#/            Main menu
- /#/game/:id    Game host
- /#/leaderboard/:id   Leaderboard screen

## 6. Global layout

AppShell layout, top to bottom:
- Safe area top padding
- Header HUD (home, title, score, best, options)
- Play surface (fills remaining space)
- Bottom ad slot placeholder (fixed height)

Ad slot:
- Fixed 50px height
- Always reserves space, never overlaps play surface

Viewport:
- Prefer 100dvh; fall back to 100vh
- Disable body scroll
- Disable text selection on play surface
- Set touch-action: none on play surface

Landscape:
- Show a rotate-to-portrait overlay instead of attempting to support landscape.

## 7. Main menu requirements

Menu is a grid of game cards.

Each game card shows:
- Icon
- Name
- Best score (local, instant)
- Rank within top 50 (async)
- Tap card to play
- Trophy icon opens leaderboard

Rank states:
- Loading: Rank: ...
- Found: Rank: #N
- Not in top 50: Rank: 50+
- Error or offline: Rank: offline

Rank fetch policy:
- Fetch once per session per game on menu load.
- Refetch after a successful score submit for that game.
- Concurrency guard: only one fetch in-flight per game.

## 8. Options menu

Entry points:
- Menu top right gear
- In-game HUD top right gear

Presentation:
- Bottom sheet modal on phone
- Centered modal on tablet
- Pauses the active game while open

Sections:

Profile
- Display Name input (3 to 16 chars)
- Stored in localStorage: minihub.playerName

Gameplay
- Sound Effects toggle (default on)
- Sound Volume slider (0-100%, default 50%, visible when sound enabled)
- Haptics toggle (default on)

Display
- Reduce Motion toggle

Testing Tools
- Reset Local Data
  - Clears all minihub.bestScore.*
  - Clears all cached ranks
  - Clears player name
  - Signs out of Firebase auth and re-auths anonymously (new uid)

About
- Version and build date string

Persistence keys:
- minihub.settings.sound
- minihub.settings.soundVolume
- minihub.settings.haptics
- minihub.settings.reduceMotion
- minihub.settings.debug (optional)

## 9. Architecture and compartmentalization

Principle:
- Hub owns all meta systems.
- Games own only core loop and rendering inside their container.

Games must not:
- Use localStorage directly
- Import Firebase directly
- Control routing
- Render global UI outside container

### 9.1 Folder structure

src/
  app/
    AppShell.tsx
    routes/
      Menu.tsx
      GameRoute.tsx
      LeaderboardRoute.tsx
    ui/
      HUD.tsx
      OptionsModal.tsx
      GameOverOverlay.tsx
      Toasts.tsx
  core/
    GameRegistry.ts
    GameHost.tsx
    Storage.ts
    SettingsStore.ts
    firebase.ts
    LeaderboardService.ts
    GameStatsService.ts
  games/
    blockblast/
    bloom_burst/
    snap_merge/
    color_flood/
    comingsoon/

Enforcement:
- Only core/Storage touches localStorage.
- Only core/firebase and core/LeaderboardService touch Firebase.

### 9.2 Game module interface

Each game exports metadata and a factory.

Metadata:
- id: string
- name: string
- icon: string
- version: string

Factory:
- createGame(container, api) => GameInstance

GameInstance:
- start()
- pause()
- resume()
- reset()
- destroy()

### 9.3 Hub GameAPI

Score and lifecycle:
- setScore(score)
- gameOver(finalScore)

Navigation:
- navigateHome()
- openLeaderboard(gameId)

Options:
- openOptions()
- closeOptions()
- getSettings()
- onSettingsChanged(fn) => unsubscribe

Leaderboard service:
- leaderboard.submitBest(score)
- leaderboard.fetchTop(limit)

Utilities:
- haptics.tap()
- haptics.success()
- logEvent(name, payload)

Sound Effects (via sounds object):
- sounds.place() - Basic piece placement
- sounds.select() - Piece selection change
- sounds.invalid() - Invalid action feedback
- sounds.clearSingle() - Single line/row clear
- sounds.clearMulti(count) - Multiple lines cleared
- sounds.combo(multiplier) - Combo hit
- sounds.burst() - Burst/explosion effect
- sounds.drop() - Block dropping (Snap Merge)
- sounds.merge(value) - Block merge (Snap Merge)
- sounds.flood() - Color flood action
- sounds.regionClear() - Region cleared (Color Flood)
- sounds.roundComplete() - Round complete
- sounds.gameStart() - Game start
- sounds.gameOver() - Game over
- sounds.newHighScore() - New high score celebration
- sounds.warning() - Low moves/danger warning

Rule:
- Games call api.gameOver, hub shows overlay.

### 9.4 Overlay state rules

Only one overlay active at a time:
- Options
- Leaderboard
- Game Over

Precedence:
- Game Over closes Options or Leaderboard if open.
- Home closes any overlay, then navigates.

Back button:
- If an overlay is open, back closes it first.

### 9.5 Lifecycle rules

- On visibilitychange hidden: hub calls game.pause()
- On visible: hub calls game.resume() if no overlay open
- On route change: hub calls destroy() and removes listeners

## 10. Sound System

The sound system uses programmatic Web Audio API synthesis - no audio files needed.

### 10.1 Architecture

Location: src/core/SoundEngine.ts

The SoundEngine is a singleton class that:
- Creates and manages an AudioContext
- Synthesizes all sounds using oscillators and noise generators
- Respects the user's sound preference from settings
- Supports volume control (0-100% mapped to 0-0.5 gain to prevent distortion)
- Handles browser autoplay policy by resuming context on first interaction

### 10.2 Sound Categories

UI Sounds (for menus and overlays):
- uiClick() - Soft click for buttons
- uiToggle(on) - Toggle switch sound
- uiOpen() - Modal/sheet open
- uiClose() - Modal/sheet close
- uiBack() - Navigation/back

Game Sounds - Generic (for all games):
- place() - Piece placed / basic action
- select() - Piece selection change
- invalid() - Invalid action feedback
- clearSingle() - Single line clear
- clearMulti(count) - Multiple lines, escalating tone
- combo(multiplier) - Combo hit, pitch scales with multiplier
- burst() - Explosion effect

Game Sounds - Snap Merge specific:
- drop() - Block dropping
- merge(value) - Block merge, pitch scales with value

Game Sounds - Color Flood specific:
- flood() - Color flood action
- regionClear() - Region cleared
- roundComplete() - Round victory

Game State:
- gameStart() - Game starting
- gameOver() - Game ended
- newHighScore() - High score celebration fanfare
- warning() - Low moves/danger warning

### 10.3 Adding Sounds to New Games

When implementing a new game:

1. Use generic sounds where applicable:
   - api.sounds.place() for basic placements
   - api.sounds.clearSingle()/clearMulti() for clears
   - api.sounds.combo() for combo multipliers
   - api.sounds.gameStart() when game begins
   - api.sounds.gameOver() is handled by GameOverOverlay

2. If your game needs unique sounds, add them to SoundEngine.ts:
   - Add a new method following the existing patterns
   - Add the method to the GameAPI sounds interface in types.ts
   - Wire it through GameHost.tsx

3. Pair sounds with haptics for multi-sensory feedback:
   ```typescript
   this.api.haptics.success();
   this.api.sounds.clearSingle();
   ```

4. Use sounds sparingly - not every frame, only on meaningful events

### 10.4 Sound Design Guidelines

- Keep sounds short (50-200ms for feedback, up to 500ms for celebrations)
- Use sine waves for pleasant tones, triangle for softer sounds
- Use square waves sparingly (harsh, for warnings)
- Filtered noise adds texture to impacts and explosions
- Escalating pitch indicates positive progression
- Descending pitch indicates failure or loss

## 11. Firebase leaderboard (internal playtest)

Firebase products:
- Anonymous Auth
- Firestore

Leaderboard model:
- One entry per user per game.

Firestore path:
- leaderboards/{gameId}/bestByUser/{uid}

Document fields:
- uid: string
- playerName: string
- score: number
- updatedAt: server timestamp

Write rule:
- Upsert only if new score is greater than existing score.
- Client can enforce this to reduce writes. Server rules can stay minimal for playtests.

Top list query:
- Query bestByUser ordered by score desc, limit 50.

Rank:
- Rank is computed within top 50 by finding current uid in fetched list.
- If not found, show 50+.

Auth:
- Sign in anonymously on app boot.
- If auth fails, gameplay still works, leaderboard UI shows offline.

## 12. Game designs to add (MVP ready)

All games:
- Endless, no timers.
- Place one piece, resolve immediately.
- Deterministic resolution.
- Every turn grants points and feedback.
- Lose when board is full or no legal moves.

### 12.1 Bloom Burst (bloom-burst)

Core mechanic:
- Place one seed piece (Block Blast style polyomino).
- After placement, each placed tile spreads 1 step into adjacent empty cells, deterministically.
  - Spread rule: for each newly placed tile, attempt spread in fixed order: up, right, down, left.
  - Spread succeeds only into empty cells.
- After spread, resolve clears.

Clear pattern:
- Any 2x2 square of plant tiles triggers a Bloom Burst.

Burst effect:
- Clear the 2x2 square.
- Also clear the 4 orthogonal neighbors of the square (cross around it) for bigger payoff.
- Chain reactions allowed.

Scoring:
- +10 per tile placed
- +5 per successful spread tile
- +150 per 2x2 bloom burst
- +10 per tile cleared
- Combo multiplier for multiple bursts in one move

Fail:
- No legal placement for the current piece set (if using a 3-piece tray), or board full if using single piece per turn.

Notes:
- Determinism is critical. No random growth ticks.

### 12.2 Snap Merge (snap-merge)

Core mechanic:
- Place one magnet piece made of blocks (polyomino).
- Each block has a value (2, 4, 8) shown clearly.
- After placement, for each placed block, perform one deterministic snap:
  - Find the nearest block of the same value in the same row or column with no gaps between.
  - If found, move that block 1 cell toward the placed block (only if destination is empty).
  - Evaluate snaps in fixed order: top-left to bottom-right for placed blocks.
- After snaps, resolve merges:
  - If two same-value blocks become adjacent (orthogonal), merge into one double value at the destination cell.
  - Merge resolution order is deterministic: scan rows top to bottom, left to right.

Clear pattern:
- Any straight line of 3 identical values (horizontal or vertical) explodes and clears those 3 blocks.

Scoring:
- +15 per tile placed
- +25 per successful snap movement
- +75 per merge
- +200 per triple clear
- +10 per tile cleared
- Combo multiplier

Pressure ramp:
- Increase chance of higher values based on turn count. Deterministic weighting is fine.

Fail:
- No legal placement remains (or board full).

### 12.3 Color Flood (color-flood)

Core mechanic:
- Place one colored pipe piece (polyomino). Each tile has a color.
- After placement, flood fill runs deterministically for feedback:
  - Starting from each placed tile, traverse connected orthogonal tiles of the same color and mark as flooded.
  - Flood is visual, but it also defines regions for clears.

Clear pattern:
- Any connected region of exactly size 6 of a given color explodes and clears the entire region.

Overshoot rule:
- Regions larger than 6 do not clear and are considered stuck until they are reduced by adjacent clears.

Determinism:
- Region detection uses BFS with a fixed neighbor order.

Scoring:
- +10 per tile placed
- +5 per flooded tile (per move, capped to avoid runaway scoring)
- +250 for perfect region clear (size 6)
- +10 per tile cleared
- Combo multiplier for multiple region clears

Fail:
- Board full or no legal placement.

## 13. Outstanding functionality checklist

This list should be implemented before adding more games:

- Hash routing works on GitHub Pages.
- Vite base path set for repo deployment.
- AppShell reserves ad slot height and safe areas.
- GameHost lifecycle: start, pause, resume, reset, destroy are wired.
- Options modal pauses game and resumes correctly.
- Reset Local Data clears local keys and reauths Firebase.
- Firebase anonymous auth boot flow.
- LeaderboardService upserts bestByUser docs.
- Leaderboard screen fetches and displays top 50.
- Menu stats strip shows best and rank and handles loading and offline.
- Overlay state machine prevents stacking.

## 14. Acceptance criteria

- No scroll during play.
- Every move produces points and satisfying feedback.
- Clears produce larger explosions and stronger feedback.
- Sound effects play for all meaningful actions when enabled.
- Haptic feedback triggers alongside sounds for mobile devices.
- All games end naturally.
- Adding a new game requires:
  - adding a folder under src/games
  - exporting module
  - registering in GameRegistry
  - implementing appropriate sound effects via api.sounds

