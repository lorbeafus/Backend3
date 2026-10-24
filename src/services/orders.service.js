import { randomUUID } from "node:crypto";
import { ordersRepository } from "../repositories/orders.repository.js";
import { deliveriesRepository } from "../repositories/deliveries.repository.js";
import { usersRepository } from "../repositories/users.repository.js";
import { productsRepository } from "../repositories/products.repository.js";
import { AppError } from "../utils/errors.js";
import { assertValidId } from "../utils/validation.js";
import { strictBody, text, pagination, invalid } from "../utils/logistics.validation.js";
import { USER_ROLES as R, ORDER_STATUS as O, ORDER_PRIORITY as P, PRODUCT_STATUS, ERROR_DICTIONARY as E } from "../constants/index.js";
export const ordersService = {
    async list(actor, query) {
        const paging = pagination(query);
        const filter = actor.role === R.ADMIN ? {} : actor.role === R.DRIVER
            ? { _id: { $in: await deliveriesRepository.orderIdsForDriver(actor._id) } } : { user: actor._id };
        return { items: await ordersRepository.getAll({ filter, ...paging }), page: paging.page, limit: paging.limit };
    },
    async get(id, actor) {
        assertValidId(id);
        const order = await ordersRepository.getById(id);
        if (!order) throw new AppError(E.ORDER_NOT_FOUND);
        let permitted = actor.role === R.ADMIN || String(order.user) === String(actor._id);
        if (!permitted && actor.role === R.DRIVER) {
            const delivery = await deliveriesRepository.getForOrder(id);
            permitted = delivery && String(delivery.driver) === String(actor._id);
        }
        if (!permitted) throw new AppError(E.INSUFFICIENT_PERMISSIONS);
        return order;
    },
    async create(body, actor) {
        strictBody(body, ["user", "items", "shipping_address", "priority"]);
        if (actor.role === R.DRIVER) throw new AppError(E.INSUFFICIENT_PERMISSIONS);
        if (body.user !== undefined && actor.role !== R.ADMIN) throw new AppError(E.INSUFFICIENT_PERMISSIONS);
        const userId = body.user ?? String(actor._id);
        assertValidId(userId);
        const user = await usersRepository.getById(userId);
        if (!user) throw new AppError(E.USER_NOT_FOUND);
        if (user.role !== R.USER) throw invalid("Los pedidos deben pertenecer a un usuario cliente");
        const priority = body.priority ?? P.MEDIUM;
        if (!Object.values(P).includes(priority)) throw new AppError(E.INVALID_DOMAIN_STATE);
        strictBody(body.shipping_address, ["street", "city", "zip_code"]);
        const shipping_address = Object.fromEntries(["street", "city", "zip_code"].map(k => [k, text(body.shipping_address[k], k)]));
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw invalid("El pedido requiere entre 1 y 50 ítems");
        const seen = new Set(), items = []; let cents = 0;
        for (const item of body.items) {
            strictBody(item, ["product", "quantity"]); assertValidId(item.product);
            if (seen.has(item.product.toLowerCase())) throw invalid("No se permiten productos repetidos");
            seen.add(item.product.toLowerCase());
            if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) throw invalid("Cantidad inválida: entero entre 1 y 1000");
            const product = await productsRepository.getById(item.product);
            if (!product) throw new AppError(E.PRODUCT_NOT_FOUND);
            if (product.status !== PRODUCT_STATUS.AVAILABLE || product.stock < item.quantity) throw new AppError(E.DOMAIN_CONFLICT, "Producto sin disponibilidad suficiente");
            const unitCents = Math.round(product.price * 100);
            if (!Number.isSafeInteger(unitCents) || unitCents < 0) throw invalid("Precio de producto inválido");
            cents += unitCents * item.quantity;
            if (!Number.isSafeInteger(cents)) throw invalid("Total fuera de rango");
            items.push({ product: product._id, product_name: product.name, price: unitCents / 100, quantity: item.quantity });
        }
        const order = await ordersRepository.create({ user: userId, order_number: `ORD-${randomUUID()}`,
            items, total_amount: cents / 100, priority, status: O.PENDING, shipping_address });
        return order;
    },
    async cancel(id, body, actor) {
        strictBody(body, ["status"]);
        if (body.status !== O.CANCELLED) throw new AppError(E.INVALID_DOMAIN_STATE, "Esta ruta solo permite cancelar; el avance se gestiona desde entregas");
        const order = await this.get(id, actor);
        if (actor.role === R.DRIVER) throw new AppError(E.INSUFFICIENT_PERMISSIONS);
        if (order.status === O.CANCELLED) return order;
        if (![O.PENDING, O.IN_TRANSIT].includes(order.status) || (actor.role !== R.ADMIN && order.status !== O.PENDING)) throw new AppError(E.DOMAIN_CONFLICT);
        const updated = await ordersRepository.transition(id, order.status, O.CANCELLED);
        if (!updated) throw new AppError(E.DOMAIN_CONFLICT);
        return updated;
    },
};
