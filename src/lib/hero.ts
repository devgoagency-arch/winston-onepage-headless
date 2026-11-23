import { getSnapshotHeroSlides } from './snapshot';

/**
 * Obtiene las diapositivas del Banner Hero exclusivamente desde el snapshot commiteado.
 */
export async function getHeroSlides() {
    return getSnapshotHeroSlides();
}
