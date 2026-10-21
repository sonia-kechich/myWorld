import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import ScreenHeader from '../ScreenHeader';
import QuoteCard from './QuoteCard';
import type { Quote, QuoteReminder } from '../../types';

interface QuotesScreenProps {
  quotes: Quote[];
  onAdd: (text: string) => void;
  onDelete: (id: number) => void;
  onSaveReminder: (id: number, reminder: QuoteReminder) => void;
  onToggleReminder: (id: number) => void;
  onBack: () => void;
}

export default function QuotesScreen({
  quotes,
  onAdd,
  onDelete,
  onSaveReminder,
  onToggleReminder,
  onBack,
}: QuotesScreenProps) {
  const [draft, setDraft] = useState('');
  const [pickerId, setPickerId] = useState<number | null>(null);

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onAdd(text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="screen">
      <ScreenHeader title="My Quotes" subtitle="words that carry you" onBack={onBack} />

      <div className="qlist">
        {quotes.map((quote, index) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            index={index}
            pickerOpen={pickerId === quote.id}
            onOpenPicker={setPickerId}
            onClosePicker={() => setPickerId(null)}
            onDelete={onDelete}
            onToggleReminder={onToggleReminder}
            onSaveReminder={(id, reminder) => {
              onSaveReminder(id, reminder);
              setPickerId(null);
            }}
          />
        ))}
      </div>

      <div className="qin-area">
        <textarea
          className="qta"
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a quote that means something to you..."
        />
        <button className="qsave" onClick={handleAdd}>
          Save ❝
        </button>
      </div>
    </div>
  );
}
