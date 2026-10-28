/**
 * HubSpot Abandoned Cart API Route (`/api/abandoned-cart`)
 *
 * Environment variables:
 * - `HUBSPOT_ACCESS_TOKEN`: HubSpot Private App access token used to upsert
 *   abandoned-cart contact properties via CRM Contacts batch upsert.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_WP_URL, wcFetch } from '../../lib/woocommerce';
import type { CartItem } from '../../store/cart';

const HUBSPOT_CONTACTS_BATCH_UPSERT_URL =
    'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert';
const RECOVERY_BASE_URL = 'https://www.winstonandharrystore.com/checkout?restore=';

interface AbandonedCartRequestBody {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    items?: Partial<CartItem>[];
    action?: 'capture' | 'clear';
}

interface ParsedRestoreItem {
    id: number;
    quantity: number;
    color: string | null;
    size: string | null;
}

interface CatalogEntry {
    id: number;
    product_id: number;
    name: string;
    price: number;
    image: string;
    slug: string;
    color: string | null;
    size: string | null;
    categories: any[];
}

// Module-level cache of product/variation metadata loaded from public/data/products/*.json
let catalogIndexCache: Map<number, CatalogEntry> | null = null;

function isValidEmail(email: unknown): email is string {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizePayloadToken(val?: string | null): string {
    if (!val) return '';
    return String(val).trim().replace(/[:,]/g, '');
}

/**
 * Builds the compact restore payload and full recovery URL.
 * Format: comma-separated `id:qty` (or `id:qty:color:size` when color/size present).
 */
export function buildRecoveryUrl(items: Partial<CartItem>[]): string {
    const segments = items
        .filter((item) => item && item.id !== undefined && item.id !== null)
        .map((item) => {
            const id = Number(item.id);
            const qty = Math.max(1, Number(item.quantity) || 1);
            const color = sanitizePayloadToken(item.color);
            const size = sanitizePayloadToken(item.size);
            if (color || size) {
                return `${id}:${qty}:${color}:${size}`;
            }
            return `${id}:${qty}`;
        });

    return `${RECOVERY_BASE_URL}${encodeURIComponent(segments.join(','))}`;
}

/**
 * Parses a `?restore=` query string into deduplicated items.
 */
export function parseRestorePayload(rawPayload: string): ParsedRestoreItem[] {
    if (!rawPayload || typeof rawPayload !== 'string') return [];

    let decoded = rawPayload.trim();
    if (decoded.includes('%3A') || decoded.includes('%2C') || decoded.includes('%3a') || decoded.includes('%2c')) {
        try {
            decoded = decodeURIComponent(decoded);
        } catch (_) {
            // Keep raw string if malformed URI component
        }
    }

    const deduped = new Map<string, ParsedRestoreItem>();

    for (const part of decoded.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const [idRaw, qtyRaw, colorRaw, sizeRaw] = trimmed.split(':');
        const id = parseInt(idRaw, 10);
        if (!Number.isFinite(id) || id <= 0) continue;

        const quantity = Math.max(1, parseInt(qtyRaw || '1', 10) || 1);
        let color: string | null = null;
        let size: string | null = null;

        if (colorRaw && colorRaw.trim()) {
            try {
                color = decodeURIComponent(colorRaw.trim());
            } catch (_) {
                color = colorRaw.trim();
            }
        }
        if (sizeRaw && sizeRaw.trim()) {
            try {
                size = decodeURIComponent(sizeRaw.trim());
            } catch (_) {
                size = sizeRaw.trim();
            }
        }

        const key = `${id}:${(color || '').toLowerCase()}:${(size || '').toLowerCase()}`;
        deduped.set(key, { id, quantity, color, size });
    }

    return Array.from(deduped.values());
}

