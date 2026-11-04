  const $ = id => document.getElementById(id);

  const pantallas = [
    'pantalla-login',
    'pantalla-registro',
    'pantalla-pendiente',
    'pantalla-catalogo',
    'pantalla-admin'
  ];

  function mostrar(id) {
    pantallas.forEach(p => $(p).classList.add('oculto'));
    $(id).classList.remove('oculto');
  }

  function mensaje(texto, tipo = '') {
    const el = $('mensaje-general');
    el.textContent = texto;
    el.className = 'mensaje ' + tipo;
  }

  async function peticion(url, opciones = {}) {
    const respuesta = await fetch(url, {
      ...opciones,
      credentials: 'same-origin',
      headers: {
        ...(opciones.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...opciones.headers
      }
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      throw new Error(datos.error || 'Ocurrió un error.');
    }

    return datos;
  }

  function cerrarPantallas() {
    $('barra-usuario').classList.add('oculto');
    mostrar('pantalla-login');
  }

  $('ir-registro').onclick = () => mostrar('pantalla-registro');
  $('ir-login').onclick = () => mostrar('pantalla-login');
  $('volver-login').onclick = () => mostrar('pantalla-login');

  // REGISTRO
  $('form-registro').onsubmit = async event => {
    event.preventDefault();

    const form = new FormData(event.target);
    const datos = Object.fromEntries(form.entries());

    try {
      const respuesta = await peticion('/api/registro', {
        method: 'POST',
        body: JSON.stringify(datos)
      });

      event.target.reset();
      mensaje(respuesta.mensaje, 'exito');
      mostrar('pantalla-pendiente');

    } catch (error) {
      mensaje(error.message, 'error');
    }
  };

  // INICIO DE SESIÓN
  $('form-login').onsubmit = async event => {
    event.preventDefault();

    const datos = Object.fromEntries(new FormData(event.target).entries());

    try {
      const respuesta = await peticion('/api/login', {
        method: 'POST',
        body: JSON.stringify(datos)
      });

      event.target.reset();
      await iniciarInterfaz(respuesta.usuario);

    } catch (error) {
      mensaje(error.message, 'error');
    }
  };

  // CERRAR SESIÓN
  $('btn-salir').onclick = async () => {
    try {
      await peticion('/api/logout', { method: 'POST' });
      cerrarPantallas();
      mensaje('Sesión cerrada correctamente.', 'exito');
    } catch (error) {
      mensaje(error.message, 'error');
    }
  };

  // CARGAR SESIÓN
  async function comprobarSesion() {
    try {
      const datos = await peticion('/api/sesion');

      if (datos.autenticado) {
        await iniciarInterfaz(datos.usuario);
      } else {
        cerrarPantallas();
      }
    } catch (error) {
      cerrarPantallas();
      mensaje(error.message, 'error');
    }
  }
async function iniciarInterfaz(usuario) {
  esAdmin = usuario.rol === 'admin';
  $('barra-usuario').classList.remove('oculto');
    $('nombre-usuario').textContent = usuario.nombre;

    if (usuario.rol === 'admin') {
      mostrar('pantalla-admin');
      await cargarUsuarios();
    } else {
      mostrar('pantalla-catalogo');
    }

    await cargarVideos();
    if (!esAdmin) {
      await cargarFotos();
await cargarMisCompras();
    }
  }

  // CATÁLOGO
  async function cargarVideos() {
    const catalogo = $('catalogo');
    catalogo.replaceChildren();

    try {
      const datos = await peticion('/api/videos');

      if (!datos.videos || datos.videos.length === 0) {
        catalogo.textContent = 'Todavía no hay videos disponibles.';
        return;
      }

      datos.videos.forEach(video => {
        const tarjeta = document.createElement('article');
        tarjeta.className = 'video-card';

        const reproductor = document.createElement('video');
        reproductor.controls = true;
        reproductor.preload = 'metadata';
        reproductor.playsInline = true;
        reproductor.src = video.url;

        const info = document.createElement('div');
        info.className = 'video-info';

        const nombre = document.createElement('div');
        nombre.className = 'video-nombre';
        nombre.textContent = video.name;

        const detalle = document.createElement('div');
        detalle.className = 'info';
        detalle.textContent =
          `${formatoBytes(video.size)} · ${new Date(video.modified).toLocaleDateString()}`;

        const descargar = document.createElement('a');
        descargar.href = video.downloadUrl;
        descargar.textContent = 'Descargar';
        descargar.style.color = '#c9a34a';

        info.append(nombre, detalle, descargar);

        tarjeta.append(reproductor, info);

        if (usuarioEsAdmin()) {
          const eliminar = document.createElement('button');
          eliminar.className = 'rechazar';
          eliminar.textContent = 'Eliminar';

          eliminar.onclick = async () => {
            if (!confirm(`¿Eliminar ${video.name}?`)) return;

            try {
              await peticion(
                `/api/videos/${encodeURIComponent(video.name)}`,
                { method: 'DELETE' }
              );

              tarjeta.remove();
              mensaje('Video eliminado.', 'exito');

            } catch (error) {
              mensaje(error.message, 'error');
            }
          };

          info.appendChild(eliminar);
        }

        catalogo.appendChild(tarjeta);
      });

    } catch (error) {
      mensaje(error.message, 'error');
    }
  }

  let esAdmin = false;
// CATÁLOGO DE FOTOGRAFÍAS
let paginaFotos = 1;
let totalPaginasFotos = 1;
let fotosSeleccionadas = new Set();

const PRECIO_FOTO = 50;
const PRECIO_VIDEOS = 600;
const LIMITE_FOTOS = 24;
  function usuarioEsAdmin() {
    return esAdmin;
  }
  // CARGAR FOTOGRAFÍAS
  async function cargarFotos() {
    const galeria = $('galeria-fotos');
    galeria.textContent = 'Cargando fotografías...';

    try {
      const datos = await peticion(
        `/api/fotos?pagina=${paginaFotos}&limite=${LIMITE_FOTOS}`
      );

      totalPaginasFotos = datos.paginas;
      galeria.replaceChildren();

      if (!datos.fotos || datos.fotos.length === 0) {
        galeria.textContent = 'No hay fotografías disponibles.';
        return;
      }

      datos.fotos.forEach(foto => {
        // Aquí construiremos cada tarjeta.
        const tarjeta = document.createElement('article');
        tarjeta.className = 'foto-card';

        const imagen = document.createElement('img');
        imagen.src = foto.url;
        imagen.alt = foto.nombre;
        imagen.loading = 'lazy';
        const seleccion = document.createElement('button');
        seleccion.textContent = fotosSeleccionadas.has(foto.nombre)
          ? 'Quitar del carrito'
          : 'Agregar al carrito';

        seleccion.className = 'secundario';

        seleccion.onclick = () => {
          if (fotosSeleccionadas.has(foto.nombre)) {
            fotosSeleccionadas.delete(foto.nombre);
          } else {
            fotosSeleccionadas.add(foto.nombre);
          }

          actualizarCarrito();
          seleccion.textContent = fotosSeleccionadas.has(foto.nombre)
            ? 'Quitar del carrito'
            : 'Agregar al carrito';
        };

        tarjeta.appendChild(seleccion);
        tarjeta.appendChild(imagen);
        galeria.appendChild(tarjeta);
      });

      $('info-pagina').textContent =
        `Página ${paginaFotos} de ${totalPaginasFotos}`;

    } catch (error) {
      galeria.textContent = error.message;
    }
  }
    // ACTUALIZAR CARRITO
  function actualizarCarrito() {
    const resumen = $('resumen-carrito');
    resumen.replaceChildren();

    if (fotosSeleccionadas.size === 0) {
      const texto = document.createElement('p');
      texto.textContent = 'No has seleccionado fotografías.';
      resumen.appendChild(texto);
    } else {
      const texto = document.createElement('p');
      texto.textContent =
        `Fotografías seleccionadas: ${fotosSeleccionadas.size}`;
      resumen.appendChild(texto);
    }

    const costoFotos = fotosSeleccionadas.size * PRECIO_FOTO;

    const costoVideos = $('paquete-videos').checked
      ? PRECIO_VIDEOS
      : 0;

    $('total-compra').textContent = costoFotos + costoVideos;
  }
  // MIS COMPRAS
  async function cargarMisCompras() {
    const lista = $('lista-mis-compras');
    lista.textContent = 'Cargando compras...';

    try {
      const compras = await peticion('/api/compras/mis-compras');
      lista.replaceChildren();

      if (!compras.length) {
        lista.textContent = 'Todavía no tienes compras.';
        return;
      }

      compras.forEach(compra => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'usuario';

        const informacion = document.createElement('div');
        informacion.textContent =
          `Folio: ${compra._id} · Total: $${compra.total} · Estado: ${compra.estado}`;

        tarjeta.appendChild(informacion);
        if (compra.estado === 'pendiente_pago') {
          const formulario = document.createElement('form');

          const archivo = document.createElement('input');
          archivo.type = 'file';
          archivo.accept = 'image/jpeg,image/png,application/pdf';
          archivo.required = true;

          const boton = document.createElement('button');
          boton.type = 'submit';
          boton.textContent = 'Enviar comprobante';

          formulario.append(archivo, boton);

          formulario.onsubmit = async event => {
            event.preventDefault();

            if (!archivo.files.length) return;

            const datos = new FormData();
            datos.append('comprobante', archivo.files[0]);

            boton.disabled = true;

            try {
              await peticion(
                `/api/compras/${encodeURIComponent(compra._id)}/comprobante`,
                {
                  method: 'POST',
                  body: datos
                }
              );

              await cargarMisCompras();

            } catch (error) {
              alert(error.message);
              boton.disabled = false;
            }
          };

          tarjeta.appendChild(formulario);
        }
        lista.appendChild(tarjeta);
      });

    } catch (error) {
      lista.textContent = error.message;
    }
  }
  // USUARIOS PENDIENTES
  async function cargarUsuarios() {
    const lista = $('lista-usuarios');
    lista.textContent = 'Cargando solicitudes...';

    try {
      const usuarios = await peticion('/api/admin/usuarios');
      lista.replaceChildren();

      if (!usuarios.length) {
        lista.textContent = 'No hay solicitudes pendientes.';
        return;
      }

      usuarios.forEach(usuario => {
        const fila = document.createElement('div');
        fila.className = 'usuario';

        const datos = document.createElement('div');
        datos.textContent = `${usuario.nombre} · ${usuario.whatsapp}`;

        const acciones = document.createElement('div');
        acciones.className = 'acciones';

        const aprobar = document.createElement('button');
        aprobar.textContent = 'Aprobar';
        aprobar.onclick = () => cambiarEstado(usuario._id, 'aprobado');

        const rechazar = document.createElement('button');
        rechazar.textContent = 'Rechazar';
        rechazar.className = 'rechazar';
        rechazar.onclick = () => cambiarEstado(usuario._id, 'rechazado');

        acciones.append(aprobar, rechazar);
        fila.append(datos, acciones);
        lista.appendChild(fila);
      });

    } catch (error) {
      lista.textContent = error.message;
    }
  }

  async function cambiarEstado(id, estado) {
    try {
      const respuesta = await peticion(
        `/api/admin/usuarios/${encodeURIComponent(id)}/estado`,
        {
          method: 'PATCH',
          body: JSON.stringify({ estado })
        }
      );

      mensaje(respuesta.mensaje, 'exito');
      await cargarUsuarios();

    } catch (error) {
      mensaje(error.message, 'error');
    }
  }

  // SUBIR VIDEOS
  $('form-subida').onsubmit = event => {
    event.preventDefault();

    const archivo = $('archivo-video').files[0];
    if (!archivo) return;

    const datos = new FormData();
    datos.append('video', archivo);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos');

    $('btn-subir').disabled = true;
    $('progreso').hidden = false;
    $('progreso').value = 0;
    $('mensaje-subida').textContent = 'Subiendo video...';

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        $('progreso').value = event.loaded / event.total * 100;
      }
    };

    xhr.onload = async () => {
      $('btn-subir').disabled = false;
      $('progreso').hidden = true;

      if (xhr.status >= 200 && xhr.status < 300) {
        $('form-subida').reset();
        $('mensaje-subida').textContent = 'Video subido correctamente.';
        await cargarVideos();
      } else {
        let error = 'No se pudo subir el video.';
        try {
          error = JSON.parse(xhr.responseText).error || error;
        } catch {}
        $('mensaje-subida').textContent = error;
      }
    };

    xhr.onerror = () => {
      $('btn-subir').disabled = false;
      $('progreso').hidden = true;
      $('mensaje-subida').textContent = 'Error de conexión.';
    };

    xhr.send(datos);
  };

  function formatoBytes(bytes) {
    if (!bytes) return '0 B';

    const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
    const indice = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, indice)).toFixed(indice ? 1 : 0)} ${unidades[indice]}`;
  }

  $('btn-recargar').onclick = cargarVideos;
    // CREAR COMPRA
  $('btn-crear-compra').onclick = async () => {
    const fotos = Array.from(fotosSeleccionadas);
    const paqueteVideos = $('paquete-videos').checked;

    if (fotos.length === 0 && !paqueteVideos) {
      $('mensaje-compra').textContent =
        'Selecciona fotografías o el paquete de videos.';
      return;
    }

    const boton = $('btn-crear-compra');
    boton.disabled = true;

    try {
      const compra = await peticion('/api/compras', {
        method: 'POST',
        body: JSON.stringify({
          fotos,
          paqueteVideos
        })
      });

      $('mensaje-compra').textContent =
        `Compra registrada. Folio: ${compra.compra.id}`;

    } catch (error) {
      $('mensaje-compra').textContent = error.message;
    } finally {
      boton.disabled = false;
    }
  };
    // PAGINACIÓN DE FOTOGRAFÍAS
  $('pagina-anterior').onclick = async () => {
    if (paginaFotos > 1) {
      paginaFotos--;
      await cargarFotos();
    }
  };

  $('pagina-siguiente').onclick = async () => {
    if (paginaFotos < totalPaginasFotos) {
      paginaFotos++;
      await cargarFotos();
    }
  };

  // PAQUETE DE VIDEOS
  $('paquete-videos').onchange = actualizarCarrito;
  $('btn-usuarios').onclick = cargarUsuarios;
  $('btn-mis-compras').onclick = cargarMisCompras;

  // Comprobar la sesión al abrir la página.
  comprobarSesion();
