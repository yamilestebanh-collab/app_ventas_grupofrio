import type { GFStop } from '../types/plan';

export function removeStopById<T extends Pick<GFStop, 'id'>>(stops: T[], stopId: number): T[] {
  return stops.filter((stop) => stop.id !== stopId);
}
