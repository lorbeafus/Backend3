import { deliveriesService } from "../services/deliveries.service.js";
import { AppError } from "../utils/errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";
import { storageService } from "../utils/storage.js";

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
export async function uploadProof(req, res, next) {
    const stagedFilePath = req.file?.path;
    try {
        if (!req.file) {
            throw new AppError(
                ERROR_DICTIONARY.FILE_REQUIRED,
                "Debe adjuntar un archivo en el campo 'proof'"
            );
        }

        // Validación estricta: NO se permiten campos de texto adicionales en uploadProof
        const bodyKeys = Object.keys(req.body || {});
        if (bodyKeys.length > 0) {
            throw new AppError(
                ERROR_DICTIONARY.INVALID_INPUT_DATA,
                "No se permiten campos de texto adicionales en la carga de comprobantes",
                { details: { extraFields: bodyKeys } }
            );
        }

        const result = await deliveriesService.uploadProof({
            deliveryId: req.params.id,
            file: req.file,
            actor: req.user,
        });

        res.status(200).json({
            status: "success",
            message: "Comprobante de entrega subido correctamente",
            payload: result,
        });
    } catch (error) {
        if (stagedFilePath) {
            await storageService.safeUnlink(stagedFilePath);
        }
        next(error);
    }
}
