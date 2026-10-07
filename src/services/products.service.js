import { productsRepository } from "../repositories/products.repository.js";
import { PRODUCT_STATUS } from "../constants/index.js";
import { httpError } from "../utils/errors.js";
import {
    assertBodyObject,
    assertValidId,
    escapeRegex,
    isNonEmptyString,
    parseNumber,
} from "../utils/validation.js";

const MAX_SEARCH_LENGTH = 100;

/**
 * Servicio de Productos para ShipNow API.
 * Concentra las decisiones de negocio, reglas de validación de precios/stock,
 * derivación del estado y verificación de existencia.
 * No depende de Express (no recibe req ni res).
 *
 * Regla de dominio: `status` lo calcula siempre el servidor a partir del stock final
 * (stock 0 → OUT_OF_STOCK, stock > 0 → AVAILABLE). Si el cliente envía `status` en el body, se ignora.
 */
export class ProductsService {
    _deriveStatus(stock) {
        return stock === 0 ? PRODUCT_STATUS.OUT_OF_STOCK : PRODUCT_STATUS.AVAILABLE;
    }

    _parsePrice(value) {
        const price = parseNumber(value);
        if (!Number.isFinite(price) || price <= 0) {
            throw httpError(400, "El precio debe ser un número mayor a 0");
        }
        return price;
    }

    _parseStock(value) {
        const stock = parseNumber(value);
        if (!Number.isInteger(stock) || stock < 0) {
            throw httpError(400, "El stock debe ser un número entero mayor o igual a 0");
        }
        return stock;
    }

    _parseFilterNumber(value, label) {
        const number = parseNumber(value);
        if (!Number.isFinite(number) || number < 0) {
            throw httpError(400, `${label} debe ser un número mayor o igual a 0`);
        }
        return number;
    }

    async getProducts(query = {}) {
        const filter = {};
        const { status, minPrice, maxPrice, search } = query ?? {};

        if (status !== undefined) {
            const validStatuses = Object.values(PRODUCT_STATUS);
            if (typeof status !== "string" || !validStatuses.includes(status)) {
                throw httpError(400, `Estado no válido. Los estados permitidos son: ${validStatuses.join(", ")}`);
            }
            filter.status = status;
        }

        if (minPrice !== undefined || maxPrice !== undefined) {
            filter.price = {};
            if (minPrice !== undefined) filter.price.$gte = this._parseFilterNumber(minPrice, "minPrice");
            if (maxPrice !== undefined) filter.price.$lte = this._parseFilterNumber(maxPrice, "maxPrice");
            if (minPrice !== undefined && maxPrice !== undefined && filter.price.$gte > filter.price.$lte) {
                throw httpError(400, "minPrice no puede ser mayor que maxPrice");
            }
        }

        if (search !== undefined) {
            if (typeof search !== "string") {
                throw httpError(400, "search debe ser un texto");
            }
            const term = search.trim();
            if (term.length > MAX_SEARCH_LENGTH) {
                throw httpError(400, `search no puede superar los ${MAX_SEARCH_LENGTH} caracteres`);
            }
            if (term !== "") {
                // Se escapan los caracteres especiales: la búsqueda es por texto literal, no por regex.
                filter.name = { $regex: escapeRegex(term), $options: "i" };
            }
        }

        return await productsRepository.getAll({ filter });
    }

    async getProductById(id) {
        assertValidId(id);
        const product = await productsRepository.getById(id);
        if (!product) {
            throw httpError(404, "Producto no encontrado");
        }
        return product;
    }

    async createProduct(productData) {
        assertBodyObject(productData);
        const { name, description, price, stock } = productData;

        if (!isNonEmptyString(name)) {
            throw httpError(400, "El nombre del producto es obligatorio");
        }
        if (!isNonEmptyString(description)) {
            throw httpError(400, "La descripción del producto es obligatoria");
        }

        const parsedPrice = this._parsePrice(price);
        const parsedStock = this._parseStock(stock);

        return await productsRepository.create({
            name: name.trim(),
            description: description.trim(),
            price: parsedPrice,
            stock: parsedStock,
            status: this._deriveStatus(parsedStock),
        });
    }

    async updateProduct(id, updateData) {
        assertValidId(id);
        assertBodyObject(updateData);

        const existing = await productsRepository.getById(id);
        if (!existing) {
            throw httpError(404, "Producto no encontrado");
        }

        const dataToUpdate = {};

        if (updateData.name !== undefined) {
            if (!isNonEmptyString(updateData.name)) {
                throw httpError(400, "El nombre no puede estar vacío");
            }
            dataToUpdate.name = updateData.name.trim();
        }

        if (updateData.description !== undefined) {
            if (!isNonEmptyString(updateData.description)) {
                throw httpError(400, "La descripción no puede estar vacía");
            }
            dataToUpdate.description = updateData.description.trim();
        }

        if (updateData.price !== undefined) {
            dataToUpdate.price = this._parsePrice(updateData.price);
        }

        if (updateData.stock !== undefined) {
            dataToUpdate.stock = this._parseStock(updateData.stock);
        }

        if (Object.keys(dataToUpdate).length === 0) {
            throw httpError(400, "Debe enviar al menos un campo modificable: name, description, price o stock");
        }

        // El estado siempre se recalcula a partir del stock final.
        const finalStock = dataToUpdate.stock !== undefined ? dataToUpdate.stock : existing.stock;
        dataToUpdate.status = this._deriveStatus(finalStock);

        return await productsRepository.update(id, dataToUpdate);
    }

    async deleteProduct(id) {
        assertValidId(id);

        const existing = await productsRepository.getById(id);
        if (!existing) {
            throw httpError(404, "Producto no encontrado");
        }

        return await productsRepository.delete(id);
    }
}

export const productsService = new ProductsService();
