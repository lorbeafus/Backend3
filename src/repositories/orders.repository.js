import { orderModel } from "../models/order.model.js";

/**
 * Repositorio de Pedidos para ShipNow API.
 * Encapsula el acceso directo a MongoDB/Mongoose para la entidad Order.
 */
export class OrdersRepository {
    async getAll({ filter = {}, skip = 0, limit = 20 } = {}) {
        return orderModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit)
            .populate("user", "first_name last_name role").lean();
    }
    async getById(id) { return orderModel.findById(id).lean(); }
    async idsForUser(user) { return (await orderModel.find({ user }, "_id").lean()).map(o => o._id); }
    async transition(id, expectedStatus, nextStatus) {
        return orderModel.findOneAndUpdate({ _id: id, status: expectedStatus }, { $set: { status: nextStatus } },
            { returnDocument: "after", runValidators: true }).lean();
    }

    async create(orderData) {
        return await orderModel.create(orderData);
    }

    async insertMany(orders) {
        return await orderModel.insertMany(orders);
    }

    async count(filter = {}) {
        return await orderModel.countDocuments(filter);
    }
}

export const ordersRepository = new OrdersRepository();
