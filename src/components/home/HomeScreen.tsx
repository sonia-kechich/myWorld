import type { CSSProperties } from 'react';
import { GameIcon, QuotesIcon, ReflectIcon } from '../icons';
import type { ScreenId } from '../../types';

interface HomeScreenProps {
  level: number;
  levelName: string;
  progress: number;
  onNavigate: (screen: ScreenId) => void;
}

interface HomeCard {
  id: ScreenId;
  name: string;
  subtitle: string;
  delay: string;
  icon: () => JSX.Element;
  accent: CSSProperties;
}

const CARDS: HomeCard[] = [
  {
    id: 'reflect',
    name: 'Reflect',
    subtitle: 'express yourself',
    delay: '0.12s',
    icon: ReflectIcon,
    accent: {
      color: 'var(--blue)',
      background: 'rgba(125,211,252,.12)',
      border: '1px solid rgba(125,211,252,.17)',
    },
  },
  {
    id: 'quotes',
    name: 'My Quotes',
    subtitle: 'personal reinforcement',
    delay: '0.21s',
    icon: QuotesIcon,
    accent: {
      color: 'var(--green)',
      background: 'rgba(134,239,172,.10)',
      border: '1px solid rgba(134,239,172,.15)',
    },
  },
  {
    id: 'game',
    name: 'Mind Game',
    subtitle: 'mental training',
    delay: '0.30s',
    icon: GameIcon,
    accent: {
      color: 'var(--rose)',
      background: 'rgba(249,168,212,.10)',
      border: '1px solid rgba(249,168,212,.15)',
    },
  },
];

export default function HomeScreen({
  level,
  levelName,
  progress,
  onNavigate,
}: HomeScreenProps) {
  return (
    <div className="screen">
      <div className="xp-area">
        <div className="xp-row">
          <span className="lbl">
            Level {level} · {levelName}
          </span>
          <span className="lbl">
            {progress}/100 xp
          </span>
        </div>
        <div className="xp-track">
          <div className="xp-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="home-top">
        <div className="h-title">myWorld</div>
        <div className="h-sub">a private space just for you</div>
      </div>

      <div className="divider" />

      <div className="cards">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              className="card"
              onClick={() => onNavigate(card.id)}
              style={{ animationDelay: card.delay }}
            >
              <div className="c-icon" aria-hidden="true" style={card.accent}>
                <Icon />
              </div>
              <div>
                <div className="c-name">{card.name}</div>
                <div className="c-sub">{card.subtitle}</div>
              </div>
              <div className="c-arr">›</div>
            </button>
          );
        })}
      </div>

      <div className="bottom-bar">
        <button
          className="vaultbtn"
          onClick={() => onNavigate('settings')}
          aria-label="Vault settings"
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </div>
  );
}
