<?php
// Router for PHP's built-in web server: serve existing files from public/
// as they are, send everything else to the Symfony front controller.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = $_SERVER['DOCUMENT_ROOT'] . $path;
if ($path !== '/' && is_file($file)) {
    return false;
}
$_SERVER['SCRIPT_FILENAME'] = $_SERVER['DOCUMENT_ROOT'] . '/index.php';
$_SERVER['SCRIPT_NAME'] = '/index.php';
require $_SERVER['SCRIPT_FILENAME'];
