import { getSnapshotHomeCategories } from './snapshot';

/**
 * Obtiene los datos de la sección de categorías del Home exclusivamente desde el snapshot commiteado.
 */
export async function getHomeCategories() {
    return getSnapshotHomeCategories();
}
