import { ordersService } from "../services/orders.service.js";
export async function list(req, res, next) {
    try { res.status(200).json({ status: "success", payload: await ordersService.list(req.user, req.query) }); }
    catch (error) { next(error); }
}
export async function get(req, res, next) {
    try { res.status(200).json({ status: "success", payload: await ordersService.get(req.params.id, req.user) }); }
    catch (error) { next(error); }
}
export async function create(req, res, next) {
    try { res.status(201).json({ status: "success", payload: await ordersService.create(req.body, req.user) }); }
    catch (error) { next(error); }
}
export async function cancel(req, res, next) {
    try { res.status(200).json({ status: "success", payload: await ordersService.cancel(req.params.id, req.body, req.user) }); }
    catch (error) { next(error); }
}
