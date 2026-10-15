import { deliveryModel } from "../models/delivery.model.js";

/**
 * Repositorio de Entregas para ShipNow API.
 * Encapsula el acceso directo a MongoDB/Mongoose para la entidad Delivery.
 */
export class DeliveriesRepository {
    async getAll({ filter = {}, projection = null, sort = { createdAt: -1 } } = {}) {
        return await deliveryModel
            .find(filter, projection)
            .sort(sort)
            .populate("order")
            .populate("driver", "-password")
            .lean();
    }

    async getById(id, projection = null) {
        return await deliveryModel
            .findById(id, projection)
            .populate("order")
            .populate("driver", "-password")
            .lean();
    }

    async create(deliveryData) {
        return await deliveryModel.create(deliveryData);
    }

    async insertMany(deliveries) {
        return await deliveryModel.insertMany(deliveries);
    }

    async count(filter = {}) {
        return await deliveryModel.countDocuments(filter);
    }
}

export const deliveriesRepository = new DeliveriesRepository();
