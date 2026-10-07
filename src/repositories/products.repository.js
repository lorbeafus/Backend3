import { productModel } from "../models/product.model.js";

/**
 * Repositorio de Productos para ShipNow API.
 * Encapsula todo el acceso a Mongoose/MongoDB, proyecciones, ordenamiento
 * y filtros, evitando ser un pasamanos vacío y sin albergar lógica de negocio.
 */
export class ProductsRepository {
    async getAll({ filter = {}, projection = null, sort = { createdAt: -1 } } = {}) {
        return await productModel.find(filter, projection).sort(sort).lean();
    }

    async getById(id, projection = null) {
        return await productModel.findById(id, projection).lean();
    }

    async create(productData) {
        return await productModel.create(productData);
    }

    async update(id, updateData) {
        return await productModel.findByIdAndUpdate(id, updateData, {
            returnDocument: "after",
            runValidators: true,
        }).lean();
    }

    async delete(id) {
        return await productModel.findByIdAndDelete(id).lean();
    }

    async count(filter = {}) {
        return await productModel.countDocuments(filter);
    }
}

export const productsRepository = new ProductsRepository();
