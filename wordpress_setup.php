<?php
/**
 * Recommended way to include parent theme styles.
 * (Please see http://codex.wordpress.org/Child_Themes#How_to_Create_a_Child_Theme)
 *
 */  

// Cambiamos la prioridad a 999 para que sea de lo último en cargar
add_action( 'wp_enqueue_scripts', 'winston_and_harry_style', 999 );

function winston_and_harry_style() {
    // 1. Cargamos el estilo del tema padre (Storefront)
    wp_enqueue_style( 'parent-style', get_template_directory_uri() . '/style.css' );

    // 2. Cargamos tu estilo de Astro (Child Theme)
    wp_enqueue_style( 
        'child-style', 
        get_stylesheet_directory_uri() . '/style.css', 
        array('parent-style'), 
        time() 
    );

    // 3. Cargamos estilos específicos para el carrito
    if ( is_cart() ) {
        wp_enqueue_style( 
            'custom-cart-style', 
            get_stylesheet_directory_uri() . '/custom-cart-styles.css', 
            array('child-style'), 
            time() 
        );
    }

    // 4. Cargamos estilos específicos para el checkout
    if ( is_checkout() ) {
        wp_enqueue_style( 
            'custom-checkout-style', 
            get_stylesheet_directory_uri() . '/custom-checkout-styles.css', 
            array('child-style'), 
            time() 
        );
    }
}

// Envolver el formulario de checkout en un contenedor con clase .checkout-wrapper
add_action( 'woocommerce_before_checkout_form', 'wh_checkout_wrapper_start', 5 );
function wh_checkout_wrapper_start() {
    echo '<div class="checkout-wrapper">';
}

add_action( 'woocommerce_after_checkout_form', 'wh_checkout_wrapper_end', 30 );
function wh_checkout_wrapper_end() {
    echo '</div>';
}

function winston_and_harry_scripts() {
    // Encolar el JS de tu menú
    wp_enqueue_script( 
        'wh-navigation', 
        get_stylesheet_directory_uri() . '/js/main.js', 
        array(), // Si usas jQuery aquí pondrías array('jquery')
        time(),  // Versión basada en tiempo para evitar caché en desarrollo
        true     // Cargar en el footer
    );
}
add_action( 'wp_enqueue_scripts', 'winston_and_harry_scripts' );