function getLocalCatalogIndex(): Map<number, CatalogEntry> {
    if (catalogIndexCache) return catalogIndexCache;

    const index = new Map<number, CatalogEntry>();
    try {
        const productsDir = path.join(process.cwd(), 'public', 'data', 'products');
        if (!fs.existsSync(productsDir)) {
            catalogIndexCache = index;
            return index;
        }

        const files = fs.readdirSync(productsDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(productsDir, file), 'utf-8');
                const p = JSON.parse(raw);
                if (!p || !p.id) continue;

                const minorUnit = Number(p.prices?.currency_minor_unit || 0);
                const basePrice = Number(p.prices?.price || 0) / Math.pow(10, minorUnit);
                const baseImage = p.images?.[0]?.src || '';
                const productId = Number(p.id);

                index.set(productId, {
                    id: productId,
                    product_id: productId,
                    name: p.name || `Producto #${productId}`,
                    price: Number.isFinite(basePrice) ? basePrice : 0,
                    image: baseImage,
                    slug: p.slug || '',
                    color: null,
                    size: null,
                    categories: Array.isArray(p.categories) ? p.categories : [],
                });

                if (Array.isArray(p.variations)) {
                    for (const v of p.variations) {
                        if (!v || !v.id) continue;
                        const varId = Number(v.id);
                        const colorAttr = v.attributes?.find((a: any) =>
                            String(a.name || a.id || '').toLowerCase().includes('color')
                        );
                        const sizeAttr = v.attributes?.find((a: any) =>
                            /talla|size|tamano|tamaño|numero|nmero/.test(
                                String(a.name || a.id || '').toLowerCase()
                            )
                        );
                        const varPrice = Number(v.price ?? basePrice ?? 0);

                        index.set(varId, {
                            id: varId,
                            product_id: productId,
                            name: p.name || `Producto #${varId}`,
                            price: Number.isFinite(varPrice) && varPrice > 0 ? varPrice : basePrice,
                            image: v.image?.src || baseImage,
                            slug: p.slug || '',
                            color: colorAttr?.value || colorAttr?.option || null,
                            size: sizeAttr?.value || sizeAttr?.option || null,
                            categories: Array.isArray(p.categories) ? p.categories : [],
                        });
                    }
                }
            } catch (_) {
                // Ignore malformed individual product JSON
            }
        }
    } catch (_) {
        // Ignore filesystem errors in environments without local public/data
    }

    catalogIndexCache = index;
    return index;
}

