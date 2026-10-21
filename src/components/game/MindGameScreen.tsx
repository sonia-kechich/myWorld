import ScreenHeader from '../ScreenHeader';
import type { GamePhase } from '../../types';

interface MindGameScreenProps {
  phase: GamePhase;
  question: string;
  doneCount: number;
  onComplete: () => void;
  onNext: () => void;
  onBack: () => void;
}

export default function MindGameScreen({
  phase,
  question,
  doneCount,
  onComplete,
  onNext,
  onBack,
}: MindGameScreenProps) {
  return (
    <div className="screen">
      <ScreenHeader
        title="Mind Game"
        subtitle={`${doneCount} reflections this session`}
        onBack={onBack}
      />

      <div className="game-body">
        {phase === 'q' ? (
          <div className="qwrap">
            <div className="gorn">◈</div>
            <div className="gq">{question}</div>
            <div className="gh">sit with it. no need to type.</div>
            <div className="bring">
              <div className="binner">
                <div className="bcore" />
              </div>
            </div>
            <button className="donebtn" onClick={onComplete}>
              Done 🤍
            </button>
          </div>
        ) : (
          <div className="donecard">
            <div className="dstar">✦</div>
            <div className="dtitle">That took courage.</div>
            <div className="dxp">+15 xp earned</div>
            <button className="nextbtn" onClick={onNext}>
              Next question →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
