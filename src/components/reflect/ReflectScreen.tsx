import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import ScreenHeader from '../ScreenHeader';
import type { ReflectMessage, ReflectMode } from '../../types';

interface ReflectScreenProps {
  mode: ReflectMode;
  onModeChange: (mode: ReflectMode) => void;
  messages: ReflectMessage[];
  typing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  moodPercent: number;
  onBack: () => void;
}

export default function ReflectScreen({
  mode,
  onModeChange,
  messages,
  typing,
  draft,
  onDraftChange,
  onSend,
  moodPercent,
  onBack,
}: ReflectScreenProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const timer = window.setTimeout(() => {
      list.scrollTop = list.scrollHeight;
    }, 45);
    return () => window.clearTimeout(timer);
  }, [messages, typing]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="screen">
      <ScreenHeader title="Reflect" subtitle="express without judgment" onBack={onBack}>
        <div className="mood-mini" style={{ marginLeft: 'auto' }}>
          <div className="mood-bar">
            <div className="mood-fill" style={{ width: `${moodPercent}%` }} />
          </div>
          <div className="lbl" style={{ marginTop: 3 }}>
            {moodPercent}% light
          </div>
        </div>
      </ScreenHeader>

      <div className="msgs" ref={listRef}>
        {messages.map((message) => (
          <div key={message.id} className={`brow ${message.mode}`}>
            <div className={`bbl ${message.mode}`}>{message.text}</div>
          </div>
        ))}

        {typing ? (
          <div className={`brow ${mode === 'pos' ? 'neg' : 'pos'}`}>
            <div className="typing-ind">
              <div className="tdot" style={{ animationDelay: '0s' }} />
              <div className="tdot" style={{ animationDelay: '.2s' }} />
              <div className="tdot" style={{ animationDelay: '.4s' }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mode-row">
        <button
          className={`mpill${mode === 'neg' ? ' an' : ''}`}
          onClick={() => onModeChange('neg')}
        >
          😔 Negative
        </button>
        <button
          className={`mpill${mode === 'pos' ? ' ap' : ''}`}
          onClick={() => onModeChange('pos')}
        >
          😊 Positive
        </button>
      </div>

      <div className="input-row">
        <textarea
          className="minput"
          rows={1}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'pos'
              ? 'Something kind to yourself...'
              : "What's weighing on you..."
          }
        />
        <button className={`sbtn ${mode}`} onClick={onSend} aria-label="Send">
          ↑
        </button>
      </div>
    </div>
  );
}