add_action( 'wp_enqueue_scripts', function() {
    wp_enqueue_style( 'font-awesome', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css' );
});

add_action( 'wp_enqueue_scripts', function() {
    // Sustituye EL_ID_DE_TU_PROYECTO por el código de Adobe
    wp_enqueue_style( 'adobe-fonts', 'https://use.typekit.net/lpl0lgn.css' );
});

/**
 * Your code goes below.
 */
 
 
 add_action( 'init', 'remove_storefront_header_styles' );
function remove_storefront_header_styles() {
    remove_action( 'storefront_header', 'storefront_header_container', 0 );
    remove_action( 'storefront_header', 'storefront_skip_links', 5 );
    remove_action( 'storefront_header', 'storefront_site_branding', 20 );
    remove_action( 'storefront_header', 'storefront_secondary_navigation', 30 );
    remove_action( 'storefront_header', 'storefront_product_search', 40 );
    remove_action( 'storefront_header', 'storefront_header_container_close', 41 );
    remove_action( 'storefront_header', 'storefront_primary_navigation_wrapper', 42 );
    remove_action( 'storefront_header', 'storefront_primary_navigation', 50 );
    remove_action( 'storefront_header', 'storefront_header_cart', 60 );
    remove_action( 'storefront_header', 'storefront_primary_navigation_wrapper_close', 68 );
}

// Remover sidebar en páginas de WooCommerce para layout limpio
add_action( 'get_header', 'wh_remove_sidebars' );
function wh_remove_sidebars() {
    if ( is_checkout() || is_cart() ) {
        remove_action( 'storefront_sidebar', 'storefront_get_sidebar', 10 );
    }
}

// Forzar layout de ancho completo en Storefront
add_filter( 'body_class', 'wh_full_width_body_class' );
function wh_full_width_body_class( $classes ) {
    if ( is_checkout() || is_cart() ) {
        $classes[] = 'storefront-full-width-content';
    }
    return $classes;
}
 
 /**
 * RECEPTOR DE CARRITO PARA HEADLESS (Astro -> WooCommerce)
 *
 * OPTIMIZACIÓN: Usar 'wp' en vez de 'template_redirect'
 * template_redirect disparaba DESPUÉS de que WP cargaba la página completa,
 * causando que el browser hiciera 2 page loads completos (~6s en total).
 * Con 'wp' el redirect ocurre antes del render — solo 1 page load (~2-3s).
 */
add_action('wp', function() {
    if (!isset($_GET['fill_cart']) || empty($_GET['fill_cart'])) {
        return;
    }

    if (!function_exists('WC') || !WC()->cart) {
        return;
    }

    // Limpiar carrito actual para evitar duplicados de sesiones anteriores
    WC()->cart->empty_cart();

    $raw_items = sanitize_text_field($_GET['fill_cart']);
    $items = explode(',', $raw_items);

    $added_any = false;
    foreach ($items as $item) {
        $parts = explode(':', $item);
        $id    = intval($parts[0]);
        $qty   = isset($parts[1]) ? max(1, intval($parts[1])) : 1;

        if ($id > 0) {
            $result = WC()->cart->add_to_cart($id, $qty);
            if ($result) $added_any = true;
        }
    }

    // Guardar el carrito en sesión antes del redirect
    WC()->cart->maybe_set_cart_cookies();

    // Redirect al destino solicitado o al checkout por defecto
    nocache_headers();
    if ($added_any) {
        // Si el usuario quería ir al carrito, respetamos eso. Si no, al checkout.
        $target = (strpos($_SERVER['REQUEST_URI'], '/cart') !== false) ? wc_get_cart_url() : wc_get_checkout_url();
        wp_redirect($target);
    } else {
        wp_redirect(wc_get_cart_url());
    }
    exit;
});
/*Fin del receptor*/
 

add_action('template_redirect', function() {
    // 1. Definimos las rutas que SÍ deben funcionar en el subdominio de WordPress
    $allowed_endpoints = [
        'checkout',
        'order-received',
        'wc-api',
        'wp-json', // ¡Fundamental para que Astro pueda pedir datos!
        'my-account',
        'cart'
    ];

    $current_uri = $_SERVER['REQUEST_URI'];
    $is_allowed = false;

    foreach ($allowed_endpoints as $endpoint) {
        if (strpos($current_uri, $endpoint) !== false) {
            $is_allowed = true;
            break;
        }
    }

    // 2. Si no es una ruta permitida, ni el admin, y es la home o un producto...
    if (!is_admin() && !defined('REST_REQUEST') && !$is_allowed) {
        
        // Si entran a la raíz: tienda.winstonandharrystore.com -> winstonandharrystore.com
        if (is_front_page() || is_home()) {
            wp_redirect('https://winstonandharrystore.com/', 301);
            exit;
        }

        // Si entran a un producto individual en WP, los mandamos a su versión en Astro
        if (is_product()) {
            global $post;
            wp_redirect('https://winstonandharrystore.com/productos/' . $post->post_name, 301);
            exit;
        }

        // Cualquier otra página (categorías, etiquetas, etc.) a la home de Astro
        wp_redirect('https://winstonandharrystore.com/', 301);
        exit;
    }
});

// En functions.php para sincronizar el contador del carrito
add_filter( 'woocommerce_add_to_cart_fragments', function( $fragments ) {
    ob_start();
    ?>
    <span class="cart-count" id="cart-count"><?php echo WC()->cart->get_cart_contents_count(); ?></span>
    <?php
    $fragments['#cart-count'] = ob_get_clean();
    return $fragments;
});

/**
 * Post Type: Look de la semana.
 * Add this code to your theme's functions.php or a custom plugin.
 */

function register_cpt_look_semana()
{

    /**
     * Post Type: Look de la semana.
     */
    $labels = [
        "name" => esc_html__("Looks de la semana", "custom-post-type-ui"),
        "singular_name" => esc_html__("Look de la semana", "custom-post-type-ui"),
        "menu_name" => esc_html__("Look de la Semana", "custom-post-type-ui"),
        "all_items" => esc_html__("Todos los Looks", "custom-post-type-ui"),
        "add_new" => esc_html__("Añadir nuevo", "custom-post-type-ui"),
        "add_new_item" => esc_html__("Añadir nuevo Look", "custom-post-type-ui"),
        "edit_item" => esc_html__("Editar Look", "custom-post-type-ui"),
        "new_item" => esc_html__("Nuevo Look", "custom-post-type-ui"),
        "view_item" => esc_html__("Ver Look", "custom-post-type-ui"),
        "view_items" => esc_html__("Ver Looks", "custom-post-type-ui"),
        "search_items" => esc_html__("Buscar Looks", "custom-post-type-ui"),
        "not_found" => esc_html__("No se encontraron Looks", "custom-post-type-ui"),
        "not_found_in_trash" => esc_html__("No se encontraron Looks en la papelera", "custom-post-type-ui"),
    ];

    $args = [
        "label" => esc_html__("Looks de la semana", "custom-post-type-ui"),
        "labels" => $labels,
        "description" => "Sección para manejar el look destacado de la semana con productos vinculados.",
        "public" => true,
        "publicly_queryable" => true,
        "show_ui" => true,
        "show_in_menu" => true,
        "show_in_nav_menus" => true,
        "delete_with_user" => false,
        "show_in_rest" => true, // Importante para Headless
        "rest_base" => "look-semana",
        "rest_controller_class" => "WP_REST_Posts_Controller",
        "rest_namespace" => "wp/v2",
        "has_archive" => false,
        "show_in_autocore" => false,
        "menu_icon" => "dashicons-star-filled",
        "supports" => ["title", "editor", "thumbnail"],
        "taxonomies" => [],
        "rewrite" => ["slug" => "look-semana", "with_front" => true],
    ];

    register_post_type("look_semana", $args);
}

add_action('init', 'register_cpt_look_semana');

/**
 * Enqueue scripts for Media Selector in Admin.
 */
function look_semana_admin_scripts()
{
    global $post_type;
    if ('look_semana' == $post_type) {
        wp_enqueue_media();
    }
}
add_action('admin_enqueue_scripts', 'look_semana_admin_scripts');

/**
 * Add Meta Boxes for Look de la semana.
 */
function look_semana_add_meta_boxes()
{
    add_meta_box(
        'look_semana_fields',
        'Detalles del Look de la Semana',
        'look_semana_meta_box_callback',
        'look_semana',
        'normal',
        'high'
    );
}
add_action('add_meta_boxes', 'look_semana_add_meta_boxes');

function look_semana_meta_box_callback($post)
{
    wp_nonce_field('look_semana_save_meta_box_data', 'look_semana_meta_box_nonce');

    $titulo_personalizado = get_post_meta($post->ID, '_look_titulo_personalizado', true);
    $description = get_post_meta($post->ID, '_look_descripcion', true);
    $imagen_id = get_post_meta($post->ID, '_look_imagen_id', true);
    $imagen_url = $imagen_id ? wp_get_attachment_url($imagen_id) : '';
    $producto_1 = get_post_meta($post->ID, '_look_producto_1', true);
    $producto_2 = get_post_meta($post->ID, '_look_producto_2', true);

    ?>
    <style>
        .look-flex-container {
            display: flex;
            gap: 20px;
            align-items: start;
            margin-bottom: 20px;
        }

        .look-col {
            flex: 1;
        }

        .look-media-preview {
            margin-top: 10px;
            max-width: 200px;
            display: block;
            border: 1px solid #ccc;
        }

        .look-media-preview:not([src]) {
            display: none;
        }
    </style>

    <div class="look-flex-container">
        <!-- Columna Izquierda: Titulo Custom -->
        <div class="look-col">
            <label for="look_titulo_personalizado"><strong>Título del Look:</strong></label><br>
            <input type="text" id="look_titulo_personalizado" name="look_titulo_personalizado"
                value="<?php echo esc_attr($titulo_personalizado); ?>" style="width:100%; height: 40px; margin-top: 10px;">
            <p class="description">Este título aparecerá en el banner frontal.</p>
        </div>

        <!-- Columna Derecha: WYSIWYG -->
        <div class="look-col">
            <label for="look_descripcion"><strong>Descripción:</strong></label>
            <div style="margin-top: 10px;">
                <?php wp_editor($description, 'look_descripcion', array('textarea_name' => 'look_descripcion', 'media_buttons' => false, 'textarea_rows' => 5)); ?>
            </div>
        </div>
    </div>

    <hr>

    <div class="look-flex-container">
        <!-- Campo Imagen con Selector -->
        <div class="look-col">
            <label><strong>Imagen del Look (Media):</strong></label><br>
            <div style="margin-top: 10px;">
                <input type="hidden" id="look_imagen_id" name="look_imagen_id" value="<?php echo esc_attr($imagen_id); ?>">
                <img id="look_img_preview" src="<?php echo esc_attr($imagen_url); ?>" class="look-media-preview">
                <button type="button" class="button button-secondary" id="look_upload_btn">Seleccionar Imagen</button>
                <button type="button" class="button button-link-delete" id="look_remove_btn"
                    style="<?php echo !$imagen_id ? 'display:none;' : ''; ?>">Quitar</button>
            </div>
        </div>

        <!-- IDs de Productos -->
        <div class="look-col">
            <label for="look_producto_1"><strong>ID Producto 1 (WC):</strong></label><br>
            <input type="number" id="look_producto_1" name="look_producto_1" value="<?php echo esc_attr($producto_1); ?>"
                style="width:100px; margin-top:5px;"><br><br>

            <label for="look_producto_2"><strong>ID Producto 2 (WC):</strong></label><br>
            <input type="number" id="look_producto_2" name="look_producto_2" value="<?php echo esc_attr($producto_2); ?>"
                style="width:100px; margin-top:5px;">
        </div>
    </div>

    <script>
        jQuery(document).ready(function ($) {
            var frame;
            $('#look_upload_btn').on('click', function (e) {
                e.preventDefault();
                if (frame) { frame.open(); return; }
                frame = wp.media({ title: 'Seleccionar Imagen del Look', button: { text: 'Usar esta imagen' }, multiple: false });
                frame.on('select', function () {
                    var attachment = frame.state().get('selection').first().toJSON();
                    $('#look_imagen_id').val(attachment.id);
                    $('#look_img_preview').attr('src', attachment.url).show();
                    $('#look_remove_btn').show();
                });
                frame.open();
            });
            $('#look_remove_btn').on('click', function (e) {
                e.preventDefault();
                $('#look_imagen_id').val('');
                $('#look_img_preview').hide();
                $(this).hide();
            });
        });
    </script>
    <?php
}

function look_semana_save_meta_box_data($post_id)
{
    if (!isset($_POST['look_semana_meta_box_nonce']))
        return;
    if (!wp_verify_nonce($_POST['look_semana_meta_box_nonce'], 'look_semana_save_meta_box_data'))
        return;
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)
        return;
    if (!current_user_can('edit_post', $post_id))
        return;

    if (isset($_POST['look_titulo_personalizado']))
        update_post_meta($post_id, '_look_titulo_personalizado', sanitize_text_field($_POST['look_titulo_personalizado']));
    if (isset($_POST['look_descripcion']))
        update_post_meta($post_id, '_look_descripcion', $_POST['look_descripcion']);
    if (isset($_POST['look_imagen_id']))
        update_post_meta($post_id, '_look_imagen_id', sanitize_text_field($_POST['look_imagen_id']));
    if (isset($_POST['look_producto_1']))
        update_post_meta($post_id, '_look_producto_1', sanitize_text_field($_POST['look_producto_1']));
    if (isset($_POST['look_producto_2']))
        update_post_meta($post_id, '_look_producto_2', sanitize_text_field($_POST['look_producto_2']));
}
add_action('save_post', 'look_semana_save_meta_box_data');