async function resolveRestoreItem(parsed: ParsedRestoreItem): Promise<CartItem> {
    const index = getLocalCatalogIndex();
    const localHit = index.get(parsed.id);

    if (localHit) {
        return {
            id: localHit.id,
            product_id: localHit.product_id,
            name: localHit.name,
            price: localHit.price,
            image: localHit.image,
            slug: localHit.slug,
            color: parsed.color || localHit.color || null,
            size: parsed.size || localHit.size || null,
            quantity: parsed.quantity,
            categories: localHit.categories,
        };
    }

    // Fallback 1: WooCommerce Public Store API
    try {
        const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/store/v1/products/${parsed.id}`, {
            signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
            const data = await res.json();
            const minorUnit = Number(data.prices?.currency_minor_unit || 0);
            const rawPrice = Number(data.prices?.price || 0) / Math.pow(10, minorUnit);
            const slugMatch = typeof data.permalink === 'string'
                ? data.permalink.match(/\/product\/([^/?#]+)/)
                : null;
            const colorAttr = data.attributes?.find((a: any) =>
                String(a.name || a.taxonomy || '').toLowerCase().includes('color')
            );
            const sizeAttr = data.attributes?.find((a: any) =>
                /talla|size|tamano|tamaño|numero/.test(String(a.name || a.taxonomy || '').toLowerCase())
            );

            return {
                id: Number(data.id) || parsed.id,
                product_id: Number(data.parent || data.id || parsed.id),
                name: (data.name || `Producto #${parsed.id}`).replace(/\s*[-–]\s*[^-–]+$/, ''),
                price: Number.isFinite(rawPrice) ? rawPrice : 0,
                image: data.images?.[0]?.src || '',
                slug: slugMatch?.[1] || data.slug || '',
                color: parsed.color || colorAttr?.value || colorAttr?.option || null,
                size: parsed.size || sizeAttr?.value || sizeAttr?.option || null,
                quantity: parsed.quantity,
                categories: Array.isArray(data.categories) ? data.categories : [],
            };
        }
    } catch (_) {
        // Continue to WC v3 fallback
    }

    // Fallback 2: WooCommerce REST API v3
    try {
        const v3Data = await wcFetch(`/products/${parsed.id}`);
        if (v3Data && v3Data.id) {
            const slugMatch = typeof v3Data.permalink === 'string'
                ? v3Data.permalink.match(/\/product\/([^/?#]+)/)
                : null;
            const colorAttr = v3Data.attributes?.find((a: any) =>
                String(a.name || a.slug || '').toLowerCase().includes('color')
            );
            const sizeAttr = v3Data.attributes?.find((a: any) =>
                /talla|size|tamano|tamaño|numero/.test(String(a.name || a.slug || '').toLowerCase())
            );

            return {
                id: Number(v3Data.id) || parsed.id,
                product_id: Number(v3Data.parent_id || v3Data.id || parsed.id),
                name: v3Data.name || `Producto #${parsed.id}`,
                price: Number(v3Data.price || v3Data.regular_price || 0),
                image: v3Data.image?.src || v3Data.images?.[0]?.src || '',
                slug: slugMatch?.[1] || v3Data.slug || '',
                color: parsed.color || colorAttr?.option || null,
                size: parsed.size || sizeAttr?.option || null,
                quantity: parsed.quantity,
                categories: Array.isArray(v3Data.categories) ? v3Data.categories : [],
            };
        }
    } catch (_) {
        // Fall through to minimal item
    }

    return {
        id: parsed.id,
        product_id: parsed.id,
        name: `Producto #${parsed.id}`,
        price: 0,
        image: '',
        slug: '',
        color: parsed.color,
        size: parsed.size,
        quantity: parsed.quantity,
        categories: [],
    };
}

export const GET: APIRoute = async ({ url }) => {
    const restoreParam = url.searchParams.get('restore') || '';
    const parsedItems = parseRestorePayload(restoreParam);

    if (parsedItems.length === 0) {
        return new Response(JSON.stringify({ ok: true, items: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const items = await Promise.all(parsedItems.map((item) => resolveRestoreItem(item)));
        return new Response(JSON.stringify({ ok: true, items }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Failed to hydrate restore items', details: err?.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};

export const POST: APIRoute = async ({ request }) => {
    let body: AbandonedCartRequestBody;
    try {
        body = await request.json();
    } catch (_) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { email, firstname, lastname, phone, items, action } = body || {};

    if (!isValidEmail(email)) {
        return new Response(JSON.stringify({ ok: false, error: 'Valid email is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (action !== 'capture' && action !== 'clear') {
        return new Response(
            JSON.stringify({ ok: false, error: "Invalid action; expected 'capture' or 'clear'" }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    if (action === 'capture' && (!Array.isArray(items) || items.length === 0)) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Non-empty items array is required for capture' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const cleanEmail = email.trim();
    const accessToken =
        import.meta.env.HUBSPOT_ACCESS_TOKEN ||
        (typeof process !== 'undefined' ? process.env.HUBSPOT_ACCESS_TOKEN : undefined);

    if (!accessToken) {
        return new Response(
            JSON.stringify({ ok: false, error: 'HubSpot access token is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const properties: Record<string, string> = {
        email: cleanEmail,
    };

    if (firstname && firstname.trim()) {
        properties.firstname = firstname.trim();
    }
    if (lastname && lastname.trim()) {
        properties.lastname = lastname.trim();
    }
    if (phone && phone.trim()) {
        properties.phone = phone.trim();
        properties.mobilephone = phone.trim();
    }

    if (action === 'capture') {
        const validItems = items!;
        const recoveryUrl = buildRecoveryUrl(validItems);
        const productNames = validItems
            .map((i) => (i.name ? String(i.name).trim() : `Producto #${i.id}`))
            .join(', ');
        const productsHtml = `<ul>${validItems
            .map((i) => {
                const name = escapeHtml(i.name ? String(i.name).trim() : `Producto #${i.id}`);
                const qty = Math.max(1, Number(i.quantity) || 1);
                const attrs = [i.color, i.size].filter(Boolean).map((a) => escapeHtml(String(a))).join(' / ');
                return `<li>${name}${attrs ? ` (${attrs})` : ''} x ${qty}</li>`;
            })
            .join('')}</ul>`;
        const productSkus = validItems.map((i) => String(i.id)).join(', ');
        const subtotal = validItems.reduce(
            (sum, i) => sum + (Number(i.price) || 0) * Math.max(1, Number(i.quantity) || 1),
            0
        );
        const totalCount = validItems.reduce(
            (sum, i) => sum + Math.max(1, Number(i.quantity) || 1),
            0
        );
        const cartDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        Object.assign(properties, {
            current_abandoned_cart: 'yes',
            abandoned_cart_url: recoveryUrl,
            abandoned_cart_products: productNames,
            abandoned_cart_products_html: productsHtml,
            abandoned_cart_products_skus: productSkus,
            abandoned_cart_subtotal: String(subtotal),
            abandoned_cart_total_value: String(subtotal),
            abandoned_cart_date: cartDate,
            abandoned_cart_counter: String(totalCount),
        });
    } else {
        Object.assign(properties, {
            current_abandoned_cart: 'no',
            abandoned_cart_url: '',
            abandoned_cart_products: '',
            abandoned_cart_products_html: '',
            abandoned_cart_products_skus: '',
            abandoned_cart_subtotal: '0',
            abandoned_cart_total_value: '0',
            abandoned_cart_counter: '0',
        });
    }

    const hsPayload = {
        inputs: [
            {
                idProperty: 'email',
                id: cleanEmail,
                properties,
            },
        ],
    };

    try {
        const hsRes = await fetch(HUBSPOT_CONTACTS_BATCH_UPSERT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(hsPayload),
        });

        if (!hsRes.ok) {
            const details = await hsRes
                .json()
                .catch(async () => ({ raw: await hsRes.text().catch(() => '') }));
            const status = hsRes.status >= 400 && hsRes.status < 600 ? hsRes.status : 502;
            return new Response(
                JSON.stringify({
                    ok: false,
                    error: 'HubSpot CRM batch upsert error',
                    details,
                }),
                {
                    status,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({
                ok: false,
                error: 'Failed to upsert contact via HubSpot CRM',
                details: err?.message || String(err),
            }),
            {
                status: 502,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
};
