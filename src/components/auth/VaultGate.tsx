import { useVault } from '../../auth/VaultProvider';
import LockScreen from './LockScreen';
import SetupScreen from './SetupScreen';
import MyWorldApp from '../../MyWorldApp';

export default function VaultGate() {
  const { phase } = useVault();

  if (phase === 'checking') {
    return (
      <div className="screen auth-screen auth-loading">
        <div className="auth-title">myWorld</div>
        <div className="auth-sub">Checking your vault…</div>
      </div>
    );
  }

  if (phase === 'unconfigured') return <SetupScreen />;
  if (phase === 'locked') return <LockScreen />;

  return <MyWorldApp />;
}