/**
 * Register Fields in REST API (Crucial for Headless without ACF)
 */
function look_semana_register_rest_fields()
{
    register_rest_field('look_semana', 'custom_fields', array(
        'get_callback' => function ($post_array) {
            $post_id = $post_array['id'];
            $img_id = get_post_meta($post_id, '_look_imagen_id', true);
            $custom_title = get_post_meta($post_id, '_look_titulo_personalizado', true);
            return array(
                'look_titulo' => $custom_title ? $custom_title : $post_array['title']['rendered'],
                'look_descripcion' => get_post_meta($post_id, '_look_descripcion', true),
                'look_imagen' => $img_id ? wp_get_attachment_url($img_id) : '',
                'look_producto_1' => get_post_meta($post_id, '_look_producto_1', true),
                'look_producto_2' => get_post_meta($post_id, '_look_producto_2', true),
            );
        },
        'schema' => null,
    ));
}
add_action('rest_api_init', 'look_semana_register_rest_fields');

/**
 * Expose WordPress Menus to REST API
 * Endpoint: /wp-json/wh/v1/menu/<slug>
 */
function wh_get_menu_items_by_slug($request)
{
    $menu_slug = $request->get_param('slug');
    $menu_items = wp_get_nav_menu_items($menu_slug);

    if (empty($menu_items)) {
        return new WP_Error('no_menu', 'Menu not found', array('status' => 404));
    }

    $formatted_items = array();
    foreach ($menu_items as $item) {
        $formatted_items[] = array(
            'id' => $item->ID,
            'title' => $item->title,
            'url' => $item->url,
            'order' => $item->menu_order,
            'parent' => $item->menu_item_parent
        );
    }

    return rest_ensure_response($formatted_items);
}

