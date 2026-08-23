export type XZ = [number, number];

export interface WaterLine { kind: 'canal'; axis: 'x' | 'z'; at: number }
export interface District { id: string; name: string; tiles: [XZ, XZ] }
export type PlaceKind = 'home' | 'work' | 'market' | 'church' | 'tavern' | 'dock' | 'hills' | 'notary';
export interface Place { id: string; kind: PlaceKind; district: string; xz: XZ; name: string; price_mult: number }
export type LandmarkKind = 'basilica' | 'campanile' | 'bridge' | 'arsenale' | 'furnace' | 'fountain';
export interface Landmark { id: string; kind: LandmarkKind; xz: XZ }
export interface MapSpec { size: { cols: number; rows: number }; water: WaterLine[]; districts: District[]; places: Place[]; landmarks: Landmark[] }

export interface Persona {
  id: string; name: string; born: number; sex: 'male' | 'female'; job: string; home: string; district: string;
  money: number; health: number; energy: number; hunger: number;
  goals: { id: string; text: string }[]; traits: Record<string, number>; backstory: string;
}

export interface RosterEntry { id: string; name: string; role: string; class: string; model: string; home: string; routine: string[] }

export interface HelloFrame {
  type: 'hello'; run_id: string; scenario: MapSpec; scenario_id: string; start_year: number; max_years: number;
  persona: Persona; roster: RosterEntry[]; harness: string; model: string; seed: number;
}

export interface Activity { icon: string; text: string }
export interface HeroFrame { xz: XZ; to: string | null; age: number; money: number; health: number; energy: number; activity: Activity; alive: boolean }
export interface PersonFrame { id: string; xz: XZ; to: string | null; alive: boolean; talking: boolean }
export interface EventFrame { id: string; kind: string; active: boolean; text: string; district: string | null }
export interface MemoryFrame { wrote: string[]; retrieved: string[] }
export interface RelationFrame { id: string; name: string; role: string; world: boolean; agent: boolean }

export interface Frame {
  type: 'frame'; t: number; date: string; hero: HeroFrame; people: PersonFrame[]; events: EventFrame[];
  news: string; memory: MemoryFrame; relations: RelationFrame[];
  plan?: Record<string, unknown>; deltas?: Record<string, number>; observation_text?: string;
}

export type MomentKind = 'plant' | 'payoff' | 'negative' | 'quiz';
export interface MomentFrame {
  type: 'moment'; t: number; probe_id: string; kind: MomentKind; who: string; role: string; claim: string;
  retrieved: string | null; action: string; ok: boolean | null; label: string; delay_seasons: number;
}

export interface EndFrame { type: 'end'; t: number; age: number; cause: string; scores: Record<string, unknown>; cost_usd: number }

export type AnyFrame = HelloFrame | Frame | MomentFrame | EndFrame;

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export const seasonLabel = (startYear: number, t: number) => `${SEASONS[t % 4]} ${startYear + Math.floor(t / 4)}`;
