/**
 * Stock en vivo para el panel "añadir rápido" de las tarjetas.
 * Junta los pedidos de todas las tarjetas montadas en la misma página en UNA sola
 * consulta a /api/stock (cacheada en el CDN de Vercel). Si falla, resuelve null
 * y la tarjeta usa el JSON estático como respaldo.
 */

export type LiveVariation = { id: number; color: string | null; size: string | null };

const cache = new Map<number, Promise<LiveVariation[] | null>>();
let pending = new Map<number, (v: LiveVariation[] | null) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const MAX_PER_REQUEST = 60;

async function flush() {
    const batch = pending;
    pending = new Map();
    timer = null;

    const ids = Array.from(batch.keys()).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i += MAX_PER_REQUEST) {
        const chunk = ids.slice(i, i + MAX_PER_REQUEST);
        try {
            const res = await fetch(`/api/stock?ids=${chunk.join(',')}`);
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            chunk.forEach(id => batch.get(id)?.(Array.isArray(data?.[id]) ? data[id] : null));
        } catch (e) {
            chunk.forEach(id => {
                batch.get(id)?.(null);
                cache.delete(id); // permitir reintento en una próxima visita a la tarjeta
            });
        }
    }
}

export function getLiveStock(productId: number): Promise<LiveVariation[] | null> {
    if (!productId || typeof window === 'undefined') return Promise.resolve(null);
    const cached = cache.get(productId);
    if (cached) return cached;

    const promise = new Promise<LiveVariation[] | null>(resolve => {
        pending.set(productId, resolve);
    });
    cache.set(productId, promise);

    if (!timer) timer = setTimeout(flush, 60);
    return promise;
}