add_action('rest_api_init', function () {
    register_rest_route('wh/v1', '/menu/(?P<slug>[a-zA-Z0-9-]+)', array(
        'methods' => 'GET',
        'callback' => 'wh_get_menu_items_by_slug',
        'permission_callback' => '__return_true'
    ));
});

/**
 * Actualizar contador de carrito vía AJAX
 */

add_filter( 'woocommerce_add_to_cart_fragments', function( $fragments ) {
    ob_start();
    ?>
    <span class="cart-count"><?php echo WC()->cart->get_cart_contents_count(); ?></span>
    <?php
    $fragments['span.cart-count'] = ob_get_clean();
    return $fragments;
});

/**
 * WooCommerce Quantity Buttons (+/-)
 */
add_action( 'woocommerce_after_quantity_input_field', 'wh_add_quantity_plus_button' );
function wh_add_quantity_plus_button() {
    echo '<button type="button" class="plus">+</button>';
}

add_action( 'woocommerce_before_quantity_input_field', 'wh_add_quantity_minus_button' );
function wh_add_quantity_minus_button() {
    echo '<button type="button" class="minus">-</button>';
}

// Script para que funcionen los botones +/-
add_action( 'wp_footer', 'wh_quantity_buttons_script' );
function wh_quantity_buttons_script() {
    if ( ! is_cart() && ! is_product() && ! is_checkout() ) return;
    ?>
    <script type="text/javascript">
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('plus') || e.target.classList.contains('minus')) {
            const qtyInput = e.target.closest('.quantity').querySelector('input.qty');
            if (qtyInput) {
                let currentVal = parseFloat(qtyInput.value) || 0;
                let step = parseFloat(qtyInput.step) || 1;
                let min = parseFloat(qtyInput.min) || 0;
                let max = parseFloat(qtyInput.max) || Infinity;

                if (e.target.classList.contains('plus')) {
                    if (currentVal < max) {
                        qtyInput.value = (currentVal + step).toFixed(qtyInput.step.toString().split('.')[1] ? qtyInput.step.toString().split('.')[1].length : 0);
                    }
                } else {
                    if (currentVal > min) {
                        qtyInput.value = (currentVal - step).toFixed(qtyInput.step.toString().split('.')[1] ? qtyInput.step.toString().split('.')[1].length : 0);
                    }
                }
                
                // Trigger change event to update cart via AJAX
                const event = new Event('change', { bubbles: true });
                qtyInput.dispatchEvent(event);
            }
        }
    });
    </script>
    <?php
}

