export type ScreenId = 'home' | 'reflect' | 'quotes' | 'game';

export type ReflectMode = 'pos' | 'neg';

export type RepeatOption = 'daily' | 'weekdays' | 'weekends' | 'once';

export interface QuoteReminder {
  time: string;
  repeat: RepeatOption;
}

export interface Quote {
  id: number;
  text: string;
  reminder: QuoteReminder | null;
  active: boolean;
}

export interface ReflectMessage {
  id: number;
  text: string;
  mode: ReflectMode;
}

export type GamePhase = 'q' | 'done';
