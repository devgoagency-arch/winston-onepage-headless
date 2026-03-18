<?php
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
