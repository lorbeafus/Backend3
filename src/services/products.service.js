import { productsRepository } from "../repositories/products.repository.js";
import { PRODUCT_STATUS, ERROR_DICTIONARY } from "../constants/index.js";
import { AppError } from "../utils/errors.js";
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
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "El precio debe ser un número mayor a 0", {
                details: { field: "price", min: 1 },
            });
        }
        return price;
    }

    _parseStock(value) {
        const stock = parseNumber(value);
        if (!Number.isInteger(stock) || stock < 0) {
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "El stock debe ser un número entero mayor o igual a 0", {
                details: { field: "stock", min: 0 },
            });
        }
        return stock;
    }

    _parseFilterNumber(value, label) {
        const number = parseNumber(value);
        if (!Number.isFinite(number) || number < 0) {
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, `${label} debe ser un número mayor o igual a 0`, {
                details: { field: label, min: 0 },
            });
        }
        return number;
    }

    async getProducts(query = {}) {
        const filter = {};
        const { status, minPrice, maxPrice, search } = query ?? {};

        if (status !== undefined) {
            const validStatuses = Object.values(PRODUCT_STATUS);
            if (typeof status !== "string" || !validStatuses.includes(status)) {
                throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, `Estado no válido. Los estados permitidos son: ${validStatuses.join(", ")}`, {
                    details: { field: "status", allowed: validStatuses },
                });
            }
            filter.status = status;
        }

        if (minPrice !== undefined || maxPrice !== undefined) {
            filter.price = {};
            if (minPrice !== undefined) filter.price.$gte = this._parseFilterNumber(minPrice, "minPrice");
            if (maxPrice !== undefined) filter.price.$lte = this._parseFilterNumber(maxPrice, "maxPrice");
            if (minPrice !== undefined && maxPrice !== undefined && filter.price.$gte > filter.price.$lte) {
                throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "minPrice no puede ser mayor que maxPrice", {
                    details: { field: "minPrice" },
                });
            }
        }

        if (search !== undefined) {
            if (typeof search !== "string") {
                throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "search debe ser un texto", {
                    details: { field: "search" },
                });
            }
            const term = search.trim();
            if (term.length > MAX_SEARCH_LENGTH) {
                throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, `search no puede superar los ${MAX_SEARCH_LENGTH} caracteres`, {
                    details: { field: "search", limit: MAX_SEARCH_LENGTH },
                });
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
            throw new AppError(ERROR_DICTIONARY.PRODUCT_NOT_FOUND, "Producto no encontrado", {
                details: { field: "id" },
            });
        }
        return product;
    }

    async createProduct(productData) {
        assertBodyObject(productData);
        const { name, description, price, stock } = productData;

        if (!isNonEmptyString(name)) {
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "El nombre del producto es obligatorio", {
                details: { field: "name" },
            });
        }
        if (!isNonEmptyString(description)) {
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "La descripción del producto es obligatoria", {
                details: { field: "description" },
            });
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
            throw new AppError(ERROR_DICTIONARY.PRODUCT_NOT_FOUND, "Producto no encontrado", {
                details: { field: "id" },
            });
        }

        const dataToUpdate = {};

        if (updateData.name !== undefined) {
            if (!isNonEmptyString(updateData.name)) {
                throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "El nombre no puede estar vacío", {
                    details: { field: "name" },
                });
            }
            dataToUpdate.name = updateData.name.trim();
        }

        if (updateData.description !== undefined) {
            if (!isNonEmptyString(updateData.description)) {
                throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "La descripción no puede estar vacía", {
                    details: { field: "description" },
                });
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
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "Debe enviar al menos un campo modificable: name, description, price o stock");
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
            throw new AppError(ERROR_DICTIONARY.PRODUCT_NOT_FOUND, "Producto no encontrado", {
                details: { field: "id" },
            });
        }

        return await productsRepository.delete(id);
    }
}

export const productsService = new ProductsService();
