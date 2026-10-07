import { httpError } from "./errors.js";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const NUMERIC_STRING_REGEX = /^-?\d+(\.\d+)?$/;

export const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

export const assertValidId = (id) => {
    if (typeof id !== "string" || !OBJECT_ID_REGEX.test(id)) {
        throw httpError(400, "El ID proporcionado no es un identificador válido");
    }
};

/**
 * Garantiza que el cuerpo recibido sea un objeto JSON (no undefined, null, array ni primitivo).
 * Con Express 5, req.body es undefined si la petición no trae cuerpo.
 */
export const assertBodyObject = (body) => {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw httpError(400, "El cuerpo de la petición debe ser un objeto JSON");
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
