import { getSnapshotLookOfTheWeek } from './snapshot';

/**
 * Obtiene el Look de la Semana exclusivamente desde el snapshot commiteado.
 */
export async function getLookOfTheWeekData() {
    return getSnapshotLookOfTheWeek();
}
