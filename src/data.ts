import type { RepeatOption } from './types';

export const LEVEL_NAMES = [
  'Seedling',
  'Seeker',
  'Thinker',
  'Observer',
  'Sage',
  'Luminary',
] as const;

export const REFLECTION_QUESTIONS: readonly string[] = [
  'What is one thing you handled well today?',
  'Why are you capable of succeeding?',
  'Name something about yourself you genuinely respect.',
  'What challenge have you already overcome that once felt impossible?',
  'Who would you be if fear wasn’t a factor?',
  'What does your future self thank you for doing today?',
  'What quality in you are you not giving yourself credit for?',
  'What would you tell a friend who felt exactly how you feel right now?',
  'What is one small thing you did today that mattered?',
  'What does ‘enough’ look like for you, right now?',
];

export const REPEAT_OPTIONS: readonly RepeatOption[] = [
  'daily',
  'weekdays',
  'weekends',
  'once',
];

export const MAX_XP = 600;
export const XP_PER_LEVEL = 100;
