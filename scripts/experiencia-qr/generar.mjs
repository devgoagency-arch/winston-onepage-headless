// Genera los QR de /experiencia en docs/experiencia/qr y comprueba que se leen.
// Uso: cd scripts/experiencia-qr && npm install && npm run generar
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { Potrace } from 'potrace';
import QRCode from 'qrcode';
import sharp from 'sharp';

const BASE = 'https://www.winstonandharrystore.com/experiencia';
// Mismos `id` de TIENDAS en src/config/experiencia.ts.
const TIENDAS = ['unicentro', 'retiro', 'santa_barbara', 'palatino'];
const LADO_PNG = 3000;
const LADO_PDF_MM = 40;
const ZONA_SEGURA = 4; // módulos, el mínimo del estándar
const HUECO_SIMBOLO = 13; // módulos libres al centro: ~10 % del área, dentro del margen de la corrección H
const LADO_SIMBOLO = 11.4; // módulos
const ORO = '#B1915F';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const salida = join(raiz, 'docs', 'experiencia', 'qr');
mkdirSync(salida, { recursive: true });

// Símbolo del logo: se traza a vector desde el favicon para no depender de su resolución.
const LADO_TRAZO = 1440;
const mascara = await sharp(join(raiz, 'public', 'favicon.png'))
    .extractChannel('alpha')
    .resize(LADO_TRAZO, LADO_TRAZO, { kernel: 'cubic' })
    .blur(3)
    .threshold(128)
    .negate()
    .png()
    .toBuffer();
const trazo = new Potrace({ turdSize: 20, optTolerance: 0.4 });
await new Promise((ok, mal) => trazo.loadImage(mascara, (error) => (error ? mal(error) : ok())));
const dSimbolo = trazo.getPathTag().match(/ d="([^"]+)"/)[1];

async function generar({ carpeta, nombre, archivoNfc, URL_QR, URL_NFC }) {
    mkdirSync(carpeta, { recursive: true });
    const qr = QRCode.create(URL_QR, { errorCorrectionLevel: 'H' });
    const { size, data } = qr.modules;
    const total = size + ZONA_SEGURA * 2;
    const inicioHueco = (size - HUECO_SIMBOLO) / 2;
    const enHueco = (v) => v >= inicioHueco && v < inicioHueco + HUECO_SIMBOLO;
    const modulos = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (data[y * size + x] && !(enHueco(x) && enHueco(y))) modulos.push([x + ZONA_SEGURA, y + ZONA_SEGURA]);
        }
    }

    const escalaSimbolo = LADO_SIMBOLO / LADO_TRAZO;
    const inicioSimbolo = (total - LADO_SIMBOLO) / 2;

    // SVG vectorial: negro sobre blanco, con el símbolo al centro.
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}">` +
        `<rect width="${total}" height="${total}" fill="#fff"/>` +
        `<path fill="#000" shape-rendering="crispEdges" d="${modulos.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')}"/>` +
        `<path fill="${ORO}" fill-rule="evenodd" transform="translate(${inicioSimbolo} ${inicioSimbolo}) scale(${escalaSimbolo})" d="${dSimbolo}"/></svg>\n`;
    writeFileSync(join(carpeta, `${nombre}.svg`), svg);

    // PNG: múltiplo exacto del módulo para que ningún borde quede difuso.
    const escala = Math.ceil(LADO_PNG / total);
    const ladoPng = escala * total;
    await sharp(Buffer.from(svg), { density: (72 * ladoPng) / total })
        .resize(ladoPng, ladoPng)
        .flatten({ background: '#fff' })
        .png()
        .toFile(join(carpeta, `${nombre}.png`));

    // PDF vectorial de impresión, con el lado final en milímetros.
    const puntos = (LADO_PDF_MM * 72) / 25.4;
    const m = puntos / total;
    const n = (v) => v.toFixed(4);
    const px = (x) => n((inicioSimbolo + x * escalaSimbolo) * m);
    const py = (y) => n(puntos - (inicioSimbolo + y * escalaSimbolo) * m);
    // potrace solo emite M, C, L y Z absolutos.
    const simboloPdf = dSimbolo
        .replace(/,/g, ' ')
        .match(/[MCLZ][^MCLZ]*/g)
        .map((tramo) => {
            const c = tramo.trim().split(/\s+/);
            const v = c.slice(1).map(Number);
            const pares = [];
            for (let i = 0; i < v.length; i += 2) pares.push(`${px(v[i])} ${py(v[i + 1])}`);
            if (c[0] === 'Z') return 'h';
            if (c[0] === 'M') return `${pares[0]} m`;
            if (c[0] === 'L') return pares.map((p) => `${p} l`).join('\n');
            const curvas = [];
            for (let i = 0; i < pares.length; i += 3) curvas.push(`${pares[i]} ${pares[i + 1]} ${pares[i + 2]} c`);
            return curvas.join('\n');
        })
        .join('\n');
    const contenido =
        `0 g\n` +
        modulos.map(([x, y]) => `${n(x * m)} ${n(puntos - (y + 1) * m)} ${n(m)} ${n(m)} re`).join('\n') +
        `\nf\n0.694 0.569 0.373 rg\n${simboloPdf}\nf*\n`;
    const objetos = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(puntos)} ${n(puntos)}] /Contents 4 0 R >>`,
        `<< /Length ${Buffer.byteLength(contenido)} >>\nstream\n${contenido}endstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const posiciones = objetos.map((objeto, i) => {
        const posicion = Buffer.byteLength(pdf);
        pdf += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
        return posicion;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    pdf += posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    writeFileSync(join(carpeta, `${nombre}-impresion.pdf`), pdf);

    writeFileSync(join(carpeta, archivoNfc), `${URL_NFC}\n`);

    // Lectura real del PNG a varios tamaños, como lo vería una cámara.
    for (const lado of [1000, 600, 300, 200]) {
        const { data: pixeles, info } = await sharp(join(carpeta, `${nombre}.png`))
            .resize(lado, lado)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const leido = jsQR(new Uint8ClampedArray(pixeles), info.width, info.height);
        if (leido?.data !== URL_QR) throw new Error(`El QR no se lee a ${lado} px: ${leido?.data}`);
    }

    console.log(`${nombre}: versión ${qr.version}, ${size}x${size} módulos, módulo a ${LADO_PDF_MM} mm: ${(LADO_PDF_MM / total).toFixed(2)} mm, leído a 1000/600/300/200 px.`);
}

// QR general (el de las cajas) y uno por tienda.
await generar({
    carpeta: salida,
    nombre: 'experiencia-qr',
    archivoNfc: 'experiencia-nfc-url.txt',
    URL_QR: `${BASE}?origen=qr`,
    URL_NFC: `${BASE}?origen=nfc`,
});
for (const tienda of TIENDAS) {
    await generar({
        carpeta: join(salida, 'tiendas', tienda),
        nombre: `experiencia-qr-${tienda}`,
        archivoNfc: `experiencia-nfc-${tienda}-url.txt`,
        URL_QR: `${BASE}?origen=qr&tienda=${tienda}`,
        URL_NFC: `${BASE}?origen=nfc&tienda=${tienda}`,
    });
}
