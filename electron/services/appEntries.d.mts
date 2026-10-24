export interface AppEntry {name:string;path?:string;target?:string;args?:string;appId?:string;icon?:string;isOpen?:boolean;[key:string]:unknown}
export function appEntryKeys(item:AppEntry):string[];
export function mergeAppEntries<T extends {name:string;path?:string;target?:string;args?:string;appId?:string;icon?:string;isOpen?:boolean}>(...groups:T[][]):T[];
