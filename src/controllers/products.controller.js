import { productsService } from "../services/products.service.js";

/**
 * Controlador de Productos para ShipNow API.
 * Única puerta de entrada HTTP: gestiona req, res, códigos de respuesta
 * y deriva cualquier excepción al middleware de errores.
 * No importa Mongoose ni interactúa con modelos.
 */
export class ProductsController {
    static async getAllProducts(req, res, next) {
        try {
            const products = await productsService.getProducts(req.query);
            res.status(200).json({
                status: "success",
                payload: products,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getProductById(req, res, next) {
        try {
            const { id } = req.params;
            const product = await productsService.getProductById(id);
            res.status(200).json({
                status: "success",
                payload: product,
            });
        } catch (error) {
            next(error);
        }
    }

    static async createProduct(req, res, next) {
        try {
            const newProduct = await productsService.createProduct(req.body);
            res.status(201).json({
                status: "success",
                message: "Producto creado exitosamente",
                payload: newProduct,
            });
        } catch (error) {
            next(error);
        }
    }

    static async updateProduct(req, res, next) {
        try {
            const { id } = req.params;
            const updatedProduct = await productsService.updateProduct(id, req.body);
            res.status(200).json({
                status: "success",
                message: "Producto actualizado exitosamente",
                payload: updatedProduct,
            });
        } catch (error) {
            next(error);
        }
    }

    static async deleteProduct(req, res, next) {
        try {
            const { id } = req.params;
            await productsService.deleteProduct(id);
            res.status(200).json({
                status: "success",
                message: "Producto eliminado exitosamente",
            });
        } catch (error) {
            next(error);
        }
    }
}

export const getAllProducts = ProductsController.getAllProducts;
export const getProductById = ProductsController.getProductById;
export const createProduct = ProductsController.createProduct;
export const updateProduct = ProductsController.updateProduct;
export const deleteProduct = ProductsController.deleteProduct;