/**
 * Replica la estructura de Astro: <li class="has-submenu"> <div class="menu-link-wrapper"> <a...> <button class="submenu-toggle"> </div> <ul class="submenu">...</ul>
 */
class WH_Walker_Nav_Menu extends Walker_Nav_Menu {
    function start_el( &$output, $item, $depth = 0, $args = array(), $id = 0 ) {
        $classes = empty( $item->classes ) ? array() : (array) $item->classes;
        $has_children = in_array( 'menu-item-has-children', $classes );
        
        if ( $has_children ) {
            $classes[] = 'has-submenu';
        }
        
        $class_names = join( ' ', apply_filters( 'nav_menu_css_class', array_filter( $classes ), $item, $args ) );
        $output .= '<li class="' . esc_attr( $class_names ) . '">';
        
        $output .= '<div class="menu-link-wrapper">';

        $attributes = '';
        if ( ! empty( $item->url ) ) {
            // Reemplazar URLs para que apunten a Astro si es necesario
            $url = $item->url;
            $url = str_replace('https://tienda.winstonandharrystore.com', 'https://winstonandharrystore.com', $url);
            $url = str_replace('/product-category/', '/categoria/', $url);
            $attributes .= ' href="' . esc_url( $url ) . '"';
        }
        
        $item_output = $args->before;
        $item_output .= '<a class="mobile-link" ' . $attributes . '>';
        $item_output .= $args->link_before . apply_filters( 'the_title', $item->title, $item->ID ) . $args->link_after;
        $item_output .= '</a>';
        
        if ( $has_children ) {
            $item_output .= '<button class="submenu-toggle" aria-expanded="false">';
            $item_output .= '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            $item_output .= '</button>';
        }
        
        $item_output .= '</div>';
        $item_output .= $args->after;

        $output .= apply_filters( 'walker_nav_menu_start_el', $item_output, $item, $depth, $args );
    }

