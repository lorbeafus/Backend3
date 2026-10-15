import { orderModel } from "../models/order.model.js";

/**
 * Repositorio de Pedidos para ShipNow API.
 * Encapsula el acceso directo a MongoDB/Mongoose para la entidad Order.
 */
export class OrdersRepository {
    async getAll({ filter = {}, projection = null, sort = { createdAt: -1 } } = {}) {
        return await orderModel.find(filter, projection).sort(sort).populate("user", "-password").lean();
    }

    async getById(id, projection = null) {
        return await orderModel.findById(id, projection).populate("user", "-password").lean();
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
