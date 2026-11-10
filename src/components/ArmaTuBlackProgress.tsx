import { useEffect, useMemo, useState } from 'react';
import { BLACK_DAYS_START, BLACK_DAYS_END, allocateArmaTuBlack, calculateArmaTuBlack, getArmaTuBlackHint, isBlackDaysActive, type BlackUnit } from '../lib/blackDays';

export function useArmaTuBlack(items: BlackUnit[]) {
    // Evita diferencias entre HTML estático e hidratación.
    const [active, setActive] = useState(false);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const sync = () => {
            clearTimeout(timer);
            setActive(isBlackDaysActive());
            const now = Date.now();
            const boundary = [Date.parse(BLACK_DAYS_START), Date.parse(BLACK_DAYS_END) + 1000].find(t => t > now);
            if (boundary) timer = setTimeout(sync, Math.min(boundary - now, 2147483647));
        };
        sync();
        window.addEventListener('focus', sync);
        document.addEventListener('visibilitychange', sync);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', sync);
            document.removeEventListener('visibilitychange', sync);
        };
    }, []);
    // `byItem` va en el mismo orden que `items`: descuento de cada línea del carrito.
    const byItem = useMemo(() => allocateArmaTuBlack(items), [items]);
    return { ...calculateArmaTuBlack(items), active, byItem };
}

// Ordena las líneas para que se lea la escalera: primero los productos con descuento Arma tu Black
// de mayor a menor precio, luego el resto en su orden original. Solo cambia la presentación.
export type BlackGroup = 'arma' | 'black' | 'other' | null;
const GROUP_ORDER: Record<string, number> = { arma: 0, black: 1, other: 2 };

// arma = Arma tu Black · black = cualquier producto con precio de oferta, sin importar el % · other = el resto (p. ej. suéter Escalera).
function groupOf(item: BlackUnit, eligible: boolean): BlackGroup {
    if (eligible) return 'arma';
    if (item.on_sale || (item.regular_price !== undefined && item.price < item.regular_price)) return 'black';
    return 'other';
}

export function sortForArmaTuBlack<T extends BlackUnit>(items: T[], byItem: { eligible: boolean }[], active: boolean): { item: T; index: number; group: BlackGroup; heading: BlackGroup }[] {
    const rows = items.map((item, index) => ({ item, index, group: (active ? groupOf(item, !!byItem[index]?.eligible) : null) as BlackGroup, heading: null as BlackGroup }));
    if (!active) return rows;
    rows.sort((a, b) => {
        const ga = GROUP_ORDER[a.group as string], gb = GROUP_ORDER[b.group as string];
        if (ga !== gb) return ga - gb;
        if (a.group === 'arma') return b.item.price - a.item.price || a.index - b.index;
        return a.index - b.index;
    });
    // El título de grupo solo aparece si hay más de un grupo en el carrito.
    if (new Set(rows.map(r => r.group)).size > 1) {
        rows.forEach((row, i) => { if (i === 0 || rows[i - 1].group !== row.group) row.heading = row.group; });
    }
    return rows;
}

const HEADINGS: Record<string, string> = {
    arma: '🖤 Arma tu Black',
    black: '🖤 Black Days · productos con descuento',
    other: 'Otros productos',
};

// Línea con título que separa un grupo del siguiente.
export function ArmaTuBlackGroupHeading({ group }: { group: BlackGroup }) {
    if (!group) return null;
    return <div role="heading" aria-level={3} style={{
        display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 4px', fontFamily: 'var(--font-paragraphs)',
        fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: '#8a6d2f', fontWeight: 600,
    }}>
        <span style={{ whiteSpace: 'nowrap' }}>{HEADINGS[group]}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: '#D4A853' }} />
    </div>;
}

const money = (n: number) => `$${new Intl.NumberFormat('es-CO').format(n)}`;

// Etiqueta de una línea del carrito: "50 % off Arma tu Black" o "Sin descuento adicional".
export function ArmaTuBlackLineBadge({ pcts }: { pcts: number[] }) {
    if (pcts.length === 0) return null;
    const groups = pcts.reduce<Record<number, number>>((acc, p) => ({ ...acc, [p]: (acc[p] || 0) + 1 }), {});
    const parts = Object.keys(groups).map(Number).sort((a, b) => b - a);
    const text = parts.map(p => {
        const label = p > 0 ? `${p} % off` : 'precio completo';
        return pcts.length > 1 ? `${groups[p]} × ${label}` : label;
    }).join(' · ');
    const hasDiscount = parts.some(p => p > 0);
    return <span className="black-line-badge" style={{
        display: 'inline-block', marginTop: 6, padding: '3px 8px', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase',
        fontFamily: 'var(--font-paragraphs)', background: hasDiscount ? '#000' : 'transparent',
        color: hasDiscount ? '#D4A853' : '#777', border: hasDiscount ? '1px solid #D4A853' : '1px solid #ccc',
    }}>🖤 {hasDiscount ? 'Arma tu Black · ' : ''}{text}</span>;
}

// Precio de la línea con el descuento aplicado (y el original tachado si hay ahorro).
export function ArmaTuBlackLinePrice({ total, discount }: { total: number; discount: number }) {
    if (discount <= 0) return <>{money(total)}</>;
    return <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
        <s style={{ color: '#999', fontSize: '0.8em', fontWeight: 400 }}>{money(total)}</s>
        <span>{money(total - discount)}</span>
    </span>;
}

const TIERS = [
    { n: 1, text: '15 % off al producto' },
    { n: 2, text: '50 % off al más barato' },
    { n: 3, text: '50 % al más barato + 15 % al siguiente' },
    { n: 4, text: '50 % a los 2 más baratos + 15 % al siguiente' },
];

// Resumen compacto: una fila por escalón, el actual resaltado. El detalle por producto va en cada línea del carrito.
export default function ArmaTuBlackProgress({ count }: { count: number }) {
    const tier = Math.min(4, count);
    return <aside aria-label="Progreso Arma tu Black" style={{ background: '#000', color: '#D4A853', padding: '14px 16px', margin: '12px 0', fontFamily: 'var(--font-paragraphs)' }}>
        <strong style={{ fontFamily: 'var(--font-titles)', letterSpacing: 1, fontSize: 13 }}>ARMA TU BLACK</strong>
        <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
            {TIERS.map(({ n, text }) => {
                const current = tier === n;
                return <li key={n} aria-current={current ? 'step' : undefined} style={{
                    display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 8px', fontSize: 12, lineHeight: 1.35,
                    background: current ? '#D4A853' : 'transparent', color: current ? '#000' : '#D4A853',
                    borderTop: n === 1 ? 'none' : '1px solid rgba(212,168,83,.25)', fontWeight: current ? 600 : 400,
                }}>
                    <span style={{ minWidth: 14 }}>{n}</span><span>{text}</span>
                </li>;
            })}
        </ol>
        <p aria-live="polite" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.4 }}>{getArmaTuBlackHint(count)}</p>
    </aside>;
}
