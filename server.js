require("dotenv").config();
const conectarDB = require("./database");
const express = require("express");
const mime = require("mime-types");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const bcrypt = require("bcrypt");
const Usuario = require("./models/Usuario");
const Compra = require("./models/Compra");
const multer = require("multer");
const crypto = require("crypto");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const rateLimit = require("express-rate-limit");
const almacenamientoComprobantes = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, COMPROBANTES_DIR);
  },

  filename: (req, file, cb) => {
    const extensiones = {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
    };

    const extension = extensiones[file.mimetype];

    cb(null, crypto.randomBytes(24).toString("hex") + extension);
  },
});
const subirComprobante = multer({
  storage: almacenamientoComprobantes,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const permitidos = ["image/jpeg", "image/png", "application/pdf"];

    if (!permitidos.includes(file.mimetype)) {
      return cb(
        new Error("Solo se permiten imágenes JPG, PNG o archivos PDF."),
      );
    }

    cb(null, true);
  },
});
const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const VIDEOS_DIR = process.env.VIDEOS_DIR
  ? path.resolve(process.env.VIDEOS_DIR)
  : path.join(__dirname, "videos");
const FOTOS_DIR = path.join(__dirname, "fotos");
const FOTOS_PREVIEW_DIR = path.join(FOTOS_DIR, "previews");
const FOTOS_ORIGINALES_DIR = path.join(FOTOS_DIR, "originales");
const COMPROBANTES_DIR = path.join(__dirname, "comprobantes");
const MAX_UPLOAD_BYTES =
  Number(process.env.MAX_UPLOAD_BYTES) || 2 * 1024 * 1024 * 1024;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

fs.mkdirSync(VIDEOS_DIR, { recursive: true });

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".m4v",
  ".webm",
  ".ogv",
  ".mov",
  ".mkv",
  ".avi",
  ".ts",
  ".m3u8",
]);

function isVideoFile(filename) {
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function safeName(filename) {
  const base = path
    .basename(filename)
    .replace(/[^\w.\- ]+/g, "_")
    .trim();
  return base.replace(/^\.+/, "");
}

function contentDisposition(type, filename) {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function resolveVideoPath(filename) {
  if (typeof filename !== "string" || filename.includes("\0")) return null;
  const name = path.basename(filename);
  if (!name || name !== filename || name.startsWith(".")) return null;
  if (!isVideoFile(name)) return null;
  const full = path.join(VIDEOS_DIR, name);
  if (path.dirname(full) !== VIDEOS_DIR) return null;
  return full;
}
function resolvePhotoPath(filename, directory) {
  if (typeof filename !== "string" || filename.includes("\0")) {
    return null;
  }

  const name = path.basename(filename);

  if (!/^foto_\d+\.(webp|jpg)$/.test(name) || name !== filename) {
    return null;
  }

  const full = path.join(directory, name);

  if (path.dirname(full) !== directory) {
    return null;
  }

  return full;
}
function tokenMatches(candidate) {
  if (typeof candidate !== "string") return false;
  const provided = Buffer.from(candidate);
  const expected = Buffer.from(ADMIN_TOKEN);
  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({
      error: "Debes iniciar sesión.",
    });
  }

  if (req.session.usuario.rol !== "admin") {
    return res.status(403).json({
      error: "No tienes permisos de administrador.",
    });
  }

  next();
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, HEAD, POST, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Range, Content-Type, X-Admin-Token",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Range, Accept-Ranges, Content-Length",
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
// Configuración de sesiones
app.set("trust proxy", 1);

app.use(
  session({
    name: "cholupe.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
    }),
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);
app.use(express.static(path.join(__dirname, "public")));
// Limitar intentos de registro
const registroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: {
    error: "Demasiados intentos. Intenta nuevamente en 15 minutos.",
  },
});

