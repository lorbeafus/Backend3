import { productsRepository } from "../repositories/products.repository.js";
import { PRODUCT_STATUS } from "../constants/index.js";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Servicio de Productos para ShipNow API.
 * Concentra las decisiones de negocio, reglas de validación de precios/stock,
 * transiciones de estado y verificación de existencia.
 * No depende de Express (no recibe req ni res).
 */
export class ProductsService {
    _validateId(id) {
        if (!id || !OBJECT_ID_REGEX.test(id)) {
            const error = new Error("El ID proporcionado no es un identificador válido");
            error.statusCode = 400;
            throw error;
        }
    }

    async getProducts(query = {}) {
        const filter = {};

        // Filtrado opcional por estado
        if (query.status) {
            const validStatuses = Object.values(PRODUCT_STATUS);
            if (!validStatuses.includes(query.status)) {
                const error = new Error(`Estado no válido. Los estados permitidos son: ${validStatuses.join(", ")}`);
                error.statusCode = 400;
                throw error;
            }
            filter.status = query.status;
        }

        // Filtrado opcional por rango de precio
        if (query.minPrice !== undefined || query.maxPrice !== undefined) {
            filter.price = {};
            if (query.minPrice !== undefined) {
                const min = Number(query.minPrice);
                if (isNaN(min) || min < 0) {
                    const error = new Error("minPrice debe ser un número mayor o igual a 0");
                    error.statusCode = 400;
                    throw error;
                }
                filter.price.$gte = min;
            }
            if (query.maxPrice !== undefined) {
                const max = Number(query.maxPrice);
                if (isNaN(max) || max < 0) {
                    const error = new Error("maxPrice debe ser un número mayor o igual a 0");
                    error.statusCode = 400;
                    throw error;
                }
                filter.price.$lte = max;
            }
            if (query.minPrice !== undefined && query.maxPrice !== undefined && Number(query.minPrice) > Number(query.maxPrice)) {
                const error = new Error("minPrice no puede ser mayor que maxPrice");
                error.statusCode = 400;
                throw error;
            }
        }

        // Búsqueda por coincidencia en nombre
        if (query.search && query.search.trim() !== "") {
            filter.name = { $regex: query.search.trim(), $options: "i" };
        }

        return await productsRepository.getAll({ filter });
    }

    async getProductById(id) {
        this._validateId(id);
        const product = await productsRepository.getById(id);
        if (!product) {
            const error = new Error("Producto no encontrado");
            error.statusCode = 404;
            throw error;
        }
        return product;
    }

    async createProduct(productData) {
        const { name, description, price, stock, status } = productData;

        if (!name || typeof name !== "string" || name.trim() === "") {
            const error = new Error("El nombre del producto es obligatorio");
            error.statusCode = 400;
            throw error;
        }

        if (!description || typeof description !== "string" || description.trim() === "") {
            const error = new Error("La descripción del producto es obligatoria");
            error.statusCode = 400;
            throw error;
        }

        const parsedPrice = Number(price);
        if (price === undefined || isNaN(parsedPrice) || parsedPrice <= 0) {
            const error = new Error("El precio debe ser un número positivo mayor a 0");
            error.statusCode = 400;
            throw error;
        }

        const parsedStock = Number(stock);
        if (stock === undefined || isNaN(parsedStock) || !Number.isInteger(parsedStock) || parsedStock < 0) {
            const error = new Error("El stock debe ser un número entero mayor o igual a 0");
            error.statusCode = 400;
            throw error;
        }

        let productStatus = status;
        if (status) {
            if (!Object.values(PRODUCT_STATUS).includes(status)) {
                const error = new Error(`Estado no válido. Use: ${Object.values(PRODUCT_STATUS).join(", ")}`);
                error.statusCode = 400;
                throw error;
            }
        } else {
            productStatus = parsedStock === 0 ? PRODUCT_STATUS.OUT_OF_STOCK : PRODUCT_STATUS.AVAILABLE;
        }

        // Si se carga con stock 0, coherencia de dominio
        if (parsedStock === 0) {
            productStatus = PRODUCT_STATUS.OUT_OF_STOCK;
        }

        const newProduct = {
            name: name.trim(),
            description: description.trim(),
            price: parsedPrice,
            stock: parsedStock,
            status: productStatus,
        };

        return await productsRepository.create(newProduct);
    }

    async updateProduct(id, updateData) {
        this._validateId(id);

        const existing = await productsRepository.getById(id);
        if (!existing) {
            const error = new Error("Producto no encontrado");
            error.statusCode = 404;
            throw error;
        }

        const dataToUpdate = {};

        if (updateData.name !== undefined) {
            if (typeof updateData.name !== "string" || updateData.name.trim() === "") {
                const error = new Error("El nombre no puede estar vacío");
                error.statusCode = 400;
                throw error;
            }
            dataToUpdate.name = updateData.name.trim();
        }

        if (updateData.description !== undefined) {
            if (typeof updateData.description !== "string" || updateData.description.trim() === "") {
                const error = new Error("La descripción no puede estar vacía");
                error.statusCode = 400;
                throw error;
            }
            dataToUpdate.description = updateData.description.trim();
        }

        if (updateData.price !== undefined) {
            const parsedPrice = Number(updateData.price);
            if (isNaN(parsedPrice) || parsedPrice <= 0) {
                const error = new Error("El precio debe ser un número mayor a 0");
                error.statusCode = 400;
                throw error;
            }
            dataToUpdate.price = parsedPrice;
        }

        if (updateData.stock !== undefined) {
            const parsedStock = Number(updateData.stock);
            if (isNaN(parsedStock) || !Number.isInteger(parsedStock) || parsedStock < 0) {
                const error = new Error("El stock debe ser un número entero mayor o igual a 0");
                error.statusCode = 400;
                throw error;
            }
            dataToUpdate.stock = parsedStock;

            // Coherencia de estado al modificar stock
            if (parsedStock === 0 && !updateData.status) {
                dataToUpdate.status = PRODUCT_STATUS.OUT_OF_STOCK;
            } else if (parsedStock > 0 && existing.status === PRODUCT_STATUS.OUT_OF_STOCK && !updateData.status) {
                dataToUpdate.status = PRODUCT_STATUS.AVAILABLE;
            }
        }

        if (updateData.status !== undefined) {
            if (!Object.values(PRODUCT_STATUS).includes(updateData.status)) {
                const error = new Error(`Estado no válido. Use: ${Object.values(PRODUCT_STATUS).join(", ")}`);
                error.statusCode = 400;
                throw error;
            }
            dataToUpdate.status = updateData.status;
        }

        return await productsRepository.update(id, dataToUpdate);
    }

    async deleteProduct(id) {
        this._validateId(id);

        const existing = await productsRepository.getById(id);
        if (!existing) {
            const error = new Error("Producto no encontrado");
            error.statusCode = 404;
            throw error;
        }

        return await productsRepository.delete(id);
    }
}

export const productsService = new ProductsService();
