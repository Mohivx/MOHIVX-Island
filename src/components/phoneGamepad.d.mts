export const DEFAULT_GAMEPAD_LAYOUT: Readonly<Record<string,{x:number;y:number}>>;
export const GAMEPAD_KEYS: Readonly<Record<string,string>>;
export function gamepadPoint(layout: Record<string,{x:number;y:number}>|null|undefined,action:string): {x:number;y:number};
export function gamepadInput(layout: Record<string,{x:number;y:number}>|null|undefined,action:string): {type:'tap';x:number;y:number};
export function gamepadActionForKey(event: KeyboardEvent): string;