// Registro de clientes
app.post("/api/registro", registroLimiter, async (req, res) => {
  try {
    const { nombre, whatsapp, correo, password } = req.body;

    // Validar campos
    if (
      typeof nombre !== "string" ||
      typeof whatsapp !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Nombre, WhatsApp y contraseña son obligatorios.",
      });
    }

    const nombreLimpio = nombre.trim();
    const numero = whatsapp.replace(/\D/g, "");

    if (nombreLimpio.length < 2 || nombreLimpio.length > 80) {
      return res.status(400).json({
        error: "El nombre debe tener entre 2 y 80 caracteres.",
      });
    }

    if (numero.length < 10 || numero.length > 15) {
      return res.status(400).json({
        error:
          "Escribe un número de WhatsApp válido, incluyendo código de país.",
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: "La contraseña debe tener entre 8 y 128 caracteres.",
      });
    }

    const correoLimpio =
      typeof correo === "string" ? correo.trim().toLowerCase() : "";

    if (correoLimpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio)) {
      return res.status(400).json({
        error: "El correo electrónico no es válido.",
      });
    }

    // Comprobar si el WhatsApp ya existe
    const existente = await Usuario.findOne({ whatsapp: numero });

    if (existente) {
      return res.status(409).json({
        error: "Este número de WhatsApp ya está registrado.",
      });
    }

    // Cifrar contraseña
    const passwordHash = await bcrypt.hash(password, 12);

    // Crear usuario
    const nuevoUsuario = new Usuario({
      nombre: nombreLimpio,
      whatsapp: numero,
      correo: correoLimpio || undefined,
      password: passwordHash,
      estado: "pendiente",
      rol: "cliente",
    });

    await nuevoUsuario.save();

    res.status(201).json({
      mensaje: "Registro exitoso. Tu cuenta está pendiente de aprobación.",
      estado: nuevoUsuario.estado,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Este número de WhatsApp ya está registrado.",
      });
    }

    console.error("Error en registro:", error);

    res.status(500).json({
      error: "No se pudo completar el registro.",
    });
  }
});
// Limitar intentos de inicio de sesión
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: {
    error: "Demasiados intentos. Intenta nuevamente en 15 minutos.",
  },
});

// Inicio de sesión
app.post("/api/login", loginLimiter, async (req, res) => {
  try {
    const { whatsapp, password } = req.body;

    if (typeof whatsapp !== "string" || typeof password !== "string") {
      return res.status(400).json({
        error: "WhatsApp y contraseña son obligatorios.",
      });
    }

    const numero = whatsapp.replace(/\D/g, "");

    const usuario = await Usuario.findOne({
      whatsapp: numero,
    }).select("+password");

    if (!usuario || !(await bcrypt.compare(password, usuario.password))) {
      return res.status(401).json({
        error: "WhatsApp o contraseña incorrectos.",
      });
    }

    if (usuario.estado === "pendiente") {
      return res.status(403).json({
        error: "Tu cuenta todavía está pendiente de aprobación.",
      });
    }

    if (usuario.estado !== "aprobado") {
      return res.status(403).json({
        error: "Tu cuenta no tiene acceso autorizado.",
      });
    }

    // Crear una sesión nueva
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    req.session.usuario = {
      id: usuario._id.toString(),
      nombre: usuario.nombre,
      rol: usuario.rol,
    };

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    res.json({
      mensaje: "Inicio de sesión correcto.",
      usuario: req.session.usuario,
    });
  } catch (error) {
    console.error("Error en login:", error);

    res.status(500).json({
      error: "No se pudo iniciar sesión.",
    });
  }
});
// Verificar que el usuario haya iniciado sesión
function requireLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.status(401).json({
      error: "Debes iniciar sesión.",
    });
  }

  next();
}

