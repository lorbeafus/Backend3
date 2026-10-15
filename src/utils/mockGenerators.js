import { faker } from "@faker-js/faker";
import mongoose from "mongoose";
import {
    USER_ROLES,
    ORDER_STATUS,
    ORDER_PRIORITY,
    DELIVERY_STATUS,
} from "../constants/index.js";

/**
 * Generador de usuarios simulados.
 * Si se especifica withPasswordHash, genera un hash bcrypt real para persistencia.
 * Para endpoints de solo lectura/mock en memoria, nunca expone password ni hash.
 */
export const generateMockUser = ({ role = USER_ROLES.USER, fixedId = null, passwordHash = null } = {}) => {
    const id = fixedId || new mongoose.Types.ObjectId().toString();
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    // Unique identifier sufijado con nanosegundos / random para evitar colisiones
    const randomSuffix = Math.floor(Math.random() * 100000);
    const email = faker.internet.email({ firstName, lastName }).toLowerCase().replace("@", `_${Date.now()}_${randomSuffix}@`);

    const user = {
        _id: id,
        first_name: firstName,
        last_name: lastName,
        email,
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    if (passwordHash) {
        user.password = passwordHash;
    }

    return user;
};

/**
 * Generador de repartidores (Usuarios con rol DRIVER).
 */
export const generateMockDriver = ({ fixedId = null, passwordHash = null } = {}) => {
    return generateMockUser({ role: USER_ROLES.DRIVER, fixedId, passwordHash });
};

/**
 * Generador de pedidos simulados.
 * Requiere un userId (ObjectId string) asociado.
 */
export const generateMockOrder = ({ userId, fixedId = null } = {}) => {
    const id = fixedId || new mongoose.Types.ObjectId().toString();
    const itemCount = faker.number.int({ min: 1, max: 4 });
    const items = [];
    let totalAmount = 0;

    for (let i = 0; i < itemCount; i++) {
        const quantity = faker.number.int({ min: 1, max: 5 });
        const price = faker.number.int({ min: 500, max: 15000 });
        totalAmount += quantity * price;
        items.push({
            product_name: faker.commerce.productName(),
            quantity,
            price,
        });
    }

    const statuses = Object.values(ORDER_STATUS);
    const priorities = Object.values(ORDER_PRIORITY);

    return {
        _id: id,
        order_number: `ORD-${Date.now()}-${faker.string.alphanumeric(6).toUpperCase()}`,
        user: userId,
        items,
        total_amount: totalAmount,
        status: faker.helpers.arrayElement(statuses),
        priority: faker.helpers.arrayElement(priorities),
        shipping_address: {
            street: faker.location.streetAddress(),
            city: faker.location.city(),
            zip_code: faker.location.zipCode(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    };
};

/**
 * Generador de entregas simuladas.
 * Requiere orderId y orderStatus; los estados se derivan del pedido.
 * Regla de negocio: Si el estado es IN_PROGRESS o COMPLETED, driverId es obligatorio.
 */
export const generateMockDelivery = ({ orderId, orderStatus, driverId = null, fixedId = null } = {}) => {
    const id = fixedId || new mongoose.Types.ObjectId().toString();
    const deliveryStatusByOrder = {
        [ORDER_STATUS.PENDING]: DELIVERY_STATUS.ASSIGNED,
        [ORDER_STATUS.IN_TRANSIT]: DELIVERY_STATUS.IN_PROGRESS,
        [ORDER_STATUS.DELIVERED]: DELIVERY_STATUS.COMPLETED,
        [ORDER_STATUS.CANCELLED]: DELIVERY_STATUS.FAILED,
    };
    if (!Object.hasOwn(deliveryStatusByOrder, orderStatus)) {
        throw new Error("Estado de pedido inválido para generar una entrega");
    }
    const status = deliveryStatusByOrder[orderStatus];
    if ([DELIVERY_STATUS.IN_PROGRESS, DELIVERY_STATUS.COMPLETED].includes(status) && !driverId) {
        throw new Error("Una entrega en curso o completada requiere un repartidor");
    }

    return {
        _id: id,
        tracking_code: `TRK-${Date.now()}-${faker.string.alphanumeric(8).toUpperCase()}`,
        order: orderId,
        driver: driverId || null,
        status,
        estimated_delivery_date: faker.date.soon({ days: 5 }),
        delivery_notes: faker.helpers.arrayElement([
            "Entregar en recepción",
            "Tocar timbre 2B",
            "Dejar en portería",
            "Llamar antes de entregar",
            "",
        ]),
        createdAt: new Date(),
        updatedAt: new Date(),
    };
};
