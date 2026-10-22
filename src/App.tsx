import { useEffect } from 'react';
import Stars from './components/Stars';
import VaultGate from './components/auth/VaultGate';
import { VaultProvider } from './auth/VaultProvider';
import { installBackButton } from './native/backButton';

export default function App() {
  useEffect(() => installBackButton(), []);

  return (
    <>
      <Stars />

      <div className="phone">
        <VaultProvider>
          <VaultGate />
        </VaultProvider>
      </div>
    </>
  );
}
