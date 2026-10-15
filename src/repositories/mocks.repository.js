import { usersRepository } from "./users.repository.js";
import { ordersRepository } from "./orders.repository.js";
import { deliveriesRepository } from "./deliveries.repository.js";

/** Carga secuencial por documento: detiene la ejecución en el primer fallo.
 * Los contadores incluyen las escrituras confirmadas dentro de la fase fallida.
 * No usa transacciones, rollback ni reintentos automáticos.
 */
export class MocksRepository {
    async insertSeedData({ users, drivers, orders, deliveries }) {
        const insertedCounts = { users: 0, drivers: 0, orders: 0, deliveries: 0 };
        const phases = [
            ["users", users, (doc) => usersRepository.create(doc)],
            ["drivers", drivers, (doc) => usersRepository.create(doc)],
            ["orders", orders, (doc) => ordersRepository.create(doc)],
            ["deliveries", deliveries, (doc) => deliveriesRepository.create(doc)],
        ];
        for (const [phase, documents, insert] of phases) {
            try {
                for (const document of documents) {
                    await insert(document);
                    insertedCounts[phase]++;
                }
            } catch (error) {
                error.phase = phase;
                error.insertedCounts = { ...insertedCounts };
                throw error;
            }
        }
        return {
            ...insertedCounts,
            total: Object.values(insertedCounts).reduce((sum, count) => sum + count, 0),
        };
    }
}

export const mocksRepository = new MocksRepository();