    function start_lvl( &$output, $depth = 0, $args = array() ) {
        $output .= '<ul class="submenu">';
    }
}

/**
 * Winston & Harry — Webhook Relay
 * 
 * WooCommerce no puede hacer POST directo a Vercel (bloqueado por infraestructura).
 * Este relay recibe el webhook en WordPress y lo reenvía a Vercel como GET con token.
 * 
 * Flujo:
 *   WooCommerce → POST /wp-json/wh/v1/sync → este relay → GET /api/sync-relay?token=X&slug=Y → Vercel
 * 
 * INSTALACIÓN:
 *   Pegar este código al final de functions.php del tema activo,
 *   o en un plugin personalizado en wp-content/plugins/wh-relay/wh-relay.php
 */

// ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────

// URL del frontend Astro en Vercel (cambiar a producción cuando corresponda)
define('WH_FRONTEND_URL', 'https://staging.winstonandharrystore.com');

// Token secreto compartido entre WordPress y Vercel
define('WH_RELAY_TOKEN', 'wh_relay_secret_token_2026');

// Secreto para validar la firma de los webhooks de WooCommerce
define('WC_WEBHOOK_SECRET', 'winston_revalidate_2024');

// ─── REGISTRO DEL ENDPOINT REST ──────────────────────────────────────────────

add_action('rest_api_init', function () {
    register_rest_route('wh/v1', '/sync', [
        'methods'             => ['POST', 'GET'],
        'callback'            => 'wh_webhook_relay',
        'permission_callback' => '__return_true', // WooCommerce firma con HMAC, no necesita auth WP
    ]);
});

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────

function wh_webhook_relay(WP_REST_Request $request) {
    $topic     = (string)$request->get_header('x-wc-webhook-topic');
    $signature = $request->get_header('x-wc-webhook-signature');
    $body      = $request->get_body();

    // 1. Verificar firma HMAC de WooCommerce
    $secret = defined('WC_WEBHOOK_SECRET') ? WC_WEBHOOK_SECRET : get_option('wh_webhook_secret', '');
    if ($secret && $signature) {
        $expected = base64_encode(hash_hmac('sha256', $body, $secret, true));
        if (!hash_equals($expected, $signature)) {
            return new WP_REST_Response(['error' => 'Invalid signature'], 401);
        }
    }

    // 2. Parsear payload
    $data = json_decode($body, true) ?: [];
    $slug = $data['slug'] ?? '';
    $id   = $data['id']   ?? '';

    // 3. Handshake de WooCommerce (ping inicial para activar el webhook)
    if ($topic === 'webhook.test' || $topic === 'action.ping' || (!$slug && !$id)) {
        wh_notify_vercel('/', $topic);
        return new WP_REST_Response(['success' => true, 'message' => 'Handshake OK'], 200);
    }

    // 4. Construir rutas a revalidar
    $paths = ['/'];
    if ($slug) $paths[] = '/productos/' . $slug;

    if (!empty($data['categories']) && is_array($data['categories'])) {
        foreach ($data['categories'] as $cat) {
            if (!empty($cat['slug'])) {
                $paths[] = '/categoria/' . $cat['slug'];
            }
        }
    }

    // 5. Notificar a Vercel de forma asíncrona (no bloquea la respuesta a WooCommerce)
    foreach ($paths as $path) {
        wh_notify_vercel($path, $topic);
    }

    error_log('[WH Relay] Revalidando ' . count($paths) . ' rutas para: ' . $slug);

    return new WP_REST_Response([
        'success'    => true,
        'topic'      => $topic,
        'slug'       => $slug,
        'revalidated'=> count($paths),
    ], 200);
}

