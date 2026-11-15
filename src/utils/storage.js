import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { AppError } from "./errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MiB
export const ALLOWED_MIMETYPES = Object.freeze(["application/pdf", "image/jpeg", "image/png"]);
export const ALLOWED_EXTENSIONS = Object.freeze([".pdf", ".jpg", ".jpeg", ".png"]);

export const MIME_TO_EXTENSION = Object.freeze({
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
});

export const STORAGE_SUBFOLDERS = Object.freeze({
    TEMP: "temp",
    DOCUMENTS: "documents",
    LICENSES: "licenses",
    PROOFS: "proofs",
});

/**
 * Comprueba si una ruta destino se encuentra estrictamente dentro del directorio raíz autorizado,
 * protegiendo contra path traversal, carpetas hermanas con el mismo prefijo o rutas absolutas ajenas.
 */
export function isPathInside(parentDir, targetPath) {
    if (!parentDir || !targetPath || typeof targetPath !== "string") return false;
    const resolvedParent = path.resolve(parentDir);
    const resolvedTarget = path.resolve(targetPath);
    const relative = path.relative(resolvedParent, resolvedTarget);

    if (relative === "" || path.isAbsolute(relative)) {
        return false;
    }

    // Rechazar rutas que escapen mediante segmentos ".."
    if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        relative.startsWith("../") ||
        relative.startsWith("..\\")
    ) {
        return false;
    }

    return true;
}

/**
 * Inicializa la estructura de directorios de almacenamiento en disco si no existen.
 */
export async function initStorage() {
    const root = path.resolve(config.UPLOAD_DIR);
    await fs.mkdir(root, { recursive: true });
    for (const folder of Object.values(STORAGE_SUBFOLDERS)) {
        await fs.mkdir(path.join(root, folder), { recursive: true });
    }
}

/**
 * Valida la firma de bytes (magic bytes) del archivo almacenado para garantizar
 * que el contenido binario real corresponde al tipo MIME declarado por el cliente.
 * 
 * Alcance y limitaciones:
 * Esta comprobación valida correspondencia de cabeceras (%PDF-, JPEG FF D8 FF, PNG 89 50 4E 47).
 * No equivale a un motor antivirus ni a un analizador de malware de profundidad.
 */
export async function verifyMagicBytes(filePath, mimetype) {
    let handle;
    try {
        handle = await fs.open(filePath, "r");
        const buffer = Buffer.alloc(16);
        const { bytesRead } = await handle.read(buffer, 0, 16, 0);

        if (bytesRead < 4) {
            throw new AppError(
                ERROR_DICTIONARY.INVALID_FILE_TYPE,
                "El archivo es demasiado pequeño o está corrupto para validar su firma"
            );
        }

        const normalizedMime = mimetype?.toLowerCase();
        let valid = false;

        if (normalizedMime === "application/pdf") {
            // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
            valid = bytesRead >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
        } else if (normalizedMime === "image/jpeg") {
            // JPEG: FF D8 FF
            valid = bytesRead >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        } else if (normalizedMime === "image/png") {
            // PNG: 89 50 4E 47 0D 0A 1A 0A
            valid =
                bytesRead >= 8 &&
                buffer[0] === 0x89 &&
                buffer[1] === 0x50 &&
                buffer[2] === 0x4e &&
                buffer[3] === 0x47 &&
                buffer[4] === 0x0d &&
                buffer[5] === 0x0a &&
                buffer[6] === 0x1a &&
                buffer[7] === 0x0a;
        }

        if (!valid) {
            logger.warning("Rechazo de archivo por contenido incompatible con el tipo declarado", {
                event: "file_type_rejected",
                mimetype,
                filePath,
            });
            throw new AppError(
                ERROR_DICTIONARY.INVALID_FILE_TYPE,
                "El contenido binario del archivo no coincide con el tipo MIME declarado"
            );
        }
    } finally {
        if (handle) {
            await handle.close();
        }
    }
}

/**
 * Elimina un archivo de forma segura comprobando que resida estrictamente
 * dentro del directorio de uploads configurado mediante validación real de pertenencia
 * tanto en su ruta lógica como en su ruta canónica real.
 */
