import { useCallback, useEffect, useState } from 'react';
import { useVault } from './auth/VaultProvider';
import HomeScreen from './components/home/HomeScreen';
import ReflectScreen from './components/reflect/ReflectScreen';
import QuotesScreen from './components/quotes/QuotesScreen';
import MindGameScreen from './components/game/MindGameScreen';
import SettingsScreen from './components/settings/SettingsScreen';
import { useXp } from './hooks/useXp';
import { useQuotes } from './hooks/useQuotes';
import { useReflect } from './hooks/useReflect';
import { useMindGame } from './hooks/useMindGame';
import { setBackHandler } from './native/backButton';
import type { ScreenId } from './types';

export default function MyWorldApp() {
  const { store } = useVault();
  const [screen, setScreen] = useState<ScreenId>('home');

  const { level, levelName, progress, addXp } = useXp(store);

  const awardQuoteXp = useCallback(() => addXp(10), [addXp]);
  const awardReflectXp = useCallback(() => addXp(5), [addXp]);
  const awardGameXp = useCallback(() => addXp(15), [addXp]);

  const {
    quotes,
    addQuote,
    deleteQuote,
    saveReminder,
    toggleReminder,
  } = useQuotes(store, awardQuoteXp);
  const reflect = useReflect(store, awardReflectXp);
  const game = useMindGame(store, awardGameXp);

  const goHome = useCallback(() => setScreen('home'), []);

  useEffect(() => {
    // On Android the back button goes back to the home screen first and only
    // closes the app from there.
    setBackHandler(() => {
      if (screen === 'home') return false;
      setScreen('home');
      return true;
    });

    return () => setBackHandler(null);
  }, [screen]);

  return (
    <>
      {screen === 'home' ? (
        <HomeScreen
          level={level}
          levelName={levelName}
          progress={progress}
          onNavigate={setScreen}
        />
      ) : null}

      {screen === 'reflect' ? (
        <ReflectScreen
          mode={reflect.mode}
          onModeChange={reflect.setMode}
          messages={reflect.messages}
          typing={reflect.typing}
          draft={reflect.draft}
          onDraftChange={reflect.setDraft}
          onSend={reflect.send}
          moodPercent={reflect.moodPercent}
          onBack={goHome}
        />
      ) : null}

      {screen === 'quotes' ? (
        <QuotesScreen
          quotes={quotes}
          onAdd={addQuote}
          onDelete={deleteQuote}
          onSaveReminder={saveReminder}
          onToggleReminder={toggleReminder}
          onBack={goHome}
        />
      ) : null}

      {screen === 'game' ? (
        <MindGameScreen
          phase={game.phase}
          question={game.question}
          doneCount={game.doneCount}
          onComplete={game.complete}
          onNext={game.next}
          onBack={goHome}
        />
      ) : null}

      {screen === 'settings' ? (
        <SettingsScreen onBack={goHome} />
      ) : null}
    </>
  );
}
