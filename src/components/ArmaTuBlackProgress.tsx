import { useEffect, useState } from 'react';
import { BLACK_DAYS_START, BLACK_DAYS_END, calculateArmaTuBlack, getArmaTuBlackHint, isBlackDaysActive, type BlackUnit } from '../lib/blackDays';

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
    return { ...calculateArmaTuBlack(items), active };
}

export default function ArmaTuBlackProgress({ count }: { count: number }) {
    const tier = Math.min(4, count);
    return <aside aria-label="Progreso Arma tu Black" style={{ background: '#000', color: '#D4A853', padding: 14, margin: '12px 0', fontFamily: 'var(--font-paragraphs)' }}>
        <strong style={{ fontFamily: 'var(--font-titles)' }}>ARMA TU BLACK</strong>
        <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, listStyle: 'none', padding: 0 }}>
            {['1 producto · 15 %', '2 productos · 50 % al 2.º', '3 productos · 15 % al 2.º, 50 % al 3.º', '4 productos · 15 % al 2.º, 50 % al 3.º y 4.º'].map((label, i) =>
                <li key={label} aria-current={tier === i + 1 ? 'step' : undefined} style={{ padding: '8px 4px', fontSize: 11, border: '1px solid #D4A853', background: tier === i + 1 ? '#D4A853' : '#000', color: tier === i + 1 ? '#000' : '#D4A853' }}>{label}</li>)}
        </ol>
        <p aria-live="polite" style={{ fontSize: 13, margin: 0 }}>{getArmaTuBlackHint(count)}</p>
    </aside>;
}
