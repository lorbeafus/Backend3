import { randomUUID } from "node:crypto";
import { deliveriesRepository } from "../repositories/deliveries.repository.js";
import { ordersRepository } from "../repositories/orders.repository.js";
import { usersRepository } from "../repositories/users.repository.js";
import { ordersService } from "./orders.service.js";
import { assertValidId } from "../utils/validation.js";
import { strictBody, pagination, invalid, deliveryView } from "../utils/logistics.validation.js";
import { AppError } from "../utils/errors.js";
import { USER_ROLES as R, ORDER_STATUS as O, DELIVERY_STATUS as D, ERROR_DICTIONARY as E } from "../constants/index.js";
import { logger } from "../config/logger.js";
import { storageService } from "../utils/storage.js";
import { DocumentDTO } from "../dto/index.js";
export const deliveriesService = {
    async list(actor, query) {
        const paging = pagination(query);
        const filter = actor.role === R.ADMIN ? {} : actor.role === R.DRIVER ? { driver: actor._id }
            : { order: { $in: await ordersRepository.idsForUser(actor._id) } };
        return { items: (await deliveriesRepository.getAll({ filter, ...paging })).map(deliveryView), page: paging.page, limit: paging.limit };
    },
    async get(id, actor) {
        assertValidId(id);
        const delivery = await deliveriesRepository.getById(id);
        if (!delivery) throw new AppError(E.DELIVERY_NOT_FOUND);
        if (!delivery.order) throw new AppError(E.DOMAIN_CONFLICT, "La entrega no tiene un pedido disponible");
        if (actor.role !== R.ADMIN && String(delivery.order.user) !== String(actor._id) &&
            !(actor.role === R.DRIVER && String(delivery.driver?._id) === String(actor._id))) throw new AppError(E.INSUFFICIENT_PERMISSIONS);
        return deliveryView(delivery);
    },
    async create(body, actor) {
        if (actor.role !== R.ADMIN) throw new AppError(E.INSUFFICIENT_PERMISSIONS);
        strictBody(body, ["order", "driver", "estimated_delivery_date", "delivery_notes"]);
        assertValidId(body.order); assertValidId(body.driver);
        const order = await ordersService.get(body.order, actor);
        if (order.status !== O.PENDING) throw new AppError(E.DOMAIN_CONFLICT, "Solo se asignan pedidos pendientes");
        const driver = await usersRepository.getById(body.driver);
        if (!driver) throw new AppError(E.USER_NOT_FOUND);
        if (driver.role !== R.DRIVER) throw invalid("El usuario asignado debe tener rol DRIVER");
        if (await deliveriesRepository.getForOrder(body.order)) throw new AppError(E.DOMAIN_CONFLICT, "El pedido ya tiene una entrega");
        if (typeof body.estimated_delivery_date !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.estimated_delivery_date)) throw invalid("La fecha debe ser ISO UTC con hora y sufijo Z");
        const date = new Date(body.estimated_delivery_date);
        if (!Number.isFinite(date.getTime()) || date.toISOString() !== (body.estimated_delivery_date.includes(".") ? body.estimated_delivery_date : body.estimated_delivery_date.replace("Z", ".000Z")) || date <= new Date()) throw invalid("La fecha estimada debe ser futura");
        if (body.delivery_notes !== undefined && (typeof body.delivery_notes !== "string" || body.delivery_notes.length > 1000)) throw invalid("Notas de entrega inválidas");
        const saved = await deliveriesRepository.create({ assignment_key: String(order._id), order: body.order, driver: body.driver,
            tracking_code: `TRK-${randomUUID()}`, status: D.ASSIGNED, estimated_delivery_date: date, delivery_notes: body.delivery_notes?.trim() || "" });
        logger.info("Entrega asignada", { event: "delivery_created", deliveryId: String(saved._id), orderId: body.order });
        return this.get(String(saved._id), actor);
    },
    async transition(id, body, actor) {
        strictBody(body, ["status"]);
        const delivery = await this.get(id, actor);
        if (actor.role !== R.ADMIN && !(actor.role === R.DRIVER && String(delivery.driver?._id) === String(actor._id))) throw new AppError(E.INSUFFICIENT_PERMISSIONS);
        const transitions = { [D.ASSIGNED]: { [D.IN_PROGRESS]: O.IN_TRANSIT }, [D.IN_PROGRESS]: { [D.COMPLETED]: O.DELIVERED, [D.FAILED]: O.CANCELLED } };
        if (typeof body.status !== "string" || !Object.values(D).includes(body.status)) throw new AppError(E.INVALID_DOMAIN_STATE);
        if (body.status === delivery.status) return delivery;
        const target = transitions[delivery.status]?.[body.status];
        if (!target || !delivery.driver) throw new AppError(E.DOMAIN_CONFLICT, "Transición de entrega no permitida");
        const updated = await ordersRepository.transition(String(delivery.order._id), delivery.order.status, target);
        if (!updated) throw new AppError(E.DOMAIN_CONFLICT, "El pedido cambió; consultá su estado nuevamente");
        logger.info("Estado de entrega actualizado", { event: "delivery_status_changed", deliveryId: id, status: body.status, actorId: String(actor._id) });
        return this.get(id, actor);
    },
    async uploadProof({ deliveryId, file, actor }) {
        assertValidId(deliveryId);
        const delivery = await deliveriesRepository.getById(deliveryId);
        if (!delivery) {
            throw new AppError(E.DELIVERY_NOT_FOUND, "Entrega no encontrada", {
                details: { field: "id" },
            });
        }

        const isAdmin = actor.role === R.ADMIN;
        const isAssignedDriver =
            actor.role === R.DRIVER &&
            delivery.driver &&
            String(delivery.driver._id || delivery.driver) === String(actor._id);

        if (!isAdmin && !isAssignedDriver) {
            throw new AppError(
                E.INSUFFICIENT_PERMISSIONS,
                "Solo un administrador o el chofer asignado a esta entrega puede subir comprobantes"
            );
        }

        // 1. Validar magic bytes del archivo en staging
        await storageService.verifyMagicBytes(file.path, file.mimetype);

        // 2. Mover de staging a carpeta definitiva 'proofs'
        const committed = await storageService.commitFile(file, "proofs");
        let associationConfirmed = false;
        let persistedProof = null;

        const proofData = {
            original_name: file.originalname,
            filename: committed.filename,
            path: committed.path,
            mimetype: file.mimetype,
            size: file.size,
            type: "delivery_proof",
            uploaded_at: new Date(),
        };

        try {
            const updatedDelivery = await deliveriesRepository.addProof(deliveryId, proofData);
            if (!updatedDelivery) {
                await storageService.safeUnlink(committed.absolutePath);
                throw new AppError(E.DELIVERY_NOT_FOUND, "Entrega no encontrada", {
                    details: { field: "id" },
                });
            }
            persistedProof = updatedDelivery.proofs?.find((p) => p.filename === committed.filename) || null;
            if (persistedProof) {
                associationConfirmed = true;
            } else {
                let recoveredProof = null;
                let checkFailed = false;
                try {
                    const verified = await deliveriesRepository.getById(deliveryId);
                    if (verified && Array.isArray(verified.proofs)) {
                        recoveredProof = verified.proofs.find((p) => p.filename === committed.filename) || null;
                    }
                } catch {
                    checkFailed = true;
                }

                if (recoveredProof) {
                    associationConfirmed = true;
                    persistedProof = recoveredProof;
                    logger.warning("Persistencia confirmada tras verificación post-error", {
                        event: "upload_persistence_verified_after_error",
                        deliveryId,
                        filename: committed.filename,
                    });
                } else if (checkFailed) {
                    logger.error(
                        "Persistencia incierta al asociar comprobante: no se pudo verificar en MongoDB por fallo de conexión. Archivo preservado para reconciliación",
                        {
                            event: "upload_persistence_uncertain",
                            deliveryId,
                            filename: committed.filename,
                        }
                    );
                    throw new AppError(E.UPLOAD_ERROR, "No se pudo asociar el comprobante a la entrega");
                } else {
                    await storageService.safeUnlink(committed.absolutePath);
                    logger.error("Fallo al persistir comprobante de entrega en MongoDB. Archivo huérfano eliminado", {
                        event: "upload_persistence_failed",
                        deliveryId,
                        filename: committed.filename,
                    });
                    throw new AppError(E.UPLOAD_ERROR, "No se pudo asociar el comprobante a la entrega");
                }
            }
        } catch (err) {
            if (associationConfirmed) {
                throw err;
            }
            if (err instanceof AppError) {
                throw err;
            }

            let recoveredProof = null;
            let checkFailed = false;
            try {
                const verified = await deliveriesRepository.getById(deliveryId);
                if (verified && Array.isArray(verified.proofs)) {
                    recoveredProof = verified.proofs.find((p) => p.filename === committed.filename) || null;
                }
            } catch (queryErr) {
                checkFailed = true;
            }

            if (recoveredProof) {
                associationConfirmed = true;
                persistedProof = recoveredProof;
                logger.warning("Persistencia confirmada tras verificación post-error", {
                    event: "upload_persistence_verified_after_error",
                    deliveryId,
                    filename: committed.filename,
                });
            } else if (checkFailed) {
                logger.error(
                    "Persistencia incierta al asociar comprobante: no se pudo verificar en MongoDB por fallo de conexión. Archivo preservado para reconciliación",
                    {
                        event: "upload_persistence_uncertain",
                        deliveryId,
                        filename: committed.filename,
                        error: err.message,
                    }
                );
                throw err;
            } else {
                await storageService.safeUnlink(committed.absolutePath);
                logger.error("Fallo al persistir comprobante de entrega en MongoDB. Archivo huérfano eliminado", {
                    event: "upload_persistence_failed",
                    deliveryId,
                    filename: committed.filename,
                    error: err.message,
                });
                throw err;
            }
        }

        // Una vez confirmada la asociación, errores posteriores de DTO, logging o respuesta NO eliminan el archivo
        try {
            logger.info("Comprobante de entrega asociado exitosamente", {
                event: "proof_uploaded",
                deliveryId,
                type: "delivery_proof",
                filename: committed.filename,
                size: file.size,
                mimetype: file.mimetype,
            });
        } catch {
            // Ignorar fallo secundario de logging
        }

        const proofDto = new DocumentDTO(persistedProof);
        return {
            delivery_id: String(deliveryId),
            id: proofDto.id,
            original_name: proofDto.original_name,
            filename: proofDto.filename,
            path: proofDto.path,
            mimetype: proofDto.mimetype,
            size: proofDto.size,
            type: proofDto.type,
            uploaded_at: proofDto.uploaded_at,
            proof: proofDto,
        };
    },
};