// Verificar que el usuario sea administrador
function requireAdminSession(req, res, next) {
  if (!req.session.usuario || req.session.usuario.rol !== "admin") {
    return res.status(403).json({
      error: "No tienes permisos de administrador.",
    });
  }

  next();
}
app.get("/api/admin/usuarios", requireAdmin, async (req, res) => {
  try {
    const usuarios = await Usuario.find({ estado: "pendiente" })
      .select("nombre whatsapp correo estado creado")
      .sort({ creado: 1 });

    res.json(usuarios);
  } catch (error) {
    console.error("Error al consultar usuarios:", error);
    res.status(500).json({
      error: "No se pudieron consultar los usuarios.",
    });
  }
});
app.patch("/api/admin/usuarios/:id/estado", requireAdmin, async (req, res) => {
  try {
    const { estado } = req.body;

    if (!["aprobado", "rechazado"].includes(estado)) {
      return res.status(400).json({
        error: "Estado no válido.",
      });
    }

    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true, runValidators: true },
    ).select("nombre whatsapp estado");

    if (!usuario) {
      return res.status(404).json({
        error: "Usuario no encontrado.",
      });
    }

    res.json({
      mensaje: `Cuenta ${estado} correctamente.`,
      usuario,
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    res.status(500).json({
      error: "No se pudo actualizar la cuenta.",
    });
  }
});
// Consultar sesión actual
app.get("/api/sesion", (req, res) => {
  res.json({
    autenticado: Boolean(req.session.usuario),
    usuario: req.session.usuario || null,
  });
});

// Cerrar sesión
app.post("/api/logout", requireLogin, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        error: "No se pudo cerrar la sesión.",
      });
    }

    res.clearCookie("cholupe.sid", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    res.json({
      mensaje: "Sesión cerrada correctamente.",
    });
  });
});
async function listVideos(usuario) {
  const esAdmin = usuario.rol === "admin";

  let tienePaquete = esAdmin;

  if (!esAdmin) {
    tienePaquete = await Compra.exists({
      usuario: usuario.id,
      estado: "aprobada",
      paqueteVideos: true,
    });
  }

  const entries = await fsp.readdir(VIDEOS_DIR, {
    withFileTypes: true,
  });

  const videos = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      entry.name.startsWith(".") ||
      !isVideoFile(entry.name)
    ) continue;

    try {
      const stat = await fsp.stat(
        path.join(VIDEOS_DIR, entry.name)
      );

      videos.push({
        name: entry.name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        url: `/videos/${encodeURIComponent(entry.name)}`,
        downloadUrl: tienePaquete
          ? `/videos/${encodeURIComponent(entry.name)}?download=1`
          : null,
      });
    } catch {
      continue;
    }
  }

  videos.sort((a, b) => a.name.localeCompare(b.name));

  return videos;
}

