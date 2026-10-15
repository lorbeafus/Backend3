import { mocksService } from "../services/mocks.service.js";

/**
 * Controlador de Mocking para ShipNow API.
 * Administra el ciclo HTTP de generación de datos simulados y carga controlada.
 * No interactúa directamente con Mongoose ni modelos.
 */
export class MocksController {
    static async getMockUsers(req, res, next) {
        try {
            const users = mocksService.getMockUsers(req.query.qty);
            res.status(200).json({
                status: "success",
                count: users.length,
                payload: users,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getMockDrivers(req, res, next) {
        try {
            const drivers = mocksService.getMockDrivers(req.query.qty);
            res.status(200).json({
                status: "success",
                count: drivers.length,
                payload: drivers,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getMockOrders(req, res, next) {
        try {
            const data = mocksService.getMockOrders(req.query.qty);
            res.status(200).json({
                status: "success",
                count: data.orders.length,
                payload: data,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getMockDeliveries(req, res, next) {
        try {
            const data = mocksService.getMockDeliveries(req.query.qty);
            res.status(200).json({
                status: "success",
                count: data.deliveries.length,
                payload: data,
            });
        } catch (error) {
            next(error);
        }
    }

    static async seedDatabase(req, res, next) {
        try {
            // El parámetro qty puede recibirse por query string o en el cuerpo JSON de la petición
            const qty = req.query.qty !== undefined ? req.query.qty : req.body?.qty;
            const result = await mocksService.seedDatabase(qty);
            res.status(201).json({
                status: "success",
                payload: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const getMockUsers = MocksController.getMockUsers;
export const getMockDrivers = MocksController.getMockDrivers;
export const getMockOrders = MocksController.getMockOrders;
export const getMockDeliveries = MocksController.getMockDeliveries;
export const seedDatabase = MocksController.seedDatabase;
