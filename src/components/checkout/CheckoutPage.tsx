import { useStore } from '@nanostores/react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { cartItems, clearCart, isCartOpen, calculateComboDiscount, calculateSweater2x1Discount, type CartItem } from '../../store/cart';
import { userSession } from '../../store/user';
import colombiaCities from '../../lib/colombiaCities.json';
import { trackMetaEvent } from '../../utils/metaPixel';

type Step = 'form' | 'payment' | 'processing';

interface FormData {
    first_name: string;
    last_name: string;
    document_type: string;
    document_id: string;
    email: string;
    phone: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    order_notes: string;
    payment_method: 'mercadopago' | 'addi';
    ship_to_different_address: boolean;
    shipping_first_name: string;
    shipping_last_name: string;
    shipping_address_1: string;
    shipping_address_2: string;
    shipping_city: string;
    shipping_state: string;
    shipping_postcode: string;
}

const INITIAL_FORM: FormData = {
    first_name: '',
    last_name: '',
    document_type: 'CC',
    document_id: '',
    email: '',
    phone: '',
    company: '',
    address_1: '',
    address_2: '',
    city: '',
    state: '',
    postcode: '',
    order_notes: '',
    payment_method: 'mercadopago',
    ship_to_different_address: false,
    shipping_first_name: '',
    shipping_last_name: '',
    shipping_address_1: '',
    shipping_address_2: '',
    shipping_city: '',
    shipping_state: '',
    shipping_postcode: '',
};

interface FieldProps {
    label: string;
    field: keyof FormData;
    form: FormData;
    errors: Partial<FormData>;
    set: (field: keyof FormData, value: string) => void;
    type?: string;
    required?: boolean;
    placeholder?: string;
    options?: { label: string; value: string }[];
}

const COLOMBIA_STATES = [
    { value: 'AMA', label: 'Amazonas' }, { value: 'ANT', label: 'Antioquia' }, { value: 'ARA', label: 'Arauca' },
    { value: 'ATL', label: 'Atlántico' }, { value: 'BOG', label: 'Bogotá D.C.' }, { value: 'BOL', label: 'Bolívar' },
    { value: 'BOY', label: 'Boyacá' }, { value: 'CAL', label: 'Caldas' }, { value: 'CAQ', label: 'Caquetá' },
    { value: 'CAS', label: 'Casanare' }, { value: 'CAU', label: 'Cauca' }, { value: 'CES', label: 'Cesar' },
    { value: 'CHO', label: 'Chocó' }, { value: 'COR', label: 'Córdoba' }, { value: 'CUN', label: 'Cundinamarca' },
    { value: 'GUA', label: 'Guainía' }, { value: 'GUV', label: 'Guaviare' }, { value: 'HUI', label: 'Huila' },
    { value: 'LAG', label: 'La Guajira' }, { value: 'MAG', label: 'Magdalena' }, { value: 'MET', label: 'Meta' },
    { value: 'NAR', label: 'Nariño' }, { value: 'NSA', label: 'Norte de Santander' }, { value: 'PUT', label: 'Putumayo' },
    { value: 'QUI', label: 'Quindío' }, { value: 'RIS', label: 'Risaralda' }, { value: 'SAP', label: 'San Andrés y Providencia' },
    { value: 'SAN', label: 'Santander' }, { value: 'SUC', label: 'Sucre' }, { value: 'TOL', label: 'Tolima' },
    { value: 'VAC', label: 'Valle del Cauca' }, { value: 'VAU', label: 'Vaupés' }, { value: 'VID', label: 'Vichada' }
];

const Field = ({
    label, field, form, errors, set, type = 'text', required = false, placeholder = '', options
}: FieldProps) => (
    <div className={`field ${errors[field] ? 'field-error' : ''}`}>
        <label>
            {label}
            {required && <span className="required"> *</span>}
        </label>
        {options ? (
            <select
                value={form[field] as string}
                onChange={e => set(field, e.target.value)}
                className={`checkout-select ${!form[field] ? 'placeholder-active' : ''}`}
            >
                <option value="" disabled>{placeholder || `Selecciona un ${label}`}</option>
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        ) : (
            <input
                type={type}
                value={form[field] as string}
                onChange={e => set(field, e.target.value)}
                placeholder={placeholder}
            />
        )}
        {errors[field] && <span className="error-msg">{errors[field]}</span>}
    </div>
);

