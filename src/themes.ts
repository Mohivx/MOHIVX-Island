import type { MohivxSettings } from './types/settings';
const SOUL_ACCENTS:Record<string,string>={hitodama:'#8ab4ff',ember:'#ff916d',wisp:'#83cbb5',amethyst:'#bd9aea',gilded:'#e6c178',void:'#b9a2dc'};
export function skinThemePatch(id:string):Pick<MohivxSettings,'theme'|'customAccentColor'>{return {theme:id==='hitodama'?'original-blue':id==='amethyst'||id==='void'?'amethyst':id==='gilded'?'original-gold':'custom',customAccentColor:SOUL_ACCENTS[id]||'#8ab4ff'};}
export function themeVariables(s:Pick<MohivxSettings,'theme'|'customAccentColor'>&Partial<Pick<MohivxSettings,'islandGlowStrength'|'islandGlowSpread'|'settingsTheme'>>){const accent=themeAccent(s),black=s.settingsTheme==='black';return {'--app-accent':accent,'--character-glow':accent,'--character-wash':accent+'18','--character-glow-strength':typeof s.islandGlowStrength==='number'&&Number.isFinite(s.islandGlowStrength)?Math.max(0,Math.min(1.5,s.islandGlowStrength)):1,'--character-glow-spread':typeof s.islandGlowSpread==='number'&&Number.isFinite(s.islandGlowSpread)?Math.max(.5,Math.min(1.5,s.islandGlowSpread)):1,'--reference-bg':black?'#000000':s.theme==='original-blue'?'#10111d':`color-mix(in srgb, ${accent} 8%, #10111d)`,'--reference-card':black?'#09090b':s.theme==='original-blue'?'#1e1e2b':`color-mix(in srgb, ${accent} 7%, #1e1e2b)`,'--reference-border':black?'#202124':'#ffffff10'};}
export function islandThemeFill(s:Pick<MohivxSettings,'theme'|'customAccentColor'>){if(s.theme==='original-blue'||!s.theme)return '#000000';const accent=themeAccent(s);const rgb=[1,3,5].map(i=>Math.round(parseInt(accent.slice(i,i+2),16)*.035+2));return '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');}
export const THEMES=[
  {id:'original-blue',name:'Original blue',ar:'الأزرق الأساسي',color:'#8ab4ff'},
  {id:'original-gold',name:'Warm gold',ar:'الذهبي الدافئ',color:'#d8b368'},
  {id:'amethyst',name:'Amethyst',ar:'البنفسجي',color:'#c4a4ff'},
  {id:'silver-monochrome',name:'Silver',ar:'الفضي',color:'#c8ced8'},
] as const;
export function themeAccent(s:Pick<MohivxSettings,'theme'|'customAccentColor'>){return s.theme==='custom'&&/^#[a-f0-9]{6}$/i.test(s.customAccentColor)?s.customAccentColor:THEMES.find(t=>t.id===s.theme)?.color || '#8ab4ff';}

export function themeSurface(theme:string){return theme==='original-gold'?{base:'#0d0d0b',card:'#1c1b18'}:theme==='amethyst'?{base:'#100c17',card:'#20192a'}:theme==='silver-monochrome'?{base:'#0e1013',card:'#1b1e24'}:{base:'#080c13',card:'#151b27'};}