app.get("/api/videos", requireLogin, async (req, res, next) => {
  try {
    const videos = await listVideos(req.session.usuario);
    res.json({ count: videos.length, videos });
  } catch (err) {
    next(err);
  }
});
// Registrar una nueva compra
app.post("/api/compras", requireLogin, async (req, res, next) => {
  try {
    const { fotos, paqueteVideos } = req.body;

    if (!Array.isArray(fotos) || typeof paqueteVideos !== "boolean") {
      return res.status(400).json({
        error: "Datos de compra inválidos.",
      });
    }

    const fotosUnicas = [...new Set(fotos)];

    if (fotosUnicas.length !== fotos.length) {
      return res.status(400).json({
        error: "No se permiten fotografías repetidas.",
      });
    }

    if (fotosUnicas.length === 0 && !paqueteVideos) {
      return res.status(400).json({
        error: "Debes seleccionar fotografías o el paquete de videos.",
      });
    }

    if (
      !fotosUnicas.every(
        (nombre) =>
          typeof nombre === "string" && /^foto_\d+\.(webp|jpg)$/.test(nombre),
      )
    ) {
      return res.status(400).json({
        error: "Hay fotografías inválidas.",
      });
    }

    const disponibles = await fsp.readdir(FOTOS_ORIGINALES_DIR);

    if (!fotosUnicas.every((nombre) => disponibles.includes(nombre))) {
      return res.status(400).json({
        error: "Una o más fotografías no están disponibles.",
      });
    }

    const total = fotosUnicas.length * 50 + (paqueteVideos ? 600 : 0);

    const compra = await Compra.create({
      usuario: req.session.usuario.id,
      fotos: fotosUnicas,
      paqueteVideos,
      total,
      estado: "pendiente_pago",
    });

    res.status(201).json({
      mensaje: "Compra registrada correctamente.",
      compra: {
        id: compra._id,
        fotos: compra.fotos,
        paqueteVideos: compra.paqueteVideos,
        total: compra.total,
        estado: compra.estado,
      },
    });
  } catch (error) {
    next(error);
  }
});
// Consultar las compras del cliente
app.get("/api/compras/mis-compras", requireLogin, async (req, res, next) => {
  try {
    const compras = await Compra.find({
      usuario: req.session.usuario.id,
    })
      .sort({ createdAt: -1 })
      .select("-comprobante");

    res.json(compras);
  } catch (error) {
    next(error);
  }
});
// Recibir comprobante de una compra
app.post("/api/compras/:id/comprobante", requireLogin,

  async (req, res, next) => {
    try {
      const compra = await Compra.findOne({
        _id: req.params.id,
        usuario: req.session.usuario.id,
      });

      if (!compra) {
        return res.status(404).json({
          error: "Compra no encontrada.",
        });
      }

      if (compra.estado !== "pendiente_pago") {
        return res.status(400).json({
          error: "Esta compra ya no acepta comprobantes.",
        });
      }

      req.compra = compra;
      next();
    } catch (error) {
      next(error);
    }
  },

  subirComprobante.single("comprobante"),

  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Debes seleccionar un comprobante.",
        });
      }
      const archivo = await fsp.open(req.file.path, 'r');
      const firma = Buffer.alloc(8);

      try {
        await archivo.read(firma, 0, 8, 0);
      } finally {
        await archivo.close();
      }

      const esJpg =
        firma[0] === 0xFF &&
        firma[1] === 0xD8 &&
        firma[2] === 0xFF;

      const esPng = firma.equals(
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      );

      const esPdf = firma.toString('ascii', 0, 5) === '%PDF-';

      const extensionCorrecta =
        (req.file.mimetype === 'image/jpeg' && esJpg) ||
        (req.file.mimetype === 'image/png' && esPng) ||
        (req.file.mimetype === 'application/pdf' && esPdf);

      if (!extensionCorrecta) {
        await fsp.unlink(req.file.path);

        return res.status(400).json({
          error: 'El archivo no corresponde a un comprobante JPG, PNG o PDF válido.'
        });
      }