export async function safeUnlink(targetPath) {
    if (!targetPath || typeof targetPath !== "string") return;
    try {
        const resolvedTarget = path.resolve(targetPath);
        const resolvedRoot = path.resolve(config.UPLOAD_DIR);

        // 1. Validación de ruta lógica: rechaza carpetas hermanas o escapes con ".."
        if (!isPathInside(resolvedRoot, resolvedTarget)) {
            logger.warning("Seguridad: Intento de eliminar archivo fuera del directorio de uploads", {
                event: "file_cleanup_security_violation",
                targetPath,
                resolvedRoot,
            });
            return;
        }

        // 2. Validación de ruta canónica real (realpath) para la raíz autorizada
        let realRoot;
        try {
            realRoot = await fs.realpath(resolvedRoot);
        } catch (rootErr) {
            logger.error("Fallo al resolver la ruta real del directorio raíz de uploads", {
                event: "file_cleanup_root_resolution_failed",
                resolvedRoot,
                error: rootErr.message,
            });
            return;
        }

        // 3. Validación de ruta canónica real para el destino (resolviendo junctions/symlinks)
        let realTarget;
        try {
            realTarget = await fs.realpath(resolvedTarget);
        } catch (targetErr) {
            if (targetErr.code === "ENOENT") {
                // Archivo inexistente: tratamiento idempotente sin necesidad de eliminar
                return;
            }
            logger.error("Fallo al resolver la ruta real del archivo a eliminar", {
                event: "file_cleanup_target_resolution_failed",
                targetPath,
                resolvedTarget,
                error: targetErr.message,
            });
            return;
        }

        // 4. Comprobación de pertenencia canónica real contra la raíz real
        if (!isPathInside(realRoot, realTarget)) {
            logger.warning("Seguridad: Intento de eliminar archivo fuera del directorio de uploads mediante enlace", {
                event: "file_cleanup_security_violation",
                targetPath,
                realTarget,
                realRoot,
            });
            return;
        }

        // 5. Solo tras verificar satisfactoriamente ambas rutas se procede a eliminar
        await fs.unlink(resolvedTarget);
    } catch (err) {
        if (err.code !== "ENOENT") {
            logger.error("Fallo al eliminar archivo huérfano", {
                event: "file_cleanup_failed",
                targetPath,
                error: err.message,
            });
        }
    }
}

/**
 * Mueve un archivo validado desde el directorio temporal de staging a la subcarpeta
 * definitiva correspondiente (documents, licenses, proofs) con un nombre único generado por el servidor
 * y una extensión normalizada derivada estrictamente del tipo MIME verificado.
 */
export async function commitFile(file, category) {
    const root = path.resolve(config.UPLOAD_DIR);
    const targetDir = path.join(root, category);
    await fs.mkdir(targetDir, { recursive: true });

    // La extensión definitiva se deriva del MIME verificado; el nombre original solo es metadato
    const normalizedMime = file.mimetype?.toLowerCase();
    const finalExt = MIME_TO_EXTENSION[normalizedMime] || ".bin";
    const finalFilename = `${randomUUID()}${finalExt}`;
    const destinationPath = path.join(targetDir, finalFilename);

    await fs.rename(file.path, destinationPath);

    // Ruta relativa interna con separador forward-slash para portabilidad
    const relativePath = `${category}/${finalFilename}`.replace(/\\/g, "/");

    return {
        original_name: file.originalname,
        filename: finalFilename,
        path: relativePath,
        absolutePath: destinationPath,
        mimetype: file.mimetype,
        size: file.size,
    };
}

/**
 * Configuración de almacenamiento en disco para Multer (directorio temporal de staging).
 */
const multerStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const tempDir = path.join(path.resolve(config.UPLOAD_DIR), STORAGE_SUBFOLDERS.TEMP);
            await fs.mkdir(tempDir, { recursive: true });
            cb(null, tempDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const rawExt = path.extname(file.originalname || "").toLowerCase();
        const safeExt = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : ".tmp";
        cb(null, `staged-${randomUUID()}${safeExt}`);
    },
});

/**
 * Validador inicial de Multer (MIME y extensión básicos).
 */
const multerFileFilter = (req, file, cb) => {
    const mimetype = file.mimetype?.toLowerCase();
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (!ALLOWED_MIMETYPES.includes(mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(
            new AppError(
                ERROR_DICTIONARY.INVALID_FILE_TYPE,
                "El formato de archivo no es válido. Solo se admiten PDF, JPEG y PNG"
            )
        );
    }
    cb(null, true);
};

export const multerUpload = multer({
    storage: multerStorage,
    fileFilter: multerFileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
        fields: 10,
        parts: 20,
    },
});

/**
 * Fábrica de middlewares para captura de archivos individuales con limpieza automática en caso de error.
 */
export function createUploadMiddleware(fieldName) {
    const singleUpload = multerUpload.single(fieldName);

    return (req, res, next) => {
        singleUpload(req, res, async (err) => {
            if (err) {
                // Si Multer guardó un archivo en disco antes de fallar (ej. campo inesperado adicional o límite superado)
                if (req.file?.path) {
                    await safeUnlink(req.file.path);
                }
                return next(err);
            }
            next();
        });
    };
}

export const uploadDocumentMiddleware = createUploadMiddleware("document");
export const uploadProofMiddleware = createUploadMiddleware("proof");

export const storageService = {
    initStorage,
    verifyMagicBytes,
    safeUnlink,
    commitFile,
    isPathInside,
    MIME_TO_EXTENSION,
    createUploadMiddleware,
};
