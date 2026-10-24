import { loggerService } from "../services/logger.service.js";
export function testLogger(req, res, next) {
    try { res.json({ status: "success", payload: loggerService.test() }); } catch (error) { next(error); }
}
