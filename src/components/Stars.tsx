import { useMemo } from 'react';
import type { CSSProperties } from 'react';

interface Star {
  size: number;
  top: number;
  left: number;
  opacity: number;
  duration: number;
  delay: number;
}

type StarStyle = CSSProperties & {
  '--dur': string;
  '--delay': string;
};

const STAR_COUNT = 65;

export default function Stars() {
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: STAR_COUNT }, () => ({
        size: Math.random() * 1.7 + 0.4,
        top: Math.random() * 100,
        left: Math.random() * 100,
        opacity: Math.random() * 0.5 + 0.1,
        duration: 2 + Math.random() * 4,
        delay: Math.random() * 5,
      })),
    [],
  );

  return (
    <div className="stars" aria-hidden="true">
      {stars.map((star, index) => (
        <div
          key={index}
          className="star"
          style={
            {
              width: `${star.size}px`,
              height: `${star.size}px`,
              top: `${star.top}%`,
              left: `${star.left}%`,
              opacity: star.opacity,
              '--dur': `${star.duration}s`,
              '--delay': `${star.delay}s`,
            } as StarStyle
          }
        />
      ))}
    </div>
  );
}
