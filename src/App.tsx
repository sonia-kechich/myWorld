import Stars from './components/Stars';
import VaultGate from './components/auth/VaultGate';
import { VaultProvider } from './auth/VaultProvider';

export default function App() {
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
