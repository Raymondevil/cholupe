# Bebe Video Server

Servidor Express para distribuir y reproducir videos con soporte de streaming por rangos (HTTP 206), subida y borrado de archivos, y una interfaz web incluida.

## Requisitos

- Node.js 18 o superior

## Instalación y uso

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

Para desarrollo con recarga automática:

```bash
npm run dev
```

Los videos se guardan en la carpeta `videos/`. También puedes copiarlos manualmente ahí.

## Variables de entorno

| Variable           | Default        | Descripción                                                        |
| ------------------ | -------------- | ------------------------------------------------------------------ |
| `PORT`             | `3000`         | Puerto del servidor                                                 |
| `HOST`             | `0.0.0.0`      | Interfaz de escucha                                                 |
| `ADMIN_TOKEN`      | vacío          | Si se define, protege la subida y el borrado con el header `X-Admin-Token` |
| `MAX_UPLOAD_BYTES` | `2147483648`   | Tamaño máximo por archivo (2 GB por defecto)                        |
| `VIDEOS_DIR`       | `./videos`     | Carpeta donde se almacenan los videos                               |

Ejemplo:

```bash
ADMIN_TOKEN=mi_clave_secreta npm start
```

En la interfaz web, escribe ese token en el campo "Token admin" para poder subir o eliminar videos.

## Endpoints

| Método   | Ruta                     | Descripción                                          |
| -------- | ------------------------ | ---------------------------------------------------- |
| `GET`    | `/`                      | Interfaz web                                         |
| `GET`    | `/api/videos`            | Lista los videos disponibles                         |
| `GET`    | `/videos/:filename`      | Streaming con soporte de `Range` y `HEAD`            |
| `GET`    | `/videos/:filename?download=1` | Descarga el archivo                           |
| `POST`   | `/api/videos`            | Sube un video (campo multipart `video`)              |
| `DELETE` | `/api/videos/:filename`  | Elimina un video                                     |
| `GET`    | `/health`                | Estado del servidor                                  |

Ejemplo de streaming parcial:

```bash
curl -H "Range: bytes=0-1023" http://localhost:3000/videos/pelicula.mp4 -o parte.bin
```

Ejemplo de subida:

```bash
curl -H "X-Admin-Token: mi_clave_secreta" -F "video=@pelicula.mp4" http://localhost:3000/api/videos
```

## Docker

```bash
docker compose up --build
```

La carpeta `videos/` se monta como volumen para conservar los archivos.

## Formatos soportados

`.mp4`, `.m4v`, `.webm`, `.ogv`, `.mov`, `.mkv`, `.avi`, `.ts`, `.m3u8`

> Nota: la reproducción depende de que el navegador soporte el códec del archivo. MP4 (H.264 + AAC) y WebM son las opciones más compatibles.
