import { useState, useEffect } from 'react';

export function LandscapeOverlay() {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isLandscapeMode = window.innerWidth > window.innerHeight && window.innerWidth < 1024;
      setIsLandscape(isLandscapeMode);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isLandscape) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/95 flex flex-col items-center justify-center p-8">
      <div className="text-6xl mb-6 animate-bounce">📱</div>
      <h2 className="text-xl font-bold text-white mb-2">Rotate Your Device</h2>
      <p className="text-gray-400 text-center">
        This game is best played in portrait mode
      </p>
    </div>
  );
}
