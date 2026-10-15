import { Schema, model } from "mongoose";
import { DELIVERY_STATUS } from "../constants/index.js";

const deliverySchema = new Schema(
    {
        tracking_code: {
            type: String,
            required: [true, "El código de seguimiento es obligatorio"],
            unique: true,
            trim: true,
        },
        order: {
            type: Schema.Types.ObjectId,
            ref: "Order",
            required: [true, "El pedido asociado a la entrega es obligatorio"],
        },
        driver: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            validate: {
                validator: function (val) {
                    // Si el estado es IN_PROGRESS o COMPLETED, debe haber un repartidor asignado
                    if ([DELIVERY_STATUS.IN_PROGRESS, DELIVERY_STATUS.COMPLETED].includes(this.status)) {
                        return val !== null && val !== undefined;
                    }
                    return true;
                },
                message: "Una entrega en curso o completada debe tener un repartidor asignado",
            },
        },
        status: {
            type: String,
            enum: {
                values: Object.values(DELIVERY_STATUS),
                message: "Estado de entrega no válido",
            },
            default: DELIVERY_STATUS.ASSIGNED,
        },
        estimated_delivery_date: {
            type: Date,
            required: [true, "La fecha estimada de entrega es obligatoria"],
        },
        delivery_notes: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

export const deliveryModel = model("Delivery", deliverySchema);