// ─── FUNCIÓN DE NOTIFICACIÓN A VERCEL ────────────────────────────────────────

function wh_notify_vercel(string $path, ?string $topic = '') {
    $token    = defined('WH_RELAY_TOKEN') ? WH_RELAY_TOKEN : '';
    $frontend = defined('WH_FRONTEND_URL') ? WH_FRONTEND_URL : '';

    if (!$frontend || !$token) {
        error_log('[WH Relay] ERROR: WH_FRONTEND_URL o WH_RELAY_TOKEN no configurados.');
        return;
    }

    $url = $frontend . '/api/sync-relay'
         . '?token=' . urlencode($token)
         . '&path='  . urlencode($path)
         . '&topic=' . urlencode($topic);

    // wp_remote_get es no bloqueante con timeout corto
    wp_remote_get($url, [
        'timeout'   => 5,
        'blocking'  => false, // Fire and forget — no esperamos respuesta
        'sslverify' => true,
        'headers'   => [
            'User-Agent' => 'WinstonHarry-Relay/1.0',
        ],
    ]);
}

/**
 * ─── AUTOMATIZACIÓN TOTAL (HOOKS DIRECTOS) ──────────────────────────────────
 * Dispara la sincronización instantánea al guardar productos o looks
 * sin depender del sistema de webhooks de WooCommerce.
 */

// 1. Al guardar un Producto de WooCommerce
add_action('woocommerce_update_product', 'wh_sync_on_product_save', 10, 1);
function wh_sync_on_product_save($product_id) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    
    $product = wc_get_product($product_id);
    if (!$product) return;

    $slug = $product->get_slug();
    wh_notify_vercel('/', 'direct_sync'); // Home
    wh_notify_vercel('/productos/' . $slug, 'direct_sync'); // Ficha de producto
    
    // También categorías del producto
    $categories = $product->get_category_ids();
    foreach ($categories as $cat_id) {
        $term = get_term($cat_id, 'product_cat');
        if ($term && !is_wp_error($term)) {
            wh_notify_vercel('/categoria/' . $term->slug, 'direct_sync');
        }
    }
}

// 2. Al guardar un Look de la Semana (CPT)
add_action('save_post_look_semana', 'wh_sync_on_look_save', 10, 3);
function wh_sync_on_look_save($post_id, $post, $update) {
    if (!$update || (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)) return;
    if (wp_is_post_revision($post_id)) return;
    
    wh_notify_vercel('/', 'look_updated');
}

/**
 * AUTO-LOGIN PARA HEADLESS
 * Permite entrar a WordPress logueado desde Astro usando el Token JWT
 */
add_action('init', function() {
    // Solo actuamos si viene el parámetro 'autologin' y estamos en la página de cuenta
    if (isset($_GET['autologin']) && !empty($_GET['autologin']) && strpos($_SERVER['REQUEST_URI'], 'my-account') !== false) {
        $token = sanitize_text_field($_GET['autologin']);
        
        // Usamos el validador del plugin JWT que ya instalaste
        $auth = new Jwt_Auth_Public('jwt-auth', '1.1.0');
        $user_data = $auth->validate_token($token);

        if (!is_wp_error($user_data)) {
            $user_id = $user_data->data->user->id;
            
            // Logueamos al usuario en WordPress (creamos la cookie)
            wp_set_current_user($user_id);
            wp_set_auth_cookie($user_id);
            
            // Redirigimos a la misma URL pero sin el token para limpiar la barra de direcciones
            $redirect_url = remove_query_arg('autologin');
            wp_redirect($redirect_url);
            exit;
        }
    }
});
