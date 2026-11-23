// Precio normal tachado y porcentaje de descuento. No muestra nada si el producto no tiene precio rebajado.
export default function PriceWas({ price, regular }: { price: number; regular?: number }) {
    if (!regular || !(price > 0) || regular <= price) return null;
    const pct = Math.round((1 - price / regular) * 100);
    return (
        <>
            <s style={{ color: '#999', marginRight: 6 }}>${new Intl.NumberFormat('es-CO').format(regular)}</s>
            <b style={{ marginRight: 6, padding: '1px 6px', background: '#E31B23', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.02em' }}>−{pct} %</b>
        </>
    );
}
