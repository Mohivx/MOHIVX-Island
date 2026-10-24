import { useSettings } from '../hooks/useSettings';
import { MohivxSpirit } from './MohivxSpirit';
import { SoulCanvas } from './SoulCanvas';
import { SOUL_SKINS } from '../constants';
import type { SoulSkin, SoulMode } from '../types';

export function CompanionCharacter({ size = 72, skin = SOUL_SKINS.hitodama, state = 'idle', onClick, className = '' }: {
  size?: number; skin?: SoulSkin; state?: string; onClick?: () => void; className?: string;
  showGlow?: boolean; interactive?: boolean;
}) {
  const {settings}=useSettings();
  if(settings.mascotMode==='custom')return <MohivxSpirit size={size} state={state as any} onClick={onClick} className={className}/>;
  const mode: SoulMode = state === 'thinking' ? 'THINKING' : state === 'speaking' ? 'TALKING' : state === 'sleeping' ? 'MUTED' : 'LISTENING';
  return <span className={`companion-character ${className}`} style={{ width: size, height: size }} onClick={onClick}>
    {settings.showReactions!==false && state==='speaking' && <span className="soul-reaction" aria-hidden>✨</span>}
    <SoulCanvas skin={skin} mode={mode} scale={size / 80} interactive />
  </span>;
}