try {
  req.compra.comprobante = req.file.filename;
  req.compra.estado = 'pendiente_revision';

  await req.compra.save();

} catch (error) {
  await fsp.unlink(req.file.path).catch(() => {});
  throw error;
}
      res.json({
        mensaje: "Comprobante recibido. Tu compra está pendiente de revisión.",
        estado: req.compra.estado,
      });
    } catch (error) {
      next(error);
    }
  },
);
// Visualizar comprobante de una compra (solo administrador)
app.get("/api/admin/comprobantes/:id", requireAdmin, async (req, res, next) => {
  try {
    const compra = await Compra.findOne({
      _id: req.params.id,
      estado: "pendiente_revision",
    });

    if (!compra || !compra.comprobante) {
      return res.status(404).json({
        error: "Comprobante no encontrado.",
      });
    }

    const nombre = path.basename(compra.comprobante);

    if (
      nombre !== compra.comprobante ||
      !/^[a-f0-9]{48}\.(pdf|jpg|png)$/.test(nombre)
    ) {
      return res.status(400).json({
        error: "Archivo de comprobante inválido.",
      });
    }

    const filePath = path.join(COMPROBANTES_DIR, nombre);
    const stat = await fsp.stat(filePath);

    if (!stat.isFile()) {
      return res.status(404).json({
        error: "Archivo no encontrado.",
      });
    }

    const tipo = nombre.endsWith(".pdf")
      ? "application/pdf"
      : nombre.endsWith(".png")
        ? "image/png"
        : "image/jpeg";

    res.setHeader("Content-Type", tipo);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    fs.createReadStream(filePath).on("error", next).pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({
        error: "Archivo no encontrado.",
      });
    }

    next(error);
  }
});
// Consultar compras pendientes de revisión (solo administrador)
app.get(
  "/api/admin/compras-pendientes",
  requireAdmin,
  async (req, res, next) => {
    try {
      const compras = await Compra.find({
        estado: "pendiente_revision",
      })
        .populate("usuario", "nombre whatsapp")
        .sort({ createdAt: 1 });

      res.json(compras);
    } catch (error) {
      next(error);
    }
  },
);
// Aprobar o rechazar una compra (solo administrador)
app.patch(
  "/api/admin/compras/:id/estado",
  requireAdmin,
  async (req, res, next) => {
    try {
      const { estado } = req.body;

      if (!["aprobada", "rechazada"].includes(estado)) {
        return res.status(400).json({
          error: "Estado de compra inválido.",
        });
      }

      const compra = await Compra.findOne({
        _id: req.params.id,
        estado: "pendiente_revision",
      });

      if (!compra) {
        return res.status(404).json({
          error: "Compra no encontrada o ya fue revisada.",
        });
      }

      compra.estado = estado;
      compra.revisadoPor = req.session.usuario.id;
      compra.fechaRevision = new Date();

      await compra.save();

      res.json({
        mensaje:
          estado === "aprobada"
            ? "Compra aprobada correctamente."
            : "Compra rechazada.",
        estado: compra.estado,
      });
    } catch (error) {
      next(error);
    }
  },
);
// Entregar fotografía original solo si la compra está aprobada
app.get("/fotos/originales/:filename", requireLogin, async (req, res, next) => {
  try {
    const filePath = resolvePhotoPath(
      req.params.filename,
      FOTOS_ORIGINALES_DIR,
    );

    if (!filePath) {
      return res.status(400).json({
        error: "Nombre de fotografía inválido.",
      });
    }

    const usuarioId = req.session.usuario.id;
    const nombreFoto = req.params.filename;

    const tieneCompra = await Compra.exists({
      usuario: usuarioId,
      estado: "aprobada",
      fotos: nombreFoto,
    });

    if (!tieneCompra && req.session.usuario.rol !== "admin") {
      return res.status(403).json({
        error: "No tienes autorización para descargar esta fotografía.",
      });
    }

    const stat = await fsp.stat(filePath);

    if (!stat.isFile()) {
      return res.status(404).json({
        error: "Fotografía no encontrada.",
      });
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nombreFoto}"`,
    );
    res.setHeader("Cache-Control", "private, no-store");

    fs.createReadStream(filePath).on("error", next).pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({
        error: "Fotografía no encontrada.",
      });
    }

    next(error);
  }
});
// Catálogo de fotografías con marca de agua
app.get("/api/fotos", requireLogin, async (req, res, next) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(
      48,
      Math.max(1, parseInt(req.query.limite, 10) || 24),
    );

    const archivos = await fsp.readdir(FOTOS_PREVIEW_DIR);

    const fotos = archivos
      .filter((nombre) => /^foto_\d+\.(webp|jpg)$/.test(nombre))
      .sort((a, b) => {
        const numeroA = Number(a.match(/\d+/)[0]);
        const numeroB = Number(b.match(/\d+/)[0]);
        return numeroA - numeroB;
      });

    const inicio = (pagina - 1) * limite;
    const seleccion = fotos.slice(inicio, inicio + limite);

    res.setHeader("Cache-Control", "private, max-age=300");

    res.json({
      total: fotos.length,
      pagina,
      limite,
      paginas: Math.ceil(fotos.length / limite),
      precio: 50,
      fotos: seleccion.map((nombre) => ({
        nombre,
        url: `/fotos/preview/${encodeURIComponent(nombre)}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Mostrar fotografías con marca de agua
app.get("/fotos/preview/:filename", requireLogin, async (req, res, next) => {
  try {
    const filePath = resolvePhotoPath(req.params.filename, FOTOS_PREVIEW_DIR);

    if (!filePath) {
      return res.status(400).json({ error: "Nombre de fotografía inválido." });
    }

    const stat = await fsp.stat(filePath);

    if (!stat.isFile()) {
      return res.status(404).json({ error: "Fotografía no encontrada." });
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=300");

    fs.createReadStream(filePath).on("error", next).pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Fotografía no encontrada." });
    }
    next(error);
  }
});
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base =
      safeName(
        path.basename(file.originalname, path.extname(file.originalname)),
      ) || "video";
    if (!VIDEO_EXTENSIONS.has(ext))
      return cb(new Error("Extensión de video no permitida"));
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base}${ext}`,
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (
      !file.mimetype.startsWith("video/") &&
      !isVideoFile(file.originalname)
    ) {
      return cb(new Error("El archivo debe ser un video"));
    }
    cb(null, true);
  },
});

app.post("/api/videos", requireAdmin, (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ error: err.message });
    }
    if (!req.file)
      return res
        .status(400)
        .json({ error: 'No se envió ningún archivo en el campo "video"' });
    res.status(201).json({
      name: req.file.filename,
      size: req.file.size,
      url: `/videos/${encodeURIComponent(req.file.filename)}`,
    });
  });
});

