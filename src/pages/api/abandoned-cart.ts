/**
 * Digapp Commerce (Supabase) Abandoned Cart API Route (`/api/abandoned-cart`)
 *
 * Environment variables:
 * - `DIGAPP_COMMERCE_URL`: Supabase project URL (defaults to `https://oxmpgcqpsdgdrhecixgv.supabase.co`).
 * - `DIGAPP_COMMERCE_SERVICE_ROLE_KEY`: Server-only Supabase `service_role` key (required).
 * - `DIGAPP_TIENDA_SLUG`: Store identifier slug (defaults to `winston-harry`).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_WP_URL, wcFetch } from '../../lib/woocommerce';
import type { CartItem } from '../../store/cart';

const DEFAULT_DIGAPP_COMMERCE_URL = 'https://oxmpgcqpsdgdrhecixgv.supabase.co';
const DEFAULT_DIGAPP_TIENDA_SLUG = 'winston-harry';
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
    const rawBaseUrl =
        import.meta.env.DIGAPP_COMMERCE_URL ||
        (typeof process !== 'undefined' ? process.env.DIGAPP_COMMERCE_URL : undefined) ||
        DEFAULT_DIGAPP_COMMERCE_URL;
    const baseUrl = String(rawBaseUrl).trim().replace(/\/+$/, '');

    const serviceRoleKey =
        import.meta.env.DIGAPP_COMMERCE_SERVICE_ROLE_KEY ||
        (typeof process !== 'undefined' ? process.env.DIGAPP_COMMERCE_SERVICE_ROLE_KEY : undefined);

    if (!serviceRoleKey) {
        return new Response(
            JSON.stringify({ ok: false, error: 'DIGAPP_COMMERCE_SERVICE_ROLE_KEY is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const rawTiendaSlug =
        import.meta.env.DIGAPP_TIENDA_SLUG ||
        (typeof process !== 'undefined' ? process.env.DIGAPP_TIENDA_SLUG : undefined) ||
        DEFAULT_DIGAPP_TIENDA_SLUG;
    const tiendaSlug = String(rawTiendaSlug).trim() || DEFAULT_DIGAPP_TIENDA_SLUG;

    const rpcName = action === 'capture' ? 'carrito_upsert' : 'carrito_marcar_recuperado';
    const endpoint = `${baseUrl}/rest/v1/rpc/${rpcName}`;

    let rpcPayload: Record<string, unknown>;

    if (action === 'capture') {
        const validItems = items!;
        const recoveryUrl = buildRecoveryUrl(validItems);
        const restoreToken = recoveryUrl.slice(RECOVERY_BASE_URL.length) || null;
        const subtotal = validItems.reduce(
            (sum, i) => sum + (Number(i.price) || 0) * Math.max(1, Number(i.quantity) || 1),
            0
        );
        const metadata: Record<string, string> = {};
        if (firstname && firstname.trim()) {
            metadata.firstname = firstname.trim();
        }
        if (lastname && lastname.trim()) {
            metadata.lastname = lastname.trim();
        }

        rpcPayload = {
            p_tienda_slug: tiendaSlug,
            p_email: cleanEmail,
            p_telefono: phone && phone.trim() ? phone.trim() : null,
            p_items: validItems,
            p_total: Number.isFinite(subtotal) ? subtotal : null,
            p_moneda: 'COP',
            p_restore_url: recoveryUrl,
            p_restore_token: restoreToken,
            p_consentimiento: true,
            p_opt_in_wa: false,
            p_metadata: metadata,
        };
    } else {
        rpcPayload = {
            p_tienda_slug: tiendaSlug,
            p_email: cleanEmail,
            p_carrito_id: null,
        };
    }

    try {
        const rpcRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify(rpcPayload),
        });

        if (!rpcRes.ok) {
            const details = await rpcRes
                .json()
                .catch(async () => ({ raw: await rpcRes.text().catch(() => '') }));
            const status = rpcRes.status >= 400 && rpcRes.status < 600 ? rpcRes.status : 502;
            return new Response(
                JSON.stringify({
                    ok: false,
                    error: `Digapp Commerce RPC ${rpcName} error`,
                    details,
                }),
                {
                    status,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        const data = await rpcRes.json().catch(() => null);
        return new Response(JSON.stringify({ ok: true, data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({
                ok: false,
                error: `Failed to call Digapp Commerce RPC ${rpcName}`,
                details: err?.message || String(err),
            }),
            {
                status: 502,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
};
