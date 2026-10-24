import { AppError } from "./errors.js";
import { ERROR_DICTIONARY as E, DELIVERY_STATUS_BY_ORDER } from "../constants/index.js";
import { assertBodyObject, isNonEmptyString } from "./validation.js";
export const invalid = message => new AppError(E.INVALID_INPUT_DATA, message);
export function strictBody(body, allowed) {
    assertBodyObject(body);
    if (Object.keys(body).some(k => !allowed.includes(k))) throw invalid("La petición contiene campos no permitidos");
}
export function text(value, field, max = 200) {
    if (!isNonEmptyString(value) || value.trim().length > max) throw invalid(`El campo ${field} debe ser texto válido de hasta ${max} caracteres`);
    return value.trim();
}
export function pagination(query = {}) {
    if (Object.keys(query).some(k => !["page", "limit"].includes(k))) throw invalid("Filtro no permitido");
    const parse = (v, fallback, max) => {
        if (v === undefined) return fallback;
        if (typeof v !== "string" || !/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 1 || Number(v) > max) throw invalid("Paginación inválida");
        return Number(v);
    };
    const page = parse(query.page, 1, 10000), limit = parse(query.limit, 20, 100);
    return { skip: (page - 1) * limit, limit, page };
}
export function deliveryView(delivery) {
    const { assignment_key: _key, __v: _v, ...safe } = delivery;
    return { ...safe, status: delivery.order ? DELIVERY_STATUS_BY_ORDER[delivery.order.status] : null };
}
