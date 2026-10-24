import { deliveryModel } from "../models/delivery.model.js";

/**
 * Repositorio de Entregas para ShipNow API.
 * Encapsula el acceso directo a MongoDB/Mongoose para la entidad Delivery.
 */
export class DeliveriesRepository {
    async getAll({ filter = {}, skip = 0, limit = 20 } = {}) {
        return deliveryModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit)
            .populate("order").populate("driver", "first_name last_name role").lean();
    }
    async getById(id) {
        return deliveryModel.findById(id).populate("order").populate("driver", "first_name last_name role").lean();
    }
    async getForOrder(order) { return deliveryModel.findOne({ order }).lean(); }
    async orderIdsForDriver(driver) { return (await deliveryModel.find({ driver }, "order").lean()).map(d => d.order); }

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
