import { AppError } from "./errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const NUMERIC_STRING_REGEX = /^-?\d+(\.\d+)?$/;

export const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

export const assertValidId = (id) => {
    if (typeof id !== "string" || !OBJECT_ID_REGEX.test(id)) {
        throw new AppError(
            ERROR_DICTIONARY.INVALID_ID,
            "El ID proporcionado no es un identificador válido",
            { details: { field: "id" } }
        );
    }
};

/**
 * Garantiza que el cuerpo recibido sea un objeto JSON (no undefined, null, array ni primitivo).
 * Con Express 5, req.body es undefined si la petición no trae cuerpo.
 */
export const assertBodyObject = (body) => {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError(
            ERROR_DICTIONARY.INVALID_JSON_BODY,
            "El cuerpo de la petición debe ser un objeto JSON"
        );
    }
};

/**
 * Convierte a número solo si el tipo original es number o string numérico.
 * Rechaza null, booleanos, arrays, objetos, strings vacíos o no numéricos (devuelve NaN).
 */
export const parseNumber = (value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && NUMERIC_STRING_REGEX.test(value.trim())) return Number(value.trim());
    return NaN;
};

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Valida un parámetro de cantidad (qty) como entero positivo dentro de un rango [1, maxLimit].
 * Rechaza parámetros repetidos (arrays), strings no enteros, valores <= 0 o > maxLimit.
 */
export const parsePositiveIntegerQty = (rawQty, defaultQty = 10, maxLimit = 100) => {
    if (rawQty === undefined) return defaultQty;
    if (Array.isArray(rawQty)) {
        throw new AppError(
            ERROR_DICTIONARY.INVALID_MOCK_QUANTITY,
            "El parámetro 'qty' no puede repetirse",
            { details: { field: "qty" } }
        );
    }
    const parsed = parseNumber(rawQty);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new AppError(
            ERROR_DICTIONARY.INVALID_MOCK_QUANTITY,
            "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
            { details: { field: "qty", min: 1 } }
        );
    }
    if (parsed > maxLimit) {
        throw new AppError(
            ERROR_DICTIONARY.INVALID_MOCK_QUANTITY,
            `El parámetro 'qty' no puede superar el límite máximo de ${maxLimit}`,
            { details: { field: "qty", limit: maxLimit } }
        );
    }
    return parsed;
};

/** Valida bcrypt sin recortar ni transformar la contraseña recibida. */
export const assertPassword = (password, { registration = false } = {}) => {
    if (typeof password !== "string" || password.trim() === "") {
        throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA,
            "La contraseña debe contener texto y no puede estar formada solo por espacios",
            { details: { field: "password" } });
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
        throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA,
            "La contraseña no puede superar 72 bytes UTF-8",
            { details: { field: "password", max: 72 } });
    }
    if (registration && password.length < 6) {
        throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA,
            "La contraseña debe tener al menos 6 caracteres",
            { details: { field: "password", min: 6 } });
    }
};
