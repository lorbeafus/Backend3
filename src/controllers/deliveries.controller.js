import { deliveriesService } from "../services/deliveries.service.js";
export async function list(req, res, next) {
    try { res.status(200).json({ status: "success", payload: await deliveriesService.list(req.user, req.query) }); }
    catch (error) { next(error); }
}
export async function get(req, res, next) {
    try { res.status(200).json({ status: "success", payload: await deliveriesService.get(req.params.id, req.user) }); }
    catch (error) { next(error); }
}
export async function create(req, res, next) {
    try { res.status(201).json({ status: "success", payload: await deliveriesService.create(req.body, req.user) }); }
    catch (error) { next(error); }
}
export async function transition(req, res, next) {
    try { res.status(200).json({ status: "success", payload: await deliveriesService.transition(req.params.id, req.body, req.user) }); }
    catch (error) { next(error); }
}
