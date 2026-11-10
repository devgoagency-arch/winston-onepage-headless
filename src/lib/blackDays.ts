// America/Bogota no cambia de UTC-5. El fin incluye todo el último segundo.
export const BLACK_DAYS_START = '2026-11-23T00:00:00-05:00';
export const BLACK_DAYS_END = '2026-11-30T23:59:59-05:00';
export const BLACK_DAYS_PREVIEW_START = '2026-11-22T23:00:00-05:00';
export const EXTRA_UNITS_DISCOUNT = 0; // por confirmar con negocio

export function isBlackDaysPreviewBuild(nowMs = Date.now()): boolean {
    return nowMs < Date.parse(BLACK_DAYS_PREVIEW_START);
}

export interface BlackUnit {
    price: number;
    regular_price?: number;
    on_sale?: boolean;
    quantity?: number;
    slug?: string;
    name?: string;
    tags?: { id: number }[];
}

// Misma detección histórica que calculateSweater2x1Discount.
export function isSweaterEscalera(item: BlackUnit): boolean {
    return `${item.slug || ''} ${item.name || ''}`.toLowerCase().includes('escalera');
}

export function isBlackDaysActive(now = new Date()): boolean {
    if ((import.meta as any).env?.DEV) return true;
    return now.getTime() >= Date.parse(BLACK_DAYS_START)
        && now.getTime() < Date.parse(BLACK_DAYS_END) + 1000;
}

export function getArmaTuBlackHint(n: number): string {
    return [
        'Arma tu Black: agrega productos sin descuento y empieza con 15 % off.',
        'Llevas 15 % off. Agrega otro y el de menor precio lleva 50 % off',
        'Agrega un 3.º: 15 % al 2.º y 50 % al 3.º',
        'Agrega un 4.º: 50 % al 3.º y 4.º',
        '¡Máximo beneficio Arma tu Black!',
    ][Math.min(4, Math.max(0, Math.floor(n)))];
}

// Productos sin descuento propio (los zapatos con banda y el suéter Escalera quedan fuera).
export function isArmaTuBlackEligible(item: BlackUnit): boolean {
    return !item.on_sale
        && !(item.regular_price !== undefined && item.price < item.regular_price)
        && !isSweaterEscalera(item) && !item.tags?.some(tag => tag.id === 937)
        && Number.isFinite(item.price) && item.price >= 0;
}

// Escalera de descuentos, de mayor a menor precio: el más barato lleva el descuento más hondo.
function ladderRates(eligibleCount: number): number[] {
    return eligibleCount === 1 ? [15] : eligibleCount === 2 ? [0, 50] : [0, 15, 50, 50];
}

// Reparte el descuento entre las líneas del carrito (mismo orden que `items`).
// `pcts` trae un porcentaje por unidad de la línea; `discount` es el ahorro de toda la línea.
export function allocateArmaTuBlack(items: BlackUnit[]): { eligible: boolean; pcts: number[]; discount: number }[] {
    const units: { line: number; price: number }[] = [];
    items.forEach((item, line) => {
        if (!isArmaTuBlackEligible(item)) return;
        for (let i = 0; i < Math.max(0, Math.floor(item.quantity ?? 1)); i++) units.push({ line, price: item.price });
    });
    units.sort((a, b) => b.price - a.price);
    const rates = ladderRates(units.length);
    const result = items.map(item => ({ eligible: isArmaTuBlackEligible(item), pcts: [] as number[], discount: 0 }));
    units.forEach((unit, index) => {
        const pct = rates[index] ?? EXTRA_UNITS_DISCOUNT;
        result[unit.line].pcts.push(pct);
        result[unit.line].discount += Math.round(unit.price * pct / 100);
    });
    return result;
}

// Cálculo puro independiente del reloj; el consumidor aplica la ventana.
// Acepta unidades o líneas con quantity, sin mutar la entrada.
export function calculateArmaTuBlack(units: BlackUnit[]) {
    const prices = units.filter(isArmaTuBlackEligible)
        .flatMap(item => Array.from({ length: Math.max(0, Math.floor(item.quantity ?? 1)) }, () => item.price))
        .sort((a, b) => b - a);
    const eligibleCount = prices.length;
    const rates = ladderRates(eligibleCount);
    const lines = prices.map((price, index) => {
        const pct = rates[index] ?? EXTRA_UNITS_DISCOUNT;
        return { price, pct, amount: Math.round(price * pct / 100) };
    });
    return {
        discount: lines.reduce((sum, line) => sum + line.amount, 0),
        eligibleCount, lines, tier: Math.min(4, eligibleCount),
        next: { missing: eligibleCount < 4 ? 1 : 0, message: getArmaTuBlackHint(eligibleCount) },
    };
}