export default function CheckoutPage() {
    const $cartItems = useStore(cartItems);
    const session = useStore(userSession);
    const [form, setForm] = useState<FormData>(INITIAL_FORM);
    type StepType = 1 | 2 | 3 | 'processing';
    const [step, setStep] = useState<StepType>(1);
    const [errors, setErrors] = useState<Partial<FormData>>({});
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState('');
    const [showCoupon, setShowCoupon] = useState(false);

    // Calcular opciones de ciudad en base al departamento seleccionado
    const billingCitiesOptions = useMemo(() => {
        if (!form.state) return [];
        const cities = (colombiaCities as Record<string, string[]>)[form.state] || [];
        return cities.map(c => ({ label: c, value: c }));
    }, [form.state]);

    const shippingCitiesOptions = useMemo(() => {
        if (!form.shipping_state) return [];
        const cities = (colombiaCities as Record<string, string[]>)[form.shipping_state] || [];
        return cities.map(c => ({ label: c, value: c }));
    }, [form.shipping_state]);

    // Pre-llenar con datos del usuario si está logueado
    useEffect(() => {
        if (session.user_email) {
            const [first, ...rest] = (session.user_display_name || '').split(' ');
            setForm(f => ({
                ...f,
                email: session.user_email || '',
                first_name: first || '',
                last_name: rest.join(' ') || '',
            }));
        }
    }, [session.token]);

    const items = useMemo(() => {
        return Object.entries($cartItems).map(([key, value]) => ({
            key,
            ...(JSON.parse(value) as CartItem),
        }));
    }, [$cartItems]);

    const [shippingSettings, setShippingSettings] = useState({ flat_rate: 21008, free_shipping_threshold: 100000 });

    useEffect(() => {
        fetch('/api/shipping-settings')
            .then(res => res.json())
            .then(data => {
                if (data.flat_rate !== undefined) setShippingSettings(data);
            })
            .catch(err => console.error("Error fetching shipping settings:", err));
    }, []);

    const subtotal = useMemo(
        () => items.reduce((s, i) => s + i.price * i.quantity, 0),
        [items]
    );

    const hasFired = useRef(false);

    useEffect(() => {
        // 1. Si el carrito está vacío, abortar.
        if (!items || items.length === 0) return;

        // 2. Verificar con useRef para no duplicar en re-renders (ej. StrictMode)
        if (hasFired.current) return;
        hasFired.current = true;

        // 3. Forzar inyección en window
        (window as any).dataLayer = (window as any).dataLayer || [];
        (window as any).dataLayer.push({ ecommerce: null });
        (window as any).dataLayer.push({
            event: 'begin_checkout',
            ecommerce: {
                currency: 'COP',
                value: subtotal,
                items: items.map((item, index) => ({
                    item_id: String(item.id),
                    item_name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    index: index
                }))
            }
        });
        
        trackMetaEvent('InitiateCheckout', {
            content_ids: items.map(item => String(item.id)),
            content_type: 'product',
            value: subtotal,
            currency: 'COP',
            num_items: items.reduce((acc, i) => acc + i.quantity, 0)
        });

        // 4. Log de éxito
        console.log("✅ GTM TRACKING EXITOSO: begin_checkout & InitiateCheckout");
    }, [items, subtotal]);

    const discount = useMemo(() => {
        return calculateComboDiscount(items);
    }, [items]);

    const sweater2x1Discount = useMemo(() => {
        return calculateSweater2x1Discount(items);
    }, [items]);

    const totalDiscount = discount + sweater2x1Discount;

    const FREE_SHIPPING_THRESHOLD = shippingSettings.free_shipping_threshold;
    const SHIPPING_COST = shippingSettings.flat_rate;
    const discountedSubtotal = subtotal - totalDiscount;
    const shippingCost = discountedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
    const total = discountedSubtotal + shippingCost;

    const fmt = (n: number) => '$' + new Intl.NumberFormat('es-CO').format(n);

    // Redirigir si carrito vacío (pero no si estamos procesando el pago)
    useEffect(() => {
        if (Object.keys($cartItems).length === 0 && step !== 'processing') {
            isCartOpen.set(false);
            document.body.style.overflow = 'auto';
            window.location.href = '/carrito';
        }
    }, [$cartItems, step]);

    const set = (field: keyof FormData, value: string) => {
        setForm(f => ({ ...f, [field]: value }));
        setErrors(e => ({ ...e, [field]: '' }));
    };

    const validate = (): boolean => {
        const e: Partial<FormData> = {};
        if (!form.first_name.trim()) e.first_name = 'Requerido';
        if (!form.last_name.trim()) e.last_name = 'Requerido';
        if (!form.document_id.trim()) e.document_id = 'Requerido';
        if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email inválido';
        if (!form.phone.trim()) e.phone = 'Requerido';
        if (!form.address_1.trim()) e.address_1 = 'Requerido';
        if (!form.city.trim()) e.city = 'Requerido';

        if (form.ship_to_different_address) {
            if (!form.shipping_first_name.trim()) e.shipping_first_name = 'Requerido';
            if (!form.shipping_last_name.trim()) e.shipping_last_name = 'Requerido';
            if (!form.shipping_address_1.trim()) e.shipping_address_1 = 'Requerido';
            if (!form.shipping_city.trim()) e.shipping_city = 'Requerido';
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) {
            // Scroll to top or show error alert
            return;
        }
        setSubmitting(true);
        setServerError('');

        try {
            const payload = {
                ...form,
                shipping_cost: shippingCost,
                items: items.map(item => {
                    const baseProductId = Number(String(item.key).split('-')[0]);
                    return {
                        product_id: baseProductId,
                        variation_id: item.id !== baseProductId ? item.id : 0,
                        quantity: item.quantity,
                    };
                }),
            };

            const res = await fetch('/api/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok || !data.order_id) {
                setServerError(data.details || data.error || 'Error al crear la orden. Intenta de nuevo.');
                setSubmitting(false);
                return;
            }

            // Guardar número de orden para página de gracias
            sessionStorage.setItem('wh_last_order', JSON.stringify({
                id: data.order_id,
                number: data.order_number,
                email: form.email,
            }));

            setStep('processing');

            // Redirigir a pasarela de pago
            // payment_url viene de WooCommerce con el token de sesión correcto (válido tanto para Addi como para MercadoPago)
            window.location.href = data.payment_url;

        } catch (err: any) {
            setServerError('Error de conexión. Intenta de nuevo.');
            setSubmitting(false);
        }
    };

    const btnText = submitting 
        ? 'PROCESANDO...' 
        : form.payment_method === 'mercadopago' 
            ? 'PAGAR CON MERCADO PAGO' 
            : 'PAGAR CON ADDI';

    return (
        <>
            <div className="checkout-page">
                {/* BARRA DE CUPÓN (Estilos inline forzados para garantizar visibilidad) */}
                <div 
                    className="checkout-coupon-bar" 
                    onClick={() => setShowCoupon(!showCoupon)}
                    style={{ 
                        backgroundColor: '#155338', 
                        color: '#ffffff', 
                        padding: '16px 24px', 
                        marginBottom: '0px', 
                        cursor: 'pointer', 
                        borderRadius: '8px',
                        display: 'block',
                        width: '100%',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        letterSpacing: '1px'
                    }}
                >
                    <div className="coupon-bar-content">
                        <span>&gt; ¿TIENES UN CUPÓN? <u style={{ marginLeft: '10px' }}>HAZ CLIC AQUÍ PARA INTRODUCIR TU CÓDIGO</u></span>
                    </div>
                </div>

                {showCoupon && (
                    <div className="coupon-form-container" style={{ marginBottom: '20px', marginTop: '20px' }}>
                        <p style={{ marginBottom: '10px' }}>Si tienes un código de cupón, por favor, aplícalo abajo.</p>
                        <div className="coupon-input-group" style={{ display: 'flex', gap: '10px' }}>
                            <input type="text" placeholder="Código de cupón" style={{ flex: 1, padding: '12px', border: '1px solid #ccc' }} />
                            <button type="button" style={{ padding: '12px 24px', backgroundColor: '#155338', color: '#fff', border: 'none', cursor: 'pointer' }}>APLICAR CUPÓN</button>
                        </div>
                    </div>
                )}

                {/* TÍTULO Y VOLVER (Pegado al formulario) */}
                <div className="checkout-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px', marginBottom: '10px', paddingBottom: '10px', borderBottom: '2px solid #f0f0f0' }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#155338' }}>DETALLES DE FACTURACIÓN</h1>
                    <a href="/carrito" className="back-to-cart" style={{ color: '#155338', fontWeight: 600, textDecoration: 'none', fontSize: '0.9rem' }}>
                        &larr; Volver al carrito
                    </a>
                </div>

                <div className="checkout-layout">

                    {/* COLUMNA IZQUIERDA — Formulario (Flujo Premium 3 Pasos) */}
                    <div className="checkout-form-col">

                        {/* 2. INDICADOR DE PASOS DINÁMICO (The Timeline) */}
                        <div className="checkout-timeline">
                            <div className={`timeline-step ${(step === 1 || step === 2 || step === 3 || step === 'processing') ? 'active' : ''}`}>
                                <div className="timeline-circle">1</div>
                                <span className="timeline-label">CONTACTO</span>
                            </div>
                            <div className={`timeline-line ${(step === 2 || step === 3 || step === 'processing') ? 'active' : ''}`} />
                            <div className={`timeline-step ${(step === 2 || step === 3 || step === 'processing') ? 'active' : ''}`}>
                                <div className="timeline-circle">2</div>
                                <span className="timeline-label">ENVÍO</span>
                            </div>
                            <div className={`timeline-line ${(step === 3 || step === 'processing') ? 'active' : ''}`} />
                            <div className={`timeline-step ${(step === 3 || step === 'processing') ? 'active' : ''}`}>
                                <div className="timeline-circle">3</div>
                                <span className="timeline-label">PAGO</span>
                            </div>
                        </div>

                        {/* ENCAPSULAMIENTO */}
                        <div className="checkout-step-container fade-in">

                            {/* 3. PASO 1 (Identidad) */}
                            {step === 1 && (
                                <section className="checkout-section">
                                    <Field label="Dirección de correo electrónico" field="email" form={form} errors={errors} set={set} type="email" required />
                                    
                                    <div className="document-grid" style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '15px', marginBottom: '20px' }}>
                                        <div>
                                            <label className="standard-label">Tipo</label>
                                            <select defaultValue="CC" className="checkout-select" onChange={(e) => { /* opcional guardar tipo */ }}>
                                                <option value="CC">CC</option>
                                                <option value="CE">CE</option>
                                                <option value="NIT">NIT</option>
                                                <option value="PP">PP</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Field label="Documento de identidad" field="document_id" form={form} errors={errors} set={set} type="tel" required placeholder="Ej: 10203040" />
                                        </div>
                                    </div>
                                    
                                    <div className="fields-grid">
                                        <Field label="Nombre" field="first_name" form={form} errors={errors} set={set} required />
                                        <Field label="Apellidos" field="last_name" form={form} errors={errors} set={set} required />
                                    </div>

                                    <button 
                                        type="button" 
                                        className="btn-solid-green" 
                                        style={{ marginTop: '20px' }}
                                        onClick={() => {
                                            if (!form.email || !form.document_id || !form.first_name || !form.last_name) {
                                                alert('Por favor, completa todos los campos de contacto obligatorios.');
                                                return;
                                            }
                                            setStep(2);
                                        }}
                                    >
                                        CONTINUAR AL ENVÍO
                                    </button>
                                </section>
                            )}

                            {/* 4. PASO 2 (Logística) */}
                            {step === 2 && (
                                <section className="checkout-section">
                                    <div style={{ display: 'none' }}>
                                        <input type="hidden" value="CO" />
                                    </div>
                                    <Field label="Dirección de la calle" field="address_1" form={form} errors={errors} set={set} required placeholder="Número de la casa y nombre de la calle" />
                                    <Field label="Apartamento, habitación, etc. (opcional)" field="address_2" form={form} errors={errors} set={set} placeholder="Apto, Unidad, Edificio" />

                                    <div className="fields-grid">
                                        <Field label="Departamento" field="state" form={form} errors={errors} set={set} options={COLOMBIA_STATES} required placeholder="Selecciona un Departamento" />
                                        <Field label="Ciudad" field="city" form={form} errors={errors} set={set} options={billingCitiesOptions} required placeholder="Selecciona una Ciudad" />
                                    </div>

                                    <Field label="Código Postal (Opcional)" field="postcode" form={form} errors={errors} set={set} />
                                    <Field label="Teléfono Celular" field="phone" form={form} errors={errors} set={set} type="tel" required />

                                    <label className="checkbox-different-address" style={{ marginTop: '20px', display: 'block', fontSize: '11px', fontWeight: 600, color: '#555', textTransform: 'uppercase' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={form.ship_to_different_address}
                                            onChange={(e) => setForm({...form, ship_to_different_address: e.target.checked})}
                                            style={{ width: 'auto', marginRight: '8px' }}
                                        />
                                        ¿ENVIAR A UNA DIRECCIÓN DIFERENTE?
                                    </label>

                                    {form.ship_to_different_address && (
                                        <div className="shipping-section" style={{ marginTop: '20px', padding: '20px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                                            <div className="fields-grid">
                                                <Field label="Nombre" field="shipping_first_name" form={form} errors={errors} set={set} required />
                                                <Field label="Apellidos" field="shipping_last_name" form={form} errors={errors} set={set} required />
                                            </div>
                                            <Field label="Dirección de la calle" field="shipping_address_1" form={form} errors={errors} set={set} required />
                                            <Field label="Apartamento, etc. (opcional)" field="shipping_address_2" form={form} errors={errors} set={set} />
                                            <div className="fields-grid">
                                                <Field label="Departamento" field="shipping_state" form={form} errors={errors} set={set} options={COLOMBIA_STATES} required placeholder="Selecciona un Departamento" />
                                                <Field label="Ciudad" field="shipping_city" form={form} errors={errors} set={set} options={shippingCitiesOptions} required placeholder="Selecciona una Ciudad" />
                                            </div>
                                            <Field label="Código postal (opcional)" field="shipping_postcode" form={form} errors={errors} set={set} />
                                        </div>
                                    )}

                                    <div style={{ marginTop: '20px' }}>
                                        <label className="standard-label">NOTAS DEL PEDIDO (OPCIONAL)</label>
                                        <textarea
                                            value={form.order_notes}
                                            onChange={e => set('order_notes', e.target.value)}
                                            placeholder="Notas especiales para la entrega."
                                            rows={3}
                                            style={{ width: '100%', backgroundColor: '#ffffff', border: '1px solid #e0e0e0', padding: '15px', fontSize: '1rem', color: '#333' }}
                                        />
                                    </div>

                                    {/* Controles de Navegación Flexbox */}
                                    <div className="step-actions">
                                        <button 
                                            type="button" 
                                            className="btn-back"
                                            onClick={() => setStep(1)}
                                        >
                                            &larr; VOLVER
                                        </button>
                                        <button 
                                            type="button" 
                                            className="btn-solid-green" 
                                            style={{ width: 'auto', padding: '16px 30px' }}
                                            onClick={() => {
                                                if (!form.address_1 || !form.city || !form.state || !form.phone) {
                                                    alert('Por favor completa los campos obligatorios de envío.');
                                                    return;
                                                }
                                                setStep(3);
                                            }}
                                        >
                                            CONTINUAR AL PAGO
                                        </button>
                                    </div>
                                </section>
                            )}

                            {/* 5. PASO 3 (Cierre y Pago) */}
                            {step === 3 && (
                                <section className="checkout-section">
                                    <div className="payment-methods-accordion">
                                        {/* MERCADO PAGO */}
                                        <div className={`payment-method-box ${form.payment_method === 'mercadopago' ? 'active' : ''}`}>
                                            <label className="payment-method-header">
                                                <input
                                                    type="radio"
                                                    name="payment"
                                                    value="mercadopago"
                                                    checked={form.payment_method === 'mercadopago'}
                                                    onChange={() => set('payment_method', 'mercadopago')}
                                                />
                                                <span className="payment-method-title">COMPRE SEGURO CON MERCADO PAGO</span>
                                                <img src="/images/checkout/mp.png" alt="Mercado Pago" className="pm-logo mp-logo" />
                                            </label>
                                            
                                            {form.payment_method === 'mercadopago' && (
                                                <div className="payment-method-body">
                                                    <div className="mp-inner-box">
                                                        <h4>DESCUBRE LA PRACTICIDAD DE MERCADO PAGO</h4>
                                                        <div className="mp-features">
                                                            <div className="mp-feature">
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2zM3 8h18M3 16h18" /></svg>
                                                                <span>Paga con tus <strong>tarjetas guardadas</strong> o dinero disponible sin completar datos.</span>
                                                            </div>
                                                            <div className="mp-feature">
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                                                <span>Compra de forma <strong>segura</strong> con el medio de pago que prefieras.</span>
                                                            </div>
                                                        </div>
                                                        <div className="mp-cards-icons">
                                                            <svg role="img" viewBox="0 0 24 24" width="32" height="32" fill="#1434CB" xmlns="http://www.w3.org/2000/svg"><title>Visa</title><path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"/></svg>
                                                            <svg role="img" viewBox="0 0 24 24" width="32" height="32" fill="#EB001B" xmlns="http://www.w3.org/2000/svg"><title>MasterCard</title><path d="M11.343 18.031c.058.049.12.098.181.146-1.177.783-2.59 1.238-4.107 1.238C3.32 19.416 0 16.096 0 12c0-4.095 3.32-7.416 7.416-7.416 1.518 0 2.931.456 4.105 1.238-.06.051-.12.098-.165.15C9.6 7.489 8.595 9.688 8.595 12c0 2.311 1.001 4.51 2.748 6.031zm5.241-13.447c-1.52 0-2.931.456-4.105 1.238.06.051.12.098.165.15C14.4 7.489 15.405 9.688 15.405 12c0 2.31-1.001 4.507-2.748 6.031-.058.049-.12.098-.181.146 1.177.783 2.588 1.238 4.107 1.238C20.68 19.416 24 16.096 24 12c0-4.094-3.32-7.416-7.416-7.416zM12 6.174c-.096.075-.189.15-.28.231C10.156 7.764 9.169 9.765 9.169 12c0 2.236.987 4.236 2.551 5.595.09.08.185.158.28.232.096-.074.189-.152.28-.232 1.563-1.359 2.551-3.359 2.551-5.595 0-2.235-.987-4.236-2.551-5.595-.09-.08-.184-.156-.28-.231z"/></svg>
                                                            <svg role="img" viewBox="0 0 24 24" width="32" height="32" fill="#2E77BC" xmlns="http://www.w3.org/2000/svg"><title>American Express</title><path d="M16.015 14.378c0-.32-.135-.496-.344-.622-.21-.12-.464-.135-.81-.135h-1.543v2.82h.675v-1.027h.72c.24 0 .39.024.478.125.12.13.104.38.104.55v.35h.66v-.555c-.002-.25-.017-.376-.108-.516-.06-.08-.18-.18-.33-.234l.02-.008c.18-.072.48-.297.48-.747zm-.87.407l-.028-.002c-.09.053-.195.058-.33.058h-.81v-.63h.824c.12 0 .24 0 .33.05.098.048.156.147.15.255 0 .12-.045.215-.134.27zM20.297 15.837H19v.6h1.304c.676 0 1.05-.278 1.05-.884 0-.28-.066-.448-.187-.582-.153-.133-.392-.193-.73-.207l-.376-.015c-.104 0-.18 0-.255-.03-.09-.03-.15-.105-.15-.21 0-.09.017-.166.09-.21.083-.046.177-.066.272-.06h1.23v-.602h-1.35c-.704 0-.958.437-.958.84 0 .9.776.855 1.407.87.104 0 .18.015.225.06.046.03.082.106.082.18 0 .077-.035.15-.08.18-.06.053-.15.07-.277.07zM0 0v10.096L.81 8.22h1.75l.225.464V8.22h2.043l.45 1.02.437-1.013h6.502c.295 0 .56.057.756.236v-.23h1.787v.23c.307-.17.686-.23 1.12-.23h2.606l.24.466v-.466h1.918l.254.465v-.466h1.858v3.948H20.87l-.36-.6v.585h-2.353l-.256-.63h-.583l-.27.614h-1.213c-.48 0-.84-.104-1.08-.24v.24h-2.89v-.884c0-.12-.03-.12-.105-.135h-.105v1.036H6.067v-.48l-.21.48H4.69l-.202-.48v.465H2.235l-.256-.624H1.4l-.256.624H0V24h23.786v-7.108c-.27.135-.613.18-.973.18H21.09v-.255c-.21.165-.57.255-.914.255H14.71v-.9c0-.12-.018-.12-.12-.12h-.075v1.022h-1.8v-1.066c-.298.136-.643.15-.928.136h-.214v.915h-2.18l-.54-.617-.57.6H4.742v-3.93h3.61l.518.602.554-.6h2.412c.28 0 .74.03.942.225v-.24h2.177c.202 0 .644.045.903.225v-.24h3.265v.24c.163-.164.508-.24.803-.24h1.89v.24c.194-.15.464-.24.84-.24h1.176V0H0zM21.156 14.955c.004.005.006.012.01.016.01.01.024.01.032.02l-.042-.035zM23.828 13.082h.065v.555h-.065zM23.865 15.03v-.005c-.03-.025-.046-.048-.075-.07-.15-.153-.39-.215-.764-.225l-.36-.012c-.12 0-.194-.007-.27-.03-.09-.03-.15-.105-.15-.21 0-.09.03-.16.09-.204.076-.045.15-.05.27-.05h1.223v-.588h-1.283c-.69 0-.96.437-.96.84 0 .9.78.855 1.41.87.104 0 .18.015.224.06.046.03.076.106.076.18 0 .07-.034.138-.09.18-.045.056-.136.07-.27.07h-1.288v.605h1.287c.42 0 .734-.118.9-.36h.03c.09-.134.135-.3.135-.523 0-.24-.045-.39-.135-.526zM18.597 14.208v-.583h-2.235V16.458h2.235v-.585h-1.57v-.57h1.533v-.584h-1.532v-.51M13.51 8.787h.685V11.6h-.684zM13.126 9.543l-.007.006c0-.314-.13-.5-.34-.624-.217-.125-.47-.135-.81-.135H10.43v2.82h.674v-1.034h.72c.24 0 .39.03.487.12.122.136.107.378.107.548v.354h.677v-.553c0-.25-.016-.375-.11-.516-.09-.107-.202-.19-.33-.237.172-.07.472-.3.472-.75zm-.855.396h-.015c-.09.054-.195.056-.33.056H11.1v-.623h.825c.12 0 .24.004.33.05.09.04.15.128.15.25s-.047.22-.134.266zM15.92 9.373h.632v-.6h-.644c-.464 0-.804.105-1.02.33-.286.3-.362.69-.362 1.11 0 .512.123.833.36 1.074.232.238.645.31.97.31h.78l.255-.627h1.39l.262.627h1.36v-2.11l1.272 2.11h.95l.002.002V8.786h-.684v1.963l-1.18-1.96h-1.02V11.4L18.11 8.744h-1.004l-.943 2.22h-.3c-.177 0-.362-.03-.468-.134-.125-.15-.186-.36-.186-.662 0-.285.08-.51.194-.63.133-.135.272-.165.516-.165zm1.668-.108l.464 1.118v.002h-.93l.466-1.12zM2.38 10.97l.254.628H4V9.393l.972 2.205h.584l.973-2.202.015 2.202h.69v-2.81H6.118l-.807 1.904-.876-1.905H3.343v2.663L2.205 8.787h-.997L.01 11.597h.72l.26-.626h1.39zm-.688-1.705l.46 1.118-.003.002h-.915l.457-1.12zM11.856 13.62H9.714l-.85.923-.825-.922H5.346v2.82H8l.855-.932.824.93h1.302v-.94h.838c.6 0 1.17-.164 1.17-.945l-.006-.003c0-.78-.598-.93-1.128-.93zM7.67 15.853l-.014-.002H6.02v-.557h1.47v-.574H6.02v-.51H7.7l.733.82-.764.824zm2.642.33l-1.03-1.147 1.03-1.108v2.253zm1.553-1.258h-.885v-.717h.885c.24 0 .42.098.42.344 0 .243-.15.372-.42.372zM9.967 9.373v-.586H7.73V11.6h2.237v-.58H8.4v-.564h1.527V9.88H8.4v-.507"/></svg>
                                                        </div>
                                                        <div className="mp-footer-note">
                                                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>
                                                            <div className="mp-footer-text">
                                                                <strong>Te llevaremos a Mercado Pago</strong>
                                                                <span>Si no tienes una cuenta, puedes usar tu e-mail.</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* ADDI */}
                                        <div className={`payment-method-box ${form.payment_method === 'addi' ? 'active' : ''}`}>
                                            <label className="payment-method-header">
                                                <input
                                                    type="radio"
                                                    name="payment"
                                                    value="addi"
                                                    checked={form.payment_method === 'addi'}
                                                    onChange={() => set('payment_method', 'addi')}
                                                />
                                                <span className="payment-method-title">PAGA CON ADDI</span>
                                                <span className="addi-text-logo addi-blue" style={{fontWeight: 'bold', fontSize:'16px'}}>Addi</span>
                                            </label>
                                            
                                            {form.payment_method === 'addi' && (
                                                <div className="payment-method-body addi-body">
                                                    <div className="addi-inner-box">
                                                        <div className="addi-header-blue">
                                                            <span className="addi-text-logo addi-white">Addi</span>
                                                            <span>Compra como tú prefieres</span>
                                                        </div>
                                                        <div className="addi-content">
                                                            <p className="addi-subtitle">Con Addi tienes más formas de pagar.</p>
                                                            <div className="addi-option">
                                                                <div className="addi-option-header">
                                                                    <strong>Crédito</strong>
                                                                    <div className="addi-icon-circle">↺</div>
                                                                </div>
                                                                <p>Sólo necesitas tu cédula y WhatsApp para pagar en cuotas.</p>
                                                            </div>
                                                            <div className="addi-option">
                                                                <div className="addi-option-header">
                                                                    <strong>Débito con PSE</strong>
                                                                    <strong style={{color:'#111', fontSize:'0.9rem'}}>pse</strong>
                                                                </div>
                                                                <p>Sólo debes tener una cuenta bancaria, Nequi o Daviplata para comprar.</p>
                                                            </div>
                                                        </div>
                                                        <div className="addi-footer-note">
                                                            Haz clic en el botón principal para finalizar el pago.
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* EL BOTÓN DE PAGO AL FINAL DEL PASO 3 */}
                                    <button 
                                        className="btn-solid-green"
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        style={{ marginTop: '30px' }}
                                    >
                                        {form.payment_method === 'mercadopago' ? 'PAGAR CON MERCADO PAGO' : 'FINALIZAR CON ADDI'}
                                    </button>

                                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                                        <button type="button" className="btn-back" onClick={() => setStep(2)}>
                                            &larr; VOLVER A OPCIONES DE ENVÍO
                                        </button>
                                    </div>
                                </section>
                            )}
                        </div> {/* Fin Encapsulamiento */}

                        {/* 7. SEÑALES DE CONFIANZA */}
                        <div className="trust-badges-container">
                            <hr className="trust-line" />
                            <p className="trust-text">TRANSACCIÓN PROTEGIDA</p>
                            <div className="trust-logos">
                                <svg role="img" viewBox="0 0 24 24" width="32" height="32" fill="#1434CB"><path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"/></svg>
                                <svg role="img" viewBox="0 0 24 24" width="32" height="32" fill="#EB001B"><path d="M11.343 18.031c.058.049.12.098.181.146-1.177.783-2.59 1.238-4.107 1.238C3.32 19.416 0 16.096 0 12c0-4.095 3.32-7.416 7.416-7.416 1.518 0 2.931.456 4.105 1.238-.06.051-.12.098-.165.15C9.6 7.489 8.595 9.688 8.595 12c0 2.311 1.001 4.51 2.748 6.031zm5.241-13.447c-1.52 0-2.931.456-4.105 1.238.06.051.12.098.165.15C14.4 7.489 15.405 9.688 15.405 12c0 2.31-1.001 4.507-2.748 6.031-.058.049-.12.098-.181.146 1.177.783 2.588 1.238 4.107 1.238C20.68 19.416 24 16.096 24 12c0-4.094-3.32-7.416-7.416-7.416zM12 6.174c-.096.075-.189.15-.28.231C10.156 7.764 9.169 9.765 9.169 12c0 2.236.987 4.236 2.551 5.595.09.08.185.158.28.232.096-.074.189-.152.28-.232 1.563-1.359 2.551-3.359 2.551-5.595 0-2.235-.987-4.236-2.551-5.595-.09-.08-.184-.156-.28-.231z"/></svg>
                                <img src="/images/checkout/mp.png" alt="Mercado Pago" style={{ height: '24px', objectFit: 'contain' }} />
                                <span className="addi-text-logo" style={{ fontSize: '18px', fontWeight: 'bold', color: '#00D1FF', letterSpacing: '-1px', marginLeft: '10px' }}>Addi</span>
                            </div>
                        </div>

                    </div>

                    {/* COLUMNA DERECHA — Resumen y Métodos de Pago */}
                    <div className="checkout-summary-col">
                        <div className="checkout-summary">
                            <h2 className="summary-title">TU PEDIDO</h2>

                            {/* Listado Visual de Productos */}
                            <div className="checkout-summary-items">
                                {items.map((item, idx) => (
                                    <div key={`${item.id}-${idx}`} className="checkout-summary-item">
                                        <div className="checkout-item-image">
                                            {item.image ? (
                                                <img src={item.image} alt={item.name} />
                                            ) : (
                                                <div className="checkout-item-placeholder" />
                                            )}
                                            <span className="checkout-item-qty">{item.quantity}</span>
                                        </div>
                                        <div className="checkout-item-details">
                                            <span className="checkout-item-name">{item.name}</span>
                                            {item.color && (
                                                <span className="checkout-item-attr">Color: {item.color}</span>
                                            )}
                                            {item.size && (
                                                <span className="checkout-item-attr">Talla: {item.size}</span>
                                            )}
                                        </div>
                                        <div className="checkout-item-price">
                                            {fmt(item.price * item.quantity)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Totales Arriba */}
                            <div className="summary-totals">
                                <div className="summary-row">
                                    <span>SUBTOTAL</span>
                                    <span>{fmt(subtotal)}</span>
                                </div>
                                {discount > 0 && (
                                    <div className="summary-row" style={{ color: '#d9534f' }}>
                                        <span>Descuento Combo -25%</span>
                                        <span>-{fmt(discount)}</span>
                                    </div>
                                )}
                                {sweater2x1Discount > 0 && (
                                    <div className="summary-row" style={{ color: '#d9534f' }}>
                                        <span>🎁 2x1 Suéter Escalera</span>
                                        <span>-{fmt(sweater2x1Discount)}</span>
                                    </div>
                                )}
                                <div className="summary-row">
                                    <span>ENVÍO</span>
                                    {shippingCost === 0 ? (
                                        <span className="free-shipping">ENVÍO GRATUITO</span>
                                    ) : (
                                        <span className="cost-shipping">{fmt(shippingCost)}</span>
                                    )}
                                </div>
                                {shippingCost > 0 && (
                                    <div className="shipping-threshold-notice">
                                        Agrega {fmt(FREE_SHIPPING_THRESHOLD - discountedSubtotal)} más para envío gratis
                                    </div>
                                )}
                                <div className="summary-row summary-total-row">
                                    <span>TOTAL</span>
                                    <div className="total-stack">
                                        <span className="total-amount">{fmt(total)}</span>
                                        <span className="tax-info">(incluye {fmt(total * 0.19)} Impuestos)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Eliminar el botón aquí */}

                            {/* Error servidor */}
                            {serverError && (
                                <div className="server-error">{serverError}</div>
                            )}

                        </div>
                    </div>
                </div>
            </div>

            {/* Modal Premium de Procesamiento */}
            {submitting && (
              <div style={{
                position: 'fixed', inset: 0, top: 0, left: 0, right: 0, bottom: 0,
                width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                zIndex: 100000
              }}>
                <div style={{
                  backgroundColor: '#fff', borderRadius: '16px',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                  padding: '32px', maxWidth: '384px', width: 'calc(100% - 32px)',
                  textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}>
                  <div style={{ width: '80px', height: '80px', position: 'relative', marginBottom: '24px' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid #f3f4f6' }}></div>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid #0b4b3b', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }}></div>
                    <svg style={{ position: 'absolute', inset: 0, margin: 'auto', width: '32px', height: '32px', color: '#0b4b3b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111', marginBottom: '8px' }}>Procesando tu compra...</h3>
                  <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' }}>
                    Por favor no cierres esta ventana. Estamos preparando tu conexión segura con <strong style={{ color: '#000' }}>{form.payment_method === 'addi' ? 'Addi' : 'Mercado Pago'}</strong>.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: '#15803d', backgroundColor: '#f0fdf4', padding: '10px 16px', borderRadius: '8px', width: '100%' }}>
                    <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Conexión Segura Encriptada
                  </div>
                </div>
              </div>
            )}

            <style>{`
                .checkout-coupon-bar {
                    background-color: #155338;
                    color: #fff;
                    padding: 1rem 40px;
                    cursor: pointer;
                    font-family: var(--font-titles, 'Antonio', sans-serif);
                    font-size: 0.95rem;
                    letter-spacing: 1px;
                }
                .coupon-bar-content {
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .coupon-bar-content u {
                    text-decoration: underline;
                    text-underline-offset: 4px;
                }

                .coupon-form-container {
                    max-width: 1200px;
                    margin: 0 auto 30px;
                    padding: 20px;
                    border: 1px solid #e0e0e0;
                    border-top: 3px solid var(--color-green, #155338);
                    background: #fdfdfd;
                    font-family: var(--font-paragraphs, sans-serif);
                }
                .coupon-form-container p {
                    margin-bottom: 15px;
                    color: #555;
                    font-size: 0.9rem;
                }
                .coupon-input-group {
                    display: flex;
                    gap: 15px;
                }
                .coupon-input-group input {
                    flex: 1;
                    max-width: 300px;
                    height: 44px;
                    padding: 0 15px;
                    border: 1px solid #ccc;
                    outline: none;
                }
                .coupon-input-group button {
                    background: var(--color-green, #155338);
                    color: #fff;
                    border: none;
                    padding: 0 25px;
                    font-family: var(--font-titles, sans-serif);
                    font-weight: 700;
                    cursor: pointer;
                    letter-spacing: 1px;
                }

                .checkout-page {
                    --green: var(--color-green, #155338);
                    --beige: var(--color-beige, #B1915F);
                    --black: var(--color-black, #121212);
                    --gray:  #888;
                    --line:  #f0f0f0;
                    --error: #c0392b;
                    font-family: var(--font-paragraphs, 'Helvetica', sans-serif);
                    background: #fff;
                    min-height: 60vh;
                    padding-top: 80px !important;
                    padding-bottom: 60px;
                }

                .checkout-title-bar {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 40px 0 20px;
                }
                .checkout-title-bar h1 {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.25rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: var(--green);
                    margin: 0;
                    letter-spacing: 1px;
                }

                .checkout-layout {
                    display: grid;
                    grid-template-columns: 1fr 380px;
                    gap: 50px;
                    max-width: 1200px;
                    margin: 0 auto;
                    align-items: start;
                }

                /* Encapsulamiento Alta Costura */
                .checkout-step-container {
                    background: #fff;
                    border: 1px solid #f0f0f0;
                    padding: 40px;
                    border-radius: 8px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.02);
                }

                /* Secciones del formulario */
                .checkout-section {
                    margin-bottom: 20px;
                    padding-bottom: 20px;
                }
                .no-border { border-bottom: none; }

                /* Campos */
                .fields-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0 20px;
                }

                .field {
                    margin-bottom: 20px;
                }
                .field label {
                    display: block;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    color: #1a1a1a;
                    margin-bottom: 8px;
                }
                .required { color: var(--error); }

                .field input,
                .checkout-page textarea,
                .checkout-select {
                    width: 100%;
                    height: 48px;
                    padding: 15px;
                    border: 1px solid #e0e0e0;
                    background: #fff;
                    font-size: 0.95rem;
                    font-family: inherit;
                    outline: none;
                    transition: border-color 0.3s ease;
                    box-sizing: border-box;
                    border-radius: 4px;
                }
                .field input:focus,
                .checkout-page textarea:focus,
                .checkout-select:focus { 
                    border-color: #155338; 
                }

                .checkout-page textarea {
                    height: auto;
                    padding: 12px;
                    resize: vertical;
                }

                .field-error input { border-color: var(--error); }
                .error-msg {
                    display: block;
                    font-size: 0.75rem;
                    color: var(--error);
                    margin-top: 5px;
                }

                /* Checkbox de Envío Diferente */
                .checkbox-different-address {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                    font-size: 0.95rem;
                    color: #1a1a1a;
                    margin-top: 30px;
                    font-family: var(--font-paragraphs, sans-serif);
                }
                .checkbox-different-address input {
                    width: 18px;
                    height: 18px;
                    accent-color: var(--green);
                }

                .shipping-section {
                    margin-top: 20px;
                    animation: fadeIn 0.3s ease;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* ── COLUMNA DERECHA — Resumen ────────── */
                .checkout-summary-col {
                    position: sticky;
                    top: 150px;
                }
                .checkout-summary {
                    background: #fafafa;
                    padding: 30px;
                    border-radius: 8px;
                    border: 1px solid #f0f0f0;
                }
                .summary-title {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #555;
                    margin: 0 0 20px 0;
                    letter-spacing: 1px;
                }

                /* Totales */
                .summary-totals { 
                    margin-bottom: 30px; 
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 0;
                    border-bottom: 1px solid #eaeaec;
                }
                .summary-row span:first-child {
                    font-family: var(--font-titles, sans-serif);
                    text-transform: uppercase;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: #666;
                }
                .summary-row span:last-child {
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.9rem;
                    color: var(--black);
                }
                .free-shipping { color: var(--green) !important; font-weight: 600; }
                .cost-shipping { color: #1a1a1a !important; }
                
                .summary-total-row {
                    border-bottom: none !important;
                    padding-top: 20px !important;
                }
                .summary-total-row span:first-child {
                    font-size: 1.1rem !important;
                }
                .total-stack { text-align: right; }
                .total-amount {
                    display: block;
                    font-size: 1.4rem !important;
                    font-weight: 700 !important;
                    color: var(--beige) !important;
                }
                .tax-info {
                    display: block;
                    font-size: 0.7rem !important;
                    color: var(--black) !important;
                    margin-top: 4px;
                }

                /* ── ACORDEONES DE PAGO ────────── */
                .payment-methods-accordion {
                    margin-bottom: 25px;
                }
                .payment-method-box {
                    border: 1px solid var(--line);
                    margin-bottom: 10px;
                    background: #fff;
                }
                .payment-method-box.active {
                    background: #fafafa;
                }

                .payment-method-header {
                    display: flex;
                    align-items: center;
                    padding: 18px 20px;
                    cursor: pointer;
                    gap: 15px;
                }
                .payment-method-header input[type="radio"] {
                    accent-color: var(--green);
                    width: 16px;
                    height: 16px;
                }
                .payment-method-title {
                    font-family: var(--font-titles, sans-serif);
                    font-weight: 700;
                    font-size: 0.95rem;
                    color: var(--black);
                    flex: 1;
                }
                .pm-logo {
                    height: 24px;
                    object-fit: contain;
                }
                .addi-text-logo {
                    font-size: 1.4rem;
                    font-weight: 900;
                    font-style: italic;
                    letter-spacing: -0.5px;
                }
                .addi-blue { color: #1165f1; }
                .addi-white { color: #ffffff; }

                /* CUERPO MERCADO PAGO */
                .payment-method-body {
                    padding: 0 20px 20px 48px; /* Indentado al nivel del texto */
                }
                .mp-inner-box {
                    background: #fff;
                    border: 1px dashed #ccc;
                    padding: 20px;
                }
                .mp-inner-box h4 {
                    margin: 0 0 15px 0;
                    font-size: 0.85rem;
                    font-family: var(--font-titles, sans-serif);
                    letter-spacing: 0.5px;
                }
                .mp-features {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 15px;
                }
                .mp-feature {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    font-size: 0.8rem;
                    color: #555;
                    line-height: 1.4;
                }
                .mp-feature svg {
                    width: 18px;
                    height: 18px;
                    flex-shrink: 0;
                    color: #444;
                }
                .mp-cards-icons {
                    display: flex;
                    gap: 15px;
                    margin-bottom: 20px;
                    align-items: center;
                }
                .mp-cards-icons svg {
                    height: 28px;
                    width: auto;
                }
                .mp-footer-note {
                    background: #f4f4f4;
                    padding: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-radius: 4px;
                }
                .mp-footer-note svg {
                    width: 24px;
                    height: 24px;
                    color: #999;
                }
                .mp-footer-text strong {
                    display: block;
                    font-size: 0.8rem;
                    color: #333;
                }
                .mp-footer-text span {
                    font-size: 0.75rem;
                    color: #777;
                }

                /* CUERPO ADDI */
                .addi-body {
                    padding: 0 20px 20px 20px;
                }
                .addi-inner-box {
                    background: #1165f1; /* Addi Blue */
                    border-radius: 8px;
                    overflow: hidden;
                    color: #fff;
                }
                .addi-header-blue {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px;
                    background: rgba(255,255,255,0.1);
                }
                .addi-header-blue img {
                    height: 24px;
                }
                .addi-header-blue span {
                    font-size: 0.8rem;
                    font-weight: 600;
                }
                .addi-content {
                    padding: 20px;
                }
                .addi-subtitle {
                    font-size: 0.85rem;
                    margin: 0 0 15px 0;
                }
                .addi-option {
                    background: #fff;
                    color: #333;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 12px;
                }
                .addi-option-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .addi-option-header strong {
                    color: #1165f1;
                    font-size: 0.95rem;
                }
                .addi-icon-circle {
                    width: 24px;
                    height: 24px;
                    background: #eef4ff;
                    color: #1165f1;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                }
                .addi-option p {
                    margin: 0;
                    font-size: 0.8rem;
                    color: #666;
                }
                .addi-footer-note {
                    background: #fff;
                    color: #1165f1;
                    text-align: center;
                    padding: 15px;
                    font-weight: 600;
                    font-size: 0.85rem;
                }

                /* Botón de Enviar */
                .btn-place-order {
                    width: 100%;
                    padding: 1.2rem;
                    background: var(--green);
                    color: #fff;
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.1rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .btn-place-order:hover:not(:disabled) {
                    background: var(--beige);
                    transform: translateY(-2px);
                }
                .btn-place-order:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .server-error {
                    padding: 12px 16px;
                    background: #fdf0f0;
                    border: 1px solid #f5c6c6;
                    color: var(--error);
                    font-size: 0.85rem;
                    margin-top: 16px;
                }

                /* ── MOBILE ≤ 768px ──────────────────────── */
                @media (max-width: 768px) {
                    .checkout-coupon-bar { padding: 1rem 15px; }
                    .checkout-title-bar { padding: 30px 15px 10px; }
                    
                    .checkout-layout {
                        grid-template-columns: 1fr;
                        gap: 40px;
                        padding: 0 15px 40px;
                    }
                    .fields-grid {
                        grid-template-columns: 1fr;
                        gap: 0;
                    }
                    .checkout-summary-col {
                        position: static;
                        padding: 20px;
                    }
                    .payment-method-body {
                        padding: 0 15px 15px 15px;
                    }
                    .payment-method-desc p {
                    margin: 0;
                }
                } /* Cierre de @media (max-width: 768px) */

                /* --- NUEVOS ESTILOS: LISTADO DE PRODUCTOS EN RESUMEN --- */
                .checkout-summary-items {
                    margin-bottom: 24px;
                    border-bottom: 1px solid #e0e0e0;
                    padding-bottom: 16px;
                }
                .checkout-summary-item {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 16px;
                }
                .checkout-summary-item:last-child {
                    margin-bottom: 0;
                }
                .checkout-item-image {
                    position: relative;
                    width: 64px;
                    height: 64px;
                    flex-shrink: 0;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    background: #f9f9f9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .checkout-item-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 6px;
                }
                .checkout-item-placeholder {
                    width: 100%;
                    height: 100%;
                    background: #e0e0e0;
                    border-radius: 6px;
                }
                .checkout-item-qty {
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    background: #0b1512;
                    color: #fff;
                    font-size: 11px;
                    font-weight: 600;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                .checkout-item-details {
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .checkout-item-name {
                    font-size: 0.9rem;
                    color: #1a1a1a;
                    font-weight: 500;
                    line-height: 1.3;
                }
                .checkout-item-attr {
                    font-size: 0.8rem;
                    color: #666;
                }
                .checkout-item-price {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #333;
                    flex-shrink: 0;
                }

                /* --- DISEÑO EDITORIAL: TIMELINE DINÁMICO --- */
                .checkout-timeline {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 0 !important;
                    padding: 0 20px;
                }
                .timeline-step {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    position: relative;
                    z-index: 2;
                }
                .timeline-circle {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #f0f0f0;
                    color: #aaa;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    transition: all 0.3s ease;
                }
                .timeline-label {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #aaa;
                    font-weight: 600;
                    transition: all 0.3s ease;
                }
                .timeline-step.active .timeline-circle {
                    background: #155338;
                    color: #fff;
                    transform: scale(1.3);
                    box-shadow: 0 4px 10px rgba(21, 83, 56, 0.3);
                }
                .timeline-step.active .timeline-label {
                    color: #155338;
                    font-size: 13px;
                    font-weight: 800;
                    transform: translateY(4px);
                }
                .timeline-line {
                    flex: 1;
                    height: 1px;
                    background: #f0f0f0;
                    margin: 0 15px;
                    transform: translateY(-10px);
                    transition: all 0.3s ease;
                }
                .timeline-line.active {
                    background: #155338;
                }

                .checkout-step-container {
                    background: #fff;
                    border: 1px solid #f0f0f0;
                    padding: 20px 40px 30px !important;
                    margin-top: 0 !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.02);
                    border-radius: 8px;
                }
                .checkout-step-container h2, .checkout-step-container h3 {
                    margin-top: 0 !important;
                    padding-top: 0 !important;
                }
                .checkout-section {
                    padding-top: 0 !important;
                    margin-bottom: 20px;
                    padding-bottom: 20px;
                }

                .standard-label {
                    display: block;
                    text-transform: uppercase;
                    font-size: 10px !important;
                    font-weight: 600 !important;
                    color: #888 !important;
                    margin-bottom: 6px;
                    letter-spacing: 0.5px;
                }

                .field-input, .checkout-select, .field input {
                    width: 100%;
                    background: #fff;
                    border: 1px solid #e0e0e0;
                    padding: 15px;
                    border-radius: 4px;
                    transition: border-color 0.3s ease;
                    font-size: 1rem;
                    color: #333;
                }

                .field-input:focus, .checkout-select:focus, .field input:focus {
                    border-color: #155338;
                    outline: none;
                }


                /* Botones de Acción */
                .btn-solid-green {
                    background-color: #155338 !important;
                    color: #fff !important;
                    width: 100%;
                    padding: 16px !important;
                    font-size: 0.9rem !important;
                    letter-spacing: 1px !important;
                    border-radius: 4px !important;
                    text-transform: uppercase;
                    font-weight: 700;
                    border: none;
                    cursor: pointer;
                    transition: opacity 0.3s;
                }
                .btn-solid-green:hover {
                    opacity: 0.9;
                }
                .btn-back {
                    background: transparent;
                    color: #888;
                    border: none;
                    text-decoration: underline;
                    cursor: pointer;
                    font-weight: 600;
                    padding: 15px 0;
                    text-transform: uppercase;
                    font-size: 11px;
                    letter-spacing: 1px;
                }

                /* Señales de Confianza */
                .trust-badges-container {
                    margin-top: 40px;
                    text-align: center;
                }
                .trust-line {
                    border: 0;
                    height: 1px;
                    background: #f0f0f0;
                    margin-bottom: 20px;
                }
                .trust-text {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #888;
                    margin-bottom: 20px;
                    font-weight: 600;
                }
                .trust-logos {
                    display: flex;
                    justify-content: center;
                    gap: 25px;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .trust-logos svg, .trust-logos img {
                    filter: grayscale(100%);
                    opacity: 0.6;
                    transition: all 0.3s ease;
                    height: 32px;
                    object-fit: contain;
                }
                .trust-logos .addi-text-logo {
                    filter: grayscale(100%);
                    opacity: 0.6;
                    transition: all 0.3s ease;
                }
                .trust-logos:hover svg, .trust-logos:hover img, .trust-logos:hover .addi-text-logo {
                    filter: grayscale(0%);
                    opacity: 1;
                }

                /* Grid especial para el Documento (30% - 70%) */
                .document-grid {
                    display: grid;
                    grid-template-columns: 30% 70%;
                    gap: 15px;
                    margin-bottom: 20px;
                }

                .step-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 30px;
                    gap: 15px;
                }

                @media (max-width: 768px) {
                    .checkout-layout {
                        display: flex !important;
                        flex-direction: column !important;
                    }
                    .checkout-summary-col {
                        order: 1 !important;
                        margin-bottom: 30px;
                        width: 100%;
                    }
                    .checkout-form-col {
                        order: 2 !important;
                        width: 100%;
                    }
                    .checkout-step-container {
                        padding: 20px;
                    }
                    .step-actions {
                        flex-direction: column-reverse;
                    }
                    .step-actions .btn-solid-green {
                        width: 100% !important;
                    }
                }
            `}</style>
        </>
    );
}
