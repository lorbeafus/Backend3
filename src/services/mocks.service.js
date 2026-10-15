import { mocksRepository } from "../repositories/mocks.repository.js";
import { USER_ROLES } from "../constants/index.js";
import { createHash } from "../utils/hash.js";
import { httpError } from "../utils/errors.js";
import { config } from "../config/index.js";
import { parsePositiveIntegerQty } from "../utils/validation.js";
import {
    generateMockUser,
    generateMockDriver,
    generateMockOrder,
    generateMockDelivery,
} from "../utils/mockGenerators.js";

const DEFAULT_MOCK_PASSWORD = "mockPassword123";

/**
 * Servicio de Mocking para ShipNow API (Preentrega 2 - Módulo 2).
 * Provee:
 * 1. Generación de datos simulados en memoria (sin persistir en MongoDB).
 * 2. Carga controlada (seed) en MongoDB, delegada en mocksRepository,
 *    restringida a ADMIN y bloqueada en production.
 *
 * Arquitectura: Este servicio NO importa Mongoose ni manipula sesiones de base de datos.
 */
export class MocksService {
    /**
     * Genera usuarios cliente simulados en memoria.
     * Nunca devuelve contraseñas ni hashes.
     */
    getMockUsers(rawQty) {
        const qty = parsePositiveIntegerQty(rawQty, 10, 100);
        const users = [];
        for (let i = 0; i < qty; i++) {
            users.push(generateMockUser({ role: USER_ROLES.USER }));
        }
        return users;
    }

    /**
     * Genera repartidores simulados en memoria (Usuarios con rol DRIVER).
     * Nunca devuelve contraseñas ni hashes.
     */
    getMockDrivers(rawQty) {
        const qty = parsePositiveIntegerQty(rawQty, 10, 100);
        const drivers = [];
        for (let i = 0; i < qty; i++) {
            drivers.push(generateMockDriver());
        }
        return drivers;
    }

    /**
     * Genera pedidos simulados en memoria.
     * Retorna los pedidos y, para garantizar la verificabilidad de referencias,
     * incluye los usuarios generados en memoria asociados.
     */
    getMockOrders(rawQty) {
        const qty = parsePositiveIntegerQty(rawQty, 10, 100);
        const users = [];
        const orders = [];

        for (let i = 0; i < qty; i++) {
            const user = generateMockUser({ role: USER_ROLES.USER });
            users.push(user);
            const order = generateMockOrder({ userId: user._id });
            orders.push(order);
        }

        return {
            orders,
            related_users: users,
        };
    }

    /**
     * Genera entregas simuladas en memoria.
     * Retorna las entregas y las entidades relacionadas generadas en memoria
     * (pedidos, clientes y repartidores).
     */
    getMockDeliveries(rawQty) {
        const qty = parsePositiveIntegerQty(rawQty, 10, 100);
        const users = [];
        const drivers = [];
        const orders = [];
        const deliveries = [];

        for (let i = 0; i < qty; i++) {
            const user = generateMockUser({ role: USER_ROLES.USER });
            users.push(user);
            const driver = generateMockDriver();
            drivers.push(driver);

            const order = generateMockOrder({ userId: user._id });
            orders.push(order);

            const delivery = generateMockDelivery({ orderId: order._id, orderStatus: order.status, driverId: driver._id });
            deliveries.push(delivery);
        }

        return {
            deliveries,
            related_orders: orders,
            related_drivers: drivers,
            related_users: users,
        };
    }

    /**
     * Inserción controlada de datos de prueba en MongoDB.
     * - Restringido contra producción.
     * - qty define la escala: inserta `qty` usuarios cliente, `qty` repartidores (DRIVER),
     *   `qty` pedidos asociados a esos usuarios, y `qty` entregas asociadas a esos pedidos y repartidores.
     * - Total de documentos insertados: 4 * qty.
     * - Las contraseñas se hashean con bcrypt y NUNCA se devuelven en la respuesta.
     * - No borra registros existentes y evita colisiones de email mediante sufijos únicos y timestamps.
     * - Delega la persistencia enteramente en mocksRepository sin importar Mongoose.
     */
    async seedDatabase(rawQty) {
        if (config.NODE_ENV === "production") {
            throw httpError(403, "La generación de datos de prueba (seed) está estrictamente deshabilitada en el entorno de producción");
        }

        const qty = parsePositiveIntegerQty(rawQty, 10, 50);

        // Generar un hash de bcrypt para los usuarios a insertar
        const passwordHash = await createHash(DEFAULT_MOCK_PASSWORD);

        const usersToInsert = [];
        const driversToInsert = [];
        const ordersToInsert = [];
        const deliveriesToInsert = [];

        for (let i = 0; i < qty; i++) {
            const user = generateMockUser({ role: USER_ROLES.USER, passwordHash });
            usersToInsert.push(user);

            const driver = generateMockDriver({ passwordHash });
            driversToInsert.push(driver);

            const order = generateMockOrder({ userId: user._id });
            ordersToInsert.push(order);

            const delivery = generateMockDelivery({ orderId: order._id, orderStatus: order.status, driverId: driver._id });
            deliveriesToInsert.push(delivery);
        }

        try {
            const inserted = await mocksRepository.insertSeedData({
                users: usersToInsert,
                drivers: driversToInsert,
                orders: ordersToInsert,
                deliveries: deliveriesToInsert,
            });

            return {
                inserted,
                scale_qty: qty,
                message: `Carga de prueba ejecutada exitosamente (${inserted.total} documentos insertados respetando integridad referencial)`,
            };
        } catch (error) {
            // Ante un fallo parcial en la inserción secuencial, no se informa éxito
            // ni se reintenta automáticamente para no duplicar datos
            const phaseMsg = error.phase ? ` en la fase '${error.phase}'` : "";
            const countsMsg = error.insertedCounts
                ? ` (documentos insertados antes del fallo: ${JSON.stringify(error.insertedCounts)})`
                : "";
            
            const err = new Error(`Error en la carga de datos de prueba${phaseMsg}: ${error.message}${countsMsg}`);
            err.statusCode = error.statusCode || (error.code === 11000 ? 409 :
                ["ValidationError", "CastError"].includes(error.name) ? 400 : 500);
            err.phase = error.phase;
            err.insertedCounts = error.insertedCounts;
            throw err;
        }
    }
}

export const mocksService = new MocksService();
