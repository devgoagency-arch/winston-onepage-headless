import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { cartItems } from '../store/cart';
import { BLACK_DAYS_START, BLACK_DAYS_END, allocateArmaTuBlack, calculateArmaTuBlack, getArmaTuBlackHint, isBlackDaysActive, type BlackUnit } from '../lib/blackDays';

// Lleva a quien arma su Black a la pestaña Ropa de la landing (en la landing solo cambia de pestaña). Sin UTM: los enlaces internos no deben pisar la fuente real en GA4.
export function goToArmaTuBlack(source = 'carrito') {
    if (window.location.pathname.startsWith('/black-days')) {
        window.dispatchEvent(new CustomEvent('campaign-tab-changed', { detail: { tab: '249' } }));
    } else {
        window.location.href = `/black-days?campaigntab=249#favoritos-sticky`;
    }
}

// hasCoupon: con un cupón aplicado Arma tu Black no se suma; el hook se comporta como fuera de campaña (sin descuento ni avisos).
export function useArmaTuBlack(items: BlackUnit[], hasCoupon = false) {
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
    return { ...calculateArmaTuBlack(items), active: active && !hasCoupon, byItem };
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
    { n: 2, text: '50 % off al de menor precio' },
    { n: 3, text: '50 % al de menor precio + 15 % al siguiente' },
    { n: 4, text: '50 % a los 2 de menor precio' },
];

// Resumen compacto: una fila por escalón, el actual resaltado. El detalle por producto va en cada línea del carrito.
// `compact` (carrito lateral): sin la lista de escalones, para que el listado de productos conserve su altura.
export default function ArmaTuBlackProgress({ count, onContinue, compact = false }: { count: number; onContinue?: () => void; compact?: boolean }) {
    const tier = Math.min(4, count);
    return <aside aria-label="Progreso Arma tu Black" style={{ background: '#000', color: '#D4A853', padding: compact ? '10px 12px' : '14px 16px', margin: '12px 0', fontFamily: 'var(--font-paragraphs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontFamily: 'var(--font-titles)', letterSpacing: 1, fontSize: 13 }}>ARMA TU BLACK{compact && count > 0 ? ` · ${count}` : ''}</strong>
            {compact && <span aria-hidden="true" style={{ display: 'flex', gap: 5 }}>
                {[1, 2, 3, 4].map(n => <span key={n} style={{ width: 10, height: 10, borderRadius: '50%', border: '1px solid #D4A853', background: tier >= n ? '#D4A853' : 'transparent' }} />)}
            </span>}
        </div>
        {!compact && <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
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
        </ol>}
        <p aria-live="polite" style={{ fontSize: 12.5, margin: compact ? '6px 0 0' : 0, lineHeight: 1.4 }}>{getArmaTuBlackHint(count)}</p>
        {onContinue && count < 4 && <button type="button" onClick={onContinue} style={{
            marginTop: compact ? 8 : 10, width: '100%', padding: '10px 12px', background: '#D4A853', color: '#000', border: 0, cursor: 'pointer',
            fontFamily: 'var(--font-paragraphs)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
        }}>Seguir armando mi Black →</button>}
    </aside>;
}

// Franja de la landing: progreso en vivo de Arma tu Black y puente desde la pestaña de zapatos en oferta.
export function ArmaTuBlackStrip({ tab, onGoArma }: { tab: string; onGoArma: () => void }) {
    const $cart = useStore(cartItems);
    const items = useMemo(() => Object.values($cart).filter(Boolean).map(v => {
        try { return JSON.parse(v as string) as BlackUnit; } catch { return null; }
    }).filter((i): i is BlackUnit => i !== null), [$cart]);
    const black = useArmaTuBlack(items);
    if (!black.active) return null;
    const count = black.eligibleCount;
    return <div className="arma-strip" role="region" aria-label="Arma tu Black">
        <style>{`
            .arma-strip { position: relative; box-sizing: border-box; width: 100%; margin: 0 auto 20px; padding: 18px 300px; background: #000; color: #D4A853; border: 1px solid #D4A853; text-align: center; font-family: var(--font-paragraphs); }
            .arma-strip-title { display: block; margin-bottom: .5rem; font-family: var(--font-titles); font-size: 1.5rem; line-height: 1; letter-spacing: 4px; font-weight: 700; }
            .arma-strip-hint { margin: 4px 0 0; font-size: 15px; line-height: 1.4; color: #fff; }
            .arma-strip-side { position: absolute; top: 50%; right: 18px; transform: translateY(-50%); display: flex; align-items: center; gap: 14px; }
            .arma-strip-dots { display: flex; gap: 6px; }
            .arma-strip-dots span { width: 14px; height: 14px; border-radius: 50%; border: 1px solid #D4A853; }
            .arma-strip-dots span.on { background: #D4A853; }
            .arma-strip-btn { padding: 10px 16px; background: #D4A853; color: #000; border: 0; cursor: pointer; font-family: var(--font-paragraphs); font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
            @media (max-width: 1200px) {
                .arma-strip { padding: 18px; }
                .arma-strip-side { position: static; transform: none; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
            }
            @media (max-width: 768px) {
                .arma-strip-title { font-size: 1.25rem; }
            }
        `}</style>
        <strong className="arma-strip-title">🖤 ARMA TU BLACK{count > 0 ? ` · LLEVAS ${count}` : ''}</strong>
        <p className="arma-strip-hint" aria-live="polite">
            {tab === 'sale' ? 'Estos productos ya traen su descuento y no suman a Arma tu Black. Suma los que no tienen descuento.' : getArmaTuBlackHint(count)}
        </p>
        <div className="arma-strip-side">
            <div className="arma-strip-dots" aria-hidden="true">
                {[1, 2, 3, 4].map(n => <span key={n} className={count >= n ? 'on' : undefined} />)}
            </div>
            <button type="button" className="arma-strip-btn" onClick={onGoArma}>Armar mi Black →</button>
        </div>
    </div>;
}