app.get("/videos/:filename", requireLogin, async (req, res, next) => {
  try {
    const filePath = resolveVideoPath(req.params.filename);
    if (!filePath) {
      return res.status(400).json({
        error: "Nombre de archivo inválido",
      });
    }

    const esAdmin = req.session.usuario.rol === "admin";


const esVistaPrevia = req.query.preview === "1";

if (!esAdmin && !esVistaPrevia) {
  const tienePaquete = await Compra.exists({
    usuario: req.session.usuario.id,
    estado: "aprobada",
    paqueteVideos: true,
  });

  if (!tienePaquete) {
    return res.status(403).json({
      error: "Necesitas tener aprobado el paquete de videos para acceder.",
    });
  }
}
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return res.status(404).json({ error: "Video no encontrado" });
    }
    if (!stat.isFile())
      return res.status(404).json({ error: "Video no encontrado" });

    const contentType = mime.lookup(filePath) || "application/octet-stream";
    const total = stat.size;
    const download = req.query.download === "1";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Last-Modified", stat.mtime.toUTCString());
    if (download) {
      res.setHeader(
        "Content-Disposition",
        contentDisposition("attachment", path.basename(filePath)),
      );
    }

    const sendFull = () => {
      res.setHeader("Content-Length", total);
      if (req.method === "HEAD" || total === 0) return res.end();
      const stream = fs.createReadStream(filePath);
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    };

    const range = req.headers.range;
    if (!range || range.includes(",")) return sendFull();

    const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
    if (!match || (match[1] === "" && match[2] === "")) {
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.status(416).end();
    }

    let start;
    let end;
    if (match[1] === "") {
      const suffix = Number(match[2]);
      if (suffix === 0) {
        res.setHeader("Content-Range", `bytes */${total}`);
        return res.status(416).end();
      }
      start = Math.max(total - suffix, 0);
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
    }

    if (start >= total || start > end) {
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.status(416).end();
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", chunkSize);

    if (req.method === "HEAD") return res.end();

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/videos/:filename", requireAdmin, async (req, res, next) => {
  try {
    const filePath = resolveVideoPath(req.params.filename);
    if (!filePath)
      return res.status(400).json({ error: "Nombre de archivo inválido" });
    await fsp.unlink(filePath);
    res.status(204).end();
  } catch (err) {
    if (err.code === "ENOENT")
      return res.status(404).json({ error: "Video no encontrado" });
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return res.destroy();
  res
    .status(err.status || 500)
    .json({ error: err.message || "Error interno del servidor" });
});
async function iniciarServidor() {
  try {
    await conectarDB();

    const server = app.listen(PORT, HOST, () => {
      console.log(`Servidor de videos en http://${HOST}:${PORT}`);
      console.log(`Carpeta de videos: ${VIDEOS_DIR}`);
      console.log("MongoDB conectado y servidor iniciado");
    });

    function shutdown(signal) {
      console.log(`\n${signal} recibido, cerrando servidor...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("No se pudo iniciar el servidor:", error);
    process.exit(1);
  }
}

iniciarServidor();
