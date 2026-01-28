import { SoundEngine } from '../../core/SoundEngine';
import { useSettings } from '../../core/SettingsStore';

interface GameInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
}

const GAME_RULES: Record<string, { title: string; rules: string[] }> = {
  'dice-risk': {
    title: 'Dice Risk',
    rules: [
      'You have a limited pool of dice - spend wisely!',
      'Choose 1, 2, or 3 dice to roll each turn',
      'Cyan spaces give you more dice to keep playing',
      'Red danger zones cost you dice from your pool',
      'Complete laps around the board to level up',
      'Game over when you run out of dice!',
    ],
  },
  'wrecking-ball': {
    title: 'Wrecking Ball',
    rules: [
      'Drag to aim, release to launch balls at bricks',
      'Colored bricks show HP - hit them that many times',
      'Gray X bricks are indestructible - work around them',
      'Pink bomb bricks explode and destroy nearby bricks!',
      'Build combos by hitting multiple bricks with one ball',
      'Blue shields at bottom save your ball (one use each)',
      'Clear all destructible bricks to advance levels',
    ],
  },
  'bloom-burst': {
    title: 'Bloom Burst',
    rules: [
      'Drag pieces onto the 8x8 grid to place them',
      'Fill a 3x3 square to trigger a bloom burst',
      'Bursts clear the 3x3 and spread to all connected tiles',
      'Bigger bursts = bigger points! Chain for combos',
      'Game ends when no piece fits on the board',
    ],
  },
  'block-blast': {
    title: 'Block Blast',
    rules: [
      'Drag pieces onto the 8x8 grid to place them',
      'Fill a complete row or column to clear it',
      'Clear multiple lines at once for bonus points',
      'Keep clearing to build combo multipliers',
      'Game ends when no piece fits on the board',
    ],
  },
  'snap-merge': {
    title: 'Snap Merge',
    rules: [
      'Tap any block to drop it down',
      'When matching numbers collide, they merge and double',
      'Build up to higher numbers for more points',
      'A new block spawns at the top after each move',
      'Game ends when blocks reach the danger zone',
    ],
  },
  'color-flood': {
    title: 'Color Flood',
    rules: [
      'Tap a color to flood from the top-left corner',
      'Capture cells for points - bigger captures = way more!',
      'Groups of exactly 6 same-colored tiles pop for +100 bonus',
      'Fill the entire board with one color to win the round',
      'Round bonus: +500 plus +20 per move remaining',
      'You have 25 moves per round - plan big captures!',
    ],
  },
};

export function GameInfoModal({ isOpen, onClose, gameId }: GameInfoModalProps) {
  const { settings } = useSettings();

  if (!isOpen) return null;

  const info = GAME_RULES[gameId] || { title: 'Game Rules', rules: ['No rules available'] };

  const handleClose = () => {
    if (settings.sound) SoundEngine.uiClose();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-2xl p-6 max-w-sm w-full animate-pop-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold font-display">{info.title}</h2>
          <button
            onClick={handleClose}
            className="p-2 -m-2 text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">How to Play</h3>
          <ul className="space-y-2">
            {info.rules.map((rule, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-200">
                <span className="text-primary-400 font-bold">{i + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={handleClose}
          className="w-full mt-6 py-3 bg-primary-500 hover:bg-primary-400 text-white font-bold font-display rounded-xl transition-colors shadow-lg shadow-primary-500/25"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
