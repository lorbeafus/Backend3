import { userModel } from "../models/user.model.js";

/**
 * Repositorio de Usuarios para ShipNow API.
 * Encapsula el acceso directo a Mongoose/MongoDB, integrando la persistencia
 * y aplicando filtros y proyecciones por defecto (omitiendo contraseña en consultas habituales).
 * Evita el patrón "pasamanos".
 */
export class UsersRepository {
    async getAll({ filter = {}, projection = "-password", sort = { createdAt: -1 } } = {}) {
        return await userModel.find(filter, projection).sort(sort).lean();
    }

    async getById(id, projection = "-password") {
        return await userModel.findById(id, projection).lean();
    }

    // Alias compatible
    async getUserById(id, projection = "-password") {
        return await this.getById(id, projection);
    }

    async getByEmail(email, projection = null) {
        return await userModel.findOne({ email }, projection).lean();
    }

    // Alias compatible
    async findByEmail(email, projection = null) {
        return await this.getByEmail(email, projection);
    }

    async create(userData) {
        return await userModel.create(userData);
    }

    // Alias compatible
    async createUser(userData) {
        return await this.create(userData);
    }

    async update(id, updateData, projection = "-password") {
        return await userModel.findByIdAndUpdate(id, updateData, {
            returnDocument: "after",
            runValidators: true,
            select: projection,
        }).lean();
    }

    async delete(id) {
        return await userModel.findByIdAndDelete(id).lean();
    }
}

export const usersRepository = new UsersRepository();
