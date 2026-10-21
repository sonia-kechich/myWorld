import { useEffect, useState } from 'react';
import { REPEAT_OPTIONS } from '../../data';
import type { Quote, QuoteReminder, RepeatOption } from '../../types';

interface QuoteCardProps {
  quote: Quote;
  index: number;
  pickerOpen: boolean;
  onOpenPicker: (id: number) => void;
  onClosePicker: () => void;
  onDelete: (id: number) => void;
  onToggleReminder: (id: number) => void;
  onSaveReminder: (id: number, reminder: QuoteReminder) => void;
}

const DEFAULT_TIME = '08:00';
const DEFAULT_REPEAT: RepeatOption = 'daily';

export default function QuoteCard({
  quote,
  index,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onDelete,
  onToggleReminder,
  onSaveReminder,
}: QuoteCardProps) {
  const [time, setTime] = useState(DEFAULT_TIME);
  const [repeat, setRepeat] = useState<RepeatOption>(DEFAULT_REPEAT);

  useEffect(() => {
    if (pickerOpen) {
      setTime(DEFAULT_TIME);
      setRepeat(DEFAULT_REPEAT);
    }
  }, [pickerOpen]);

  const reminderLabel = quote.reminder
    ? `${quote.reminder.time} · ${quote.reminder.repeat}`
    : 'Set reminder';

  return (
    <div className="qcard" style={{ animationDelay: `${index * 0.06}s` }}>
      <div className="qtxt">❝ {quote.text}</div>

      <div className="qactions">
        <button
          className={quote.active ? 'bell on' : 'bell'}
          onClick={() =>
            quote.reminder ? onToggleReminder(quote.id) : onOpenPicker(quote.id)
          }
        >
          🔔 {reminderLabel}
        </button>
        <button
          className="qdel"
          onClick={() => onDelete(quote.id)}
          aria-label="Delete quote"
        >
          ✕
        </button>
      </div>

      {pickerOpen ? (
        <div className="tpick">
          <div className="tprow">
            <span className="tplbl">Time</span>
            <input
              className="tpin"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
          <div className="tprow">
            <span className="tplbl">Repeat</span>
            <select
              className="tpsel"
              value={repeat}
              onChange={(event) =>
                setRepeat(event.target.value as RepeatOption)
              }
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="tpbtns">
            <button
              className="tpsave"
              onClick={() => onSaveReminder(quote.id, { time, repeat })}
            >
              Save
            </button>
            <button className="tpcancel" onClick={onClosePicker}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
