import { expect } from "chai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../../src/config/index.js";
import { userModel } from "../../src/models/user.model.js";
import { deliveryModel } from "../../src/models/delivery.model.js";
import { orderModel } from "../../src/models/order.model.js";
import { usersRepository } from "../../src/repositories/users.repository.js";
import { deliveriesRepository } from "../../src/repositories/deliveries.repository.js";
import { ERROR_DICTIONARY, DELIVERY_STATUS, ORDER_STATUS } from "../../src/constants/index.js";
import { isPathInside, safeUnlink } from "../../src/utils/storage.js";
import { DocumentDTO } from "../../src/dto/index.js";
import {
    seedBaseFixtures,
    testUsers,
    testDeliveries,
    testOrders,
    sampleFiles,
    getAdminAgent,
    getClient1Agent,
    getClient2Agent,
    getDriver1Agent,
    getDriver2Agent,
    getGuestAgent,
} from "./fixtures.js";

async function countAllFilesInDir(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true, recursive: true });
        return entries.filter((e) => e.isFile()).length;
    } catch {
        return 0;
    }
}

describe("Módulo 7 - Carga de Documentos y Comprobantes (Multer)", () => {
    beforeEach(async () => {
        await seedBaseFixtures();
    });

    describe("POST /api/users/:uid/documents - Carga de documentos de usuario y licencias", () => {
        it("debe permitir a un CLIENTE subir su propio documento (user_document) en PDF y persistir metadatos", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "mi_dni.pdf")
                .expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body).to.have.property("message").that.is.a("string");
            expect(res.body).to.have.property("payload").that.is.an("object");

            const { user_id, document, path: relPath, filename, size, mimetype, type } = res.body.payload;
            expect(user_id).to.equal(uid);
            expect(document).to.be.an("object");
            expect(document.original_name).to.equal("mi_dni.pdf");
            expect(document.filename).to.match(/^[0-9a-fA-F-]+\.pdf$/);
            expect(document.path).to.equal(`documents/${document.filename}`);
            expect(document.mimetype).to.equal("application/pdf");
            expect(document.size).to.equal(sampleFiles.validPdf.length);
            expect(document.type).to.equal("user_document");
            expect(document.uploaded_at).to.be.a("string");

            // Seguridad: sin rutas absolutas del servidor ni credenciales
            expect(document.path).to.not.include(":\\");
            expect(document.path).to.not.match(/^\/[a-zA-Z]/);
            expect(res.body).to.not.have.property("password");
            expect(res.body).to.not.have.property("hash");

            // Comprobación en base de datos MongoDB
            const userInDb = await userModel.findById(uid).lean();
            expect(userInDb.documents).to.be.an("array").with.lengthOf(1);
            expect(userInDb.documents[0].filename).to.equal(document.filename);
            expect(userInDb.documents[0].path).to.equal(document.path);

            // Comprobación de archivo físico real en disco
            const physicalPath = path.join(config.UPLOAD_DIR, document.path);
            const fileBuffer = await fs.readFile(physicalPath);
            expect(fileBuffer.equals(sampleFiles.validPdf)).to.be.true;
        });

        it("debe permitir a un CHOFER subir su propio documento (user_document) en JPEG", async () => {
            const driverAgent = await getDriver1Agent();
            const uid = String(testUsers.driver1._id);

            const res = await driverAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validJpeg, "foto_perfil.jpeg")
                .expect(200);

            expect(res.body.payload.document.type).to.equal("user_document");
            expect(res.body.payload.document.path).to.include("documents/");

            const physicalPath = path.join(config.UPLOAD_DIR, res.body.payload.document.path);
            const fileBuffer = await fs.readFile(physicalPath);
            expect(fileBuffer.equals(sampleFiles.validJpeg)).to.be.true;
        });

        it("debe permitir a un CHOFER subir su licencia de conducir (driver_license) en PNG y guardarla en subcarpeta licenses", async () => {
            const driverAgent = await getDriver1Agent();
            const uid = String(testUsers.driver1._id);

            const res = await driverAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "driver_license")
                .attach("document", sampleFiles.validPng, "licencia_conducir.png")
                .expect(200);

            expect(res.body.payload.document.type).to.equal("driver_license");
            expect(res.body.payload.document.path).to.include("licenses/");

            const physicalPath = path.join(config.UPLOAD_DIR, res.body.payload.document.path);
            const fileBuffer = await fs.readFile(physicalPath);
            expect(fileBuffer.equals(sampleFiles.validPng)).to.be.true;
        });

        it("debe permitir al ADMIN subir documentos para otro usuario (CLIENTE)", async () => {
            const adminAgent = await getAdminAgent();
            const targetUid = String(testUsers.client2._id);

            const res = await adminAgent
                .post(`/api/users/${targetUid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "constancia_admin.pdf")
                .expect(200);

            expect(res.body.payload.user_id).to.equal(targetUid);
            const userInDb = await userModel.findById(targetUid).lean();
            expect(userInDb.documents).to.have.lengthOf(1);
        });

        it("debe permitir al ADMIN subir licencia de conducir para un usuario con rol DRIVER", async () => {
            const adminAgent = await getAdminAgent();
            const targetDriverUid = String(testUsers.driver2._id);

            const res = await adminAgent
                .post(`/api/users/${targetDriverUid}/documents`)
                .field("type", "driver_license")
                .attach("document", sampleFiles.validPdf, "licencia_driver2.pdf")
                .expect(200);

            expect(res.body.payload.document.type).to.equal("driver_license");
            expect(res.body.payload.document.path).to.include("licenses/");
        });

        it("debe rechazar con 400 INVALID_DOCUMENT_TYPE si se intenta subir driver_license para un usuario no DRIVER", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id); // Rol USER
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "driver_license")
                .attach("document", sampleFiles.validPdf, "licencia_fake.pdf")
                .expect(400);

            expect(res.body).to.deep.include({
                status: "error",
                statusCode: 400,
            });
            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE.code);
            expect(res.body.error.message).to.include("DRIVER");

            // No se persistió en MongoDB
            const userInDb = await userModel.findById(uid).lean();
            expect(userInDb.documents).to.have.lengthOf(0);

            // Limpieza: no quedan archivos huérfanos en disco
            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE intenta subir documento para otro usuario", async () => {
            const client1Agent = await getClient1Agent();
            const otherUserUid = String(testUsers.client2._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await client1Agent
                .post(`/api/users/${otherUserUid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "dni_ajeno.pdf")
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 401 AUTHENTICATION_REQUIRED si se invoca sin sesión activa", async () => {
            const guest = getGuestAgent();
            const uid = String(testUsers.client1._id);

            const res = await guest
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "dni.pdf")
                .expect(401);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });

        it("debe rechazar con 400 FILE_REQUIRED si no se adjunta ningún archivo en la petición", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.FILE_REQUIRED.code);
            expect(res.body.error.message).to.include("document");
        });

        it("debe rechazar con 400 UNEXPECTED_FILE_FIELD si el archivo se adjunta en un campo no esperado", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("archivo_equivocado", sampleFiles.validPdf, "archivo.pdf")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.UNEXPECTED_FILE_FIELD.code);
        });

        it("debe rechazar con 400 UNEXPECTED_FILE_FIELD si se envían múltiples archivos en el campo 'document'", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "doc1.pdf")
                .attach("document", sampleFiles.validJpeg, "doc2.jpg")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.UNEXPECTED_FILE_FIELD.code);
        });

        it("debe rechazar con 400 INVALID_DOCUMENT_TYPE si el campo 'type' es inválido o se omite", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "tipo_invalido")
                .attach("document", sampleFiles.validPdf, "doc.pdf")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 400 INVALID_FILE_TYPE si la extensión o tipo MIME no está permitido (.txt)", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", Buffer.from("texto plano"), "notas.txt")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_FILE_TYPE.code);
        });

        it("debe rechazar con 400 INVALID_FILE_TYPE si el contenido no coincide con el tipo MIME declarado (magic bytes)", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            // Archivo de texto enviado fingiendo ser PDF
            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.invalidContentForPdf, {
                    filename: "falso.pdf",
                    contentType: "application/pdf",
                })
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_FILE_TYPE.code);
            expect(res.body.error.message).to.include("binario");

            // Verificación de limpieza del archivo en staging
            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 400 FILE_TOO_LARGE si el archivo supera los 5 MiB", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.oversizedPdf, "archivo_pesado.pdf")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.FILE_TOO_LARGE.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 400 INVALID_ID si el UID es un ObjectId malformado", async () => {
            const clientAgent = await getClient1Agent();

            const res = await clientAgent
                .post("/api/users/uid-invalido-123/documents")
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "archivo.pdf")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_ID.code);
        });

        it("debe rechazar con 404 USER_NOT_FOUND si el usuario no existe", async () => {
            const adminAgent = await getAdminAgent();
            const nonExistentUid = "507f1f77bcf86cd799439011";
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await adminAgent
                .post(`/api/users/${nonExistentUid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "archivo.pdf")
                .expect(404);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.USER_NOT_FOUND.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe permitir acumular múltiples documentos en el mismo usuario sin reemplazo destructivo", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "dni_frente.pdf")
                .expect(200);

            await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, "dni_dorso.pdf")
                .expect(200);

            const userInDb = await userModel.findById(uid).lean();
            expect(userInDb.documents).to.have.lengthOf(2);
            expect(userInDb.documents[0].original_name).to.equal("dni_frente.pdf");
            expect(userInDb.documents[1].original_name).to.equal("dni_dorso.pdf");
        });

        it("debe limpiar el archivo físico si falla la persistencia en MongoDB (fallo controlado)", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            // Inyectar fallo simulado en el repositorio de usuarios
            const originalAddDocument = usersRepository.addDocument;
            usersRepository.addDocument = async () => {
                throw new Error("Fallo de conexión simulado con MongoDB durante persistencia");
            };

            try {
                const res = await clientAgent
                    .post(`/api/users/${uid}/documents`)
                    .field("type", "user_document")
                    .attach("document", sampleFiles.validPdf, "doc_fallido.pdf")
                    .expect(500);

                expect(res.body.status).to.equal("error");
            } finally {
                // Restaurar repositorio
                usersRepository.addDocument = originalAddDocument;
            }

            // Comprobar que no quedó ningún archivo huérfano en disco
            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe guardar un PDF válido con nombre original terminado en .png con extensión definitiva .pdf y mantener original_name", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .attach("document", sampleFiles.validPdf, { filename: "archivo_con_nombre_falso.png", contentType: "application/pdf" })
                .expect(200);

            const { document } = res.body.payload;
            expect(document.original_name).to.equal("archivo_con_nombre_falso.png");
            // Extensión definitiva normalizada a .pdf basada en MIME real verificado
            expect(document.filename).to.match(/^[0-9a-fA-F-]+\.pdf$/);
            expect(document.path).to.match(/^documents\/[0-9a-fA-F-]+\.pdf$/);
            expect(document.mimetype).to.equal("application/pdf");

            // Verificar en disco
            const physicalPath = path.join(config.UPLOAD_DIR, document.path);
            const fileContent = await fs.readFile(physicalPath);
            expect(fileContent.equals(sampleFiles.validPdf)).to.be.true;
        });

        it("debe procesar exitosamente la carga cuando el archivo se adjunta antes que el campo type (orden multipart)", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .attach("document", sampleFiles.validPdf, "archivo_primero.pdf")
                .field("type", "user_document")
                .expect(200);

            expect(res.body.status).to.equal("success");
            expect(res.body.payload.document.original_name).to.equal("archivo_primero.pdf");
            expect(res.body.payload.document.path).to.match(/^documents\/[0-9a-fA-F-]+\.pdf$/);
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si se envían campos de texto adicionales en la carga de documentos", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .field("extra_field", "campo_no_permitido")
                .attach("document", sampleFiles.validPdf, "doc.pdf")
                .expect(400);

            expect(res.body.status).to.equal("error");
            expect(res.body.error.code).to.equal(ERROR_DICTIONARY.INVALID_INPUT_DATA.code);

            const userInDb = await userModel.findById(uid).lean();
            expect(userInDb.documents).to.be.empty;

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 400 INVALID_DOCUMENT_TYPE si type se envía duplicado produciendo un array", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await clientAgent
                .post(`/api/users/${uid}/documents`)
                .field("type", "user_document")
                .field("type", "driver_license")
                .attach("document", sampleFiles.validPdf, "doc.pdf")
                .expect(400);

            expect(res.body.status).to.equal("error");
            expect(res.body.error.code).to.equal(ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 404 USER_NOT_FOUND y limpiar el archivo si el usuario desaparece durante addDocument", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddDocument = usersRepository.addDocument;
            usersRepository.addDocument = async () => null;

            try {
                const res = await clientAgent
                    .post(`/api/users/${uid}/documents`)
                    .field("type", "user_document")
                    .attach("document", sampleFiles.validPdf, "doc_desaparecido.pdf")
                    .expect(404);

                expect(res.body.status).to.equal("error");
                expect(res.body.error.code).to.equal(ERROR_DICTIONARY.USER_NOT_FOUND.code);
            } finally {
                usersRepository.addDocument = originalAddDocument;
            }

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe mantener el archivo y los metadatos si la persistencia es confirmada pero ocurre un fallo posterior en la serialización", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            // Simular fallo tras la persistencia definiendo un setter que arroje error en DocumentDTO.prototype.id
            Object.defineProperty(DocumentDTO.prototype, "id", {
                set() {
                    throw new Error("Fallo simulado posterior a la confirmación de persistencia");
                },
                configurable: true,
            });

            try {
                const res = await clientAgent
                    .post(`/api/users/${uid}/documents`)
                    .field("type", "user_document")
                    .attach("document", sampleFiles.validPdf, "doc_persistido_post_error.pdf")
                    .expect(500);

                expect(res.body.status).to.equal("error");

                // La asociación YA fue confirmada: los metadatos permanecen en MongoDB
                const userInDb = await userModel.findById(uid).lean();
                expect(userInDb.documents).to.have.lengthOf(1);
                expect(userInDb.documents[0].original_name).to.equal("doc_persistido_post_error.pdf");

                // El archivo físico definitivo en disco NO fue borrado
                const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
                expect(filesAfter).to.equal(filesBefore + 1);

                const physicalPath = path.join(config.UPLOAD_DIR, userInDb.documents[0].path);
                const fileExists = await fs.access(physicalPath).then(() => true).catch(() => false);
                expect(fileExists).to.be.true;
            } finally {
                delete DocumentDTO.prototype.id;
            }
        });

        it("en caso de resultado incierto por fallo de red, no debe eliminar a ciegas el archivo definitivo", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddDoc = usersRepository.addDocument;
            const originalGetById = usersRepository.getById;

            let getByIdCalls = 0;
            usersRepository.getById = async (id) => {
                getByIdCalls++;
                // Llamada 1: autenticación de Passport (authMiddleware)
                // Llamada 2: validación previa del usuario en usersService.uploadDocument
                if (getByIdCalls <= 2) {
                    return originalGetById.call(usersRepository, id);
                }
                // Llamada 3: comprobación post-error en catch para verificar si se guardó
                throw new Error("MongoNetworkTimeout: conexión perdida en verificación");
            };
            usersRepository.addDocument = async () => {
                throw new Error("MongoNetworkError: timeout durante escritura");
            };

            try {
                const res = await clientAgent
                    .post(`/api/users/${uid}/documents`)
                    .field("type", "user_document")
                    .attach("document", sampleFiles.validPdf, "doc_incierto.pdf")
                    .expect(500);

                expect(res.body.status).to.equal("error");

                // Política de preservación para reconciliación: no se elimina a ciegas
                const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
                expect(filesAfter).to.equal(filesBefore + 1);
            } finally {
                usersRepository.addDocument = originalAddDoc;
                usersRepository.getById = originalGetById;
            }
        });

        it("debe recuperar la escritura y devolver el subdocumento persistido real (con _id y metadatos) si addDocument falla post-escritura", async () => {
            const clientAgent = await getClient1Agent();
            const uid = String(testUsers.client1._id);

            const originalAddDocument = usersRepository.addDocument;
            usersRepository.addDocument = async (id, documentData) => {
                // Ejecutar la escritura real en MongoDB
                await originalAddDocument.call(usersRepository, id, documentData);
                // Simular desconexión inmediatamente después de la escritura
                const netErr = new Error("MongoNetworkTimeout: socket closed immediately after write");
                netErr.name = "MongoNetworkError";
                throw netErr;
            };

            try {
                const res = await clientAgent
                    .post(`/api/users/${uid}/documents`)
                    .field("type", "user_document")
                    .attach("document", sampleFiles.validPdf, "mi_doc_recuperado.pdf")
                    .expect(200);

                expect(res.body.status).to.equal("success");
                expect(res.body.payload).to.be.an("object");

                const { document } = res.body.payload;
                expect(document).to.be.an("object");
                expect(document.id).to.be.a("string").with.lengthOf(24);
                expect(document.original_name).to.equal("mi_doc_recuperado.pdf");

                // Verificar en MongoDB que solo existe 1 documento y que coincide exactamente con la respuesta
                const userInDb = await userModel.findById(uid).lean();
                expect(userInDb.documents).to.have.lengthOf(1);
                const dbDoc = userInDb.documents[0];

                expect(document.id).to.equal(String(dbDoc._id));
                expect(document.filename).to.equal(dbDoc.filename);
                expect(document.path).to.equal(dbDoc.path);
                expect(document.type).to.equal(dbDoc.type);
                expect(document.size).to.equal(dbDoc.size);
                expect(new Date(document.uploaded_at).getTime()).to.equal(new Date(dbDoc.uploaded_at).getTime());

                // Confirmar que el archivo físico existe y conserva sus bytes
                const physicalPath = path.join(config.UPLOAD_DIR, dbDoc.path);
                const fileBytes = await fs.readFile(physicalPath);
                expect(fileBytes.equals(sampleFiles.validPdf)).to.be.true;
            } finally {
                usersRepository.addDocument = originalAddDocument;
            }
        });
    });

    describe("POST /api/deliveries/:did/proof - Carga de comprobantes de entrega", () => {
        it("debe permitir al CHOFER asignado a la entrega subir un comprobante válido en PDF", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPdf, "recibo_firma.pdf")
                .expect(200);

            expect(res.body).to.have.property("status", "success");
            expect(res.body.payload).to.have.property("delivery_id", did);

            const { proof } = res.body.payload;
            expect(proof).to.be.an("object");
            expect(proof.original_name).to.equal("recibo_firma.pdf");
            expect(proof.filename).to.match(/^[0-9a-fA-F-]+\.pdf$/);
            expect(proof.path).to.equal(`proofs/${proof.filename}`);
            expect(proof.type).to.equal("delivery_proof");
            expect(proof.mimetype).to.equal("application/pdf");

            // Comprobar persistencia en MongoDB
            const deliveryInDb = await deliveryModel.findById(did).lean();
            expect(deliveryInDb.proofs).to.be.an("array").with.lengthOf(1);
            expect(deliveryInDb.proofs[0].filename).to.equal(proof.filename);

            // Comprobar archivo en disco
            const physicalPath = path.join(config.UPLOAD_DIR, proof.path);
            const fileBuffer = await fs.readFile(physicalPath);
            expect(fileBuffer.equals(sampleFiles.validPdf)).to.be.true;
        });

        it("debe permitir al ADMIN subir comprobante para cualquier entrega", async () => {
            const adminAgent = await getAdminAgent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const res = await adminAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validJpeg, "comprobante_admin.jpeg")
                .expect(200);

            expect(res.body.payload.proof.type).to.equal("delivery_proof");
            expect(res.body.payload.proof.path).to.include("proofs/");
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CLIENTE intenta subir comprobante de entrega", async () => {
            const clientAgent = await getClient1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await clientAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPdf, "comprobante.pdf")
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 403 INSUFFICIENT_PERMISSIONS si un CHOFER intenta subir comprobante a una entrega asignada a otro chofer", async () => {
            const driver2Agent = await getDriver2Agent();
            const didOfDriver1 = String(testDeliveries.deliveryForDriver1._id); // Asignada a driver1
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await driver2Agent
                .post(`/api/deliveries/${didOfDriver1}/proof`)
                .attach("proof", sampleFiles.validPdf, "comprobante_intruso.pdf")
                .expect(403);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 401 AUTHENTICATION_REQUIRED si se intenta subir comprobante sin sesión", async () => {
            const guest = getGuestAgent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const res = await guest
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPdf, "comprobante.pdf")
                .expect(401);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.AUTHENTICATION_REQUIRED.code);
        });

        it("debe rechazar con 400 FILE_REQUIRED si no se adjunta archivo en el campo 'proof'", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.FILE_REQUIRED.code);
            expect(res.body.error.message).to.include("proof");
        });

        it("debe rechazar con 400 UNEXPECTED_FILE_FIELD si el archivo se adjunta en un campo diferente a 'proof'", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("document", sampleFiles.validPdf, "comprobante.pdf")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.UNEXPECTED_FILE_FIELD.code);
        });

        it("debe rechazar con 400 UNEXPECTED_FILE_FIELD si se envían múltiples archivos en 'proof'", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPdf, "comprobante1.pdf")
                .attach("proof", sampleFiles.validJpeg, "comprobante2.jpg")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.UNEXPECTED_FILE_FIELD.code);
        });

        it("debe rechazar con 400 INVALID_FILE_TYPE ante contenido incompatible con MIME (magic bytes)", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.invalidContentForJpeg, {
                    filename: "foto_falsa.jpg",
                    contentType: "image/jpeg",
                })
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_FILE_TYPE.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 400 FILE_TOO_LARGE si el comprobante supera 5 MiB", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.oversizedPdf, "comprobante_pesado.pdf")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.FILE_TOO_LARGE.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 400 INVALID_ID si el ID de entrega es inválido", async () => {
            const driverAgent = await getDriver1Agent();

            const res = await driverAgent
                .post("/api/deliveries/id-malformado-xyz/proof")
                .attach("proof", sampleFiles.validPdf, "comprobante.pdf")
                .expect(400);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.INVALID_ID.code);
        });

        it("debe rechazar con 404 DELIVERY_NOT_FOUND si la entrega no existe", async () => {
            const adminAgent = await getAdminAgent();
            const nonExistentDid = "507f1f77bcf86cd799439011";
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await adminAgent
                .post(`/api/deliveries/${nonExistentDid}/proof`)
                .attach("proof", sampleFiles.validPdf, "comprobante.pdf")
                .expect(404);

            expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.DELIVERY_NOT_FOUND.code);

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("la carga del comprobante NO debe alterar el estado de la entrega ni del pedido asociado", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const oid = String(testOrders.order1._id);

            const deliveryBefore = await deliveryModel.findById(did).lean();
            const orderBefore = await orderModel.findById(oid).lean();

            expect(deliveryBefore.status).to.equal(DELIVERY_STATUS.ASSIGNED);
            expect(orderBefore.status).to.equal(ORDER_STATUS.PENDING);

            await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPdf, "recibo.pdf")
                .expect(200);

            const deliveryAfter = await deliveryModel.findById(did).lean();
            const orderAfter = await orderModel.findById(oid).lean();

            // Los estados deben permanecer inalterados
            expect(deliveryAfter.status).to.equal(DELIVERY_STATUS.ASSIGNED);
            expect(orderAfter.status).to.equal(ORDER_STATUS.PENDING);
        });

        it("debe permitir acumular múltiples comprobantes en la misma entrega", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPdf, "comprobante_1.pdf")
                .expect(200);

            await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPng, "foto_paquete.png")
                .expect(200);

            const deliveryInDb = await deliveryModel.findById(did).lean();
            expect(deliveryInDb.proofs).to.have.lengthOf(2);
            expect(deliveryInDb.proofs[0].original_name).to.equal("comprobante_1.pdf");
            expect(deliveryInDb.proofs[1].original_name).to.equal("foto_paquete.png");
        });

        it("debe limpiar el archivo físico si falla la persistencia de entrega en MongoDB (fallo controlado)", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddProof = deliveriesRepository.addProof;
            deliveriesRepository.addProof = async () => {
                throw new Error("Fallo de conexión simulado con MongoDB durante persistencia de comprobante");
            };

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "comprobante_fallido.pdf")
                    .expect(500);

                expect(res.body.status).to.equal("error");
            } finally {
                deliveriesRepository.addProof = originalAddProof;
            }

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe rechazar con 400 INVALID_INPUT_DATA si se envían campos de texto adicionales en la carga de comprobantes", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .field("notes", "texto_no_permitido")
                .attach("proof", sampleFiles.validPdf, "recibo.pdf")
                .expect(400);

            expect(res.body.status).to.equal("error");
            expect(res.body.error.code).to.equal(ERROR_DICTIONARY.INVALID_INPUT_DATA.code);

            const deliveryInDb = await deliveryModel.findById(did).lean();
            expect(deliveryInDb.proofs).to.be.empty;

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe guardar un comprobante PDF con nombre .jpg con extensión definitiva .pdf conforme al MIME verificado", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const res = await driverAgent
                .post(`/api/deliveries/${did}/proof`)
                .attach("proof", sampleFiles.validPdf, { filename: "foto_recibo.jpg", contentType: "application/pdf" })
                .expect(200);

            const { proof } = res.body.payload;
            expect(proof.original_name).to.equal("foto_recibo.jpg");
            expect(proof.filename).to.match(/^[0-9a-fA-F-]+\.pdf$/);
            expect(proof.path).to.match(/^proofs\/[0-9a-fA-F-]+\.pdf$/);
            expect(proof.mimetype).to.equal("application/pdf");
        });

        it("debe rechazar con 404 DELIVERY_NOT_FOUND y limpiar el archivo si la entrega desaparece durante addProof", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddProof = deliveriesRepository.addProof;
            deliveriesRepository.addProof = async () => null;

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "comprobante_desaparecido.pdf")
                    .expect(404);

                expect(res.body.status).to.equal("error");
                expect(res.body.error.code).to.equal(ERROR_DICTIONARY.DELIVERY_NOT_FOUND.code);
            } finally {
                deliveriesRepository.addProof = originalAddProof;
            }

            const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
            expect(filesAfter).to.equal(filesBefore);
        });

        it("debe mantener el archivo y los metadatos si la persistencia de entrega es confirmada pero ocurre un fallo posterior en la serialización", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            Object.defineProperty(DocumentDTO.prototype, "id", {
                set() {
                    throw new Error("Fallo simulado posterior a la confirmación de comprobante");
                },
                configurable: true,
            });

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "comprobante_persistido_post_error.pdf")
                    .expect(500);

                expect(res.body.status).to.equal("error");

                // Metadatos preservados en MongoDB
                const deliveryInDb = await deliveryModel.findById(did).lean();
                expect(deliveryInDb.proofs).to.have.lengthOf(1);
                expect(deliveryInDb.proofs[0].original_name).to.equal("comprobante_persistido_post_error.pdf");

                // Archivo definitivo en disco preservado
                const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
                expect(filesAfter).to.equal(filesBefore + 1);

                const physicalPath = path.join(config.UPLOAD_DIR, deliveryInDb.proofs[0].path);
                const fileExists = await fs.access(physicalPath).then(() => true).catch(() => false);
                expect(fileExists).to.be.true;
            } finally {
                delete DocumentDTO.prototype.id;
            }
        });

        it("en caso de resultado incierto por fallo de red en comprobante, no debe eliminar a ciegas el archivo", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddProof = deliveriesRepository.addProof;
            const originalGetById = deliveriesRepository.getById;

            let getByIdCalls = 0;
            deliveriesRepository.getById = async (id) => {
                getByIdCalls++;
                if (getByIdCalls === 1) {
                    return originalGetById.call(deliveriesRepository, id);
                }
                throw new Error("MongoNetworkTimeout: conexión perdida en verificación comprobante");
            };
            deliveriesRepository.addProof = async () => {
                throw new Error("MongoNetworkError: timeout durante escritura comprobante");
            };

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "comprobante_incierto.pdf")
                    .expect(500);

                expect(res.body.status).to.equal("error");

                // Archivo preservado para reconciliación
                const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
                expect(filesAfter).to.equal(filesBefore + 1);
            } finally {
                deliveriesRepository.addProof = originalAddProof;
                deliveriesRepository.getById = originalGetById;
            }
        });

        it("debe recuperar la escritura y devolver el comprobante persistido real (con _id y metadatos) si addProof falla post-escritura", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);

            const originalAddProof = deliveriesRepository.addProof;
            deliveriesRepository.addProof = async (id, proofData) => {
                // Ejecutar la escritura real en MongoDB
                await originalAddProof.call(deliveriesRepository, id, proofData);
                // Simular desconexión de red inmediatamente posterior a la escritura
                const netErr = new Error("MongoNetworkTimeout: connection closed post-write");
                netErr.name = "MongoNetworkError";
                throw netErr;
            };

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "mi_comprobante_recuperado.pdf")
                    .expect(200);

                expect(res.body.status).to.equal("success");
                const { proof } = res.body.payload;
                expect(proof).to.be.an("object");
                expect(proof.id).to.be.a("string").with.lengthOf(24);
                expect(proof.original_name).to.equal("mi_comprobante_recuperado.pdf");

                // Verificar en MongoDB
                const deliveryInDb = await deliveryModel.findById(did).lean();
                expect(deliveryInDb.proofs).to.have.lengthOf(1);
                const dbProof = deliveryInDb.proofs[0];

                expect(proof.id).to.equal(String(dbProof._id));
                expect(proof.filename).to.equal(dbProof.filename);
                expect(proof.path).to.equal(dbProof.path);
                expect(proof.type).to.equal(dbProof.type);
                expect(proof.size).to.equal(dbProof.size);
                expect(new Date(proof.uploaded_at).getTime()).to.equal(new Date(dbProof.uploaded_at).getTime());

                // Confirmar bytes del archivo
                const physicalPath = path.join(config.UPLOAD_DIR, dbProof.path);
                const fileBytes = await fs.readFile(physicalPath);
                expect(fileBytes.equals(sampleFiles.validPdf)).to.be.true;
            } finally {
                deliveriesRepository.addProof = originalAddProof;
            }
        });

        it("debe rechazar con UPLOAD_ERROR (500) y eliminar el archivo huérfano si addProof devuelve una entidad sin el comprobante", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddProof = deliveriesRepository.addProof;
            // Intervenir addProof para que devuelva la entidad sin el comprobante esperado, sin persistir metadatos
            deliveriesRepository.addProof = async (id) => {
                const current = await deliveryModel.findById(id).lean();
                return {
                    ...current,
                    proofs: current.proofs || [],
                };
            };

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "comprobante_no_asociado.pdf")
                    .expect(500);

                // Verificar formato centralizado de error y códigos de UPLOAD_ERROR
                expect(res.body).to.have.property("status", "error");
                expect(res.body).to.have.property("statusCode", 500);
                expect(res.body).to.have.property("message", ERROR_DICTIONARY.UPLOAD_ERROR.message);
                expect(res.body.error).to.be.an("object");
                expect(res.body.error).to.have.property("code", ERROR_DICTIONARY.UPLOAD_ERROR.code);
                expect(res.body.error).to.have.property("message", ERROR_DICTIONARY.UPLOAD_ERROR.message);

                // Comprobar que no quedaron metadatos en MongoDB
                const deliveryInDb = await deliveryModel.findById(did).lean();
                expect(deliveryInDb.proofs).to.be.empty;

                // Comprobar que no quedaron archivos huérfanos
                const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
                expect(filesAfter).to.equal(filesBefore);
            } finally {
                deliveriesRepository.addProof = originalAddProof;
            }
        });

        it("no debe eliminar el archivo si addProof devuelve una entidad sin el comprobante pero MongoDB sí lo persistió (recuperación por verificación)", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddProof = deliveriesRepository.addProof;
            // Persistir efectivamente en MongoDB pero devolver la entidad desactualizada sin el comprobante
            deliveriesRepository.addProof = async (id, proofData) => {
                await originalAddProof.call(deliveriesRepository, id, proofData);
                const current = await deliveryModel.findById(id).lean();
                return {
                    ...current,
                    proofs: [], // Desactualizado / sin el comprobante
                };
            };

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "comprobante_persistencia_recuperada.pdf")
                    .expect(200);

                expect(res.body.status).to.equal("success");
                const { proof } = res.body.payload;
                expect(proof).to.be.an("object");
                expect(proof.id).to.be.a("string").with.lengthOf(24);
                expect(proof.original_name).to.equal("comprobante_persistencia_recuperada.pdf");

                // Verificar que en MongoDB sí quedó persistido
                const deliveryInDb = await deliveryModel.findById(did).lean();
                expect(deliveryInDb.proofs).to.have.lengthOf(1);
                expect(deliveryInDb.proofs[0].filename).to.equal(proof.filename);

                // Comprobar que el archivo físico NO fue eliminado
                const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
                expect(filesAfter).to.equal(filesBefore + 1);

                const physicalPath = path.join(config.UPLOAD_DIR, proof.path);
                const fileExists = await fs.access(physicalPath).then(() => true).catch(() => false);
                expect(fileExists).to.be.true;
            } finally {
                deliveriesRepository.addProof = originalAddProof;
            }
        });

        it("no debe eliminar a ciegas el archivo si la respuesta no incluye el comprobante y la verificación en MongoDB falla por conexión", async () => {
            const driverAgent = await getDriver1Agent();
            const did = String(testDeliveries.deliveryForDriver1._id);
            const filesBefore = await countAllFilesInDir(config.UPLOAD_DIR);

            const originalAddProof = deliveriesRepository.addProof;
            const originalGetById = deliveriesRepository.getById;

            let getByIdCalls = 0;
            deliveriesRepository.getById = async (id) => {
                getByIdCalls++;
                if (getByIdCalls === 1) {
                    return originalGetById.call(deliveriesRepository, id);
                }
                throw new Error("MongoNetworkTimeout: conexión perdida en verificación");
            };
            // Devolver entidad sin comprobante
            deliveriesRepository.addProof = async (id) => {
                const current = await deliveryModel.findById(id).lean();
                return {
                    ...current,
                    proofs: [],
                };
            };

            try {
                const res = await driverAgent
                    .post(`/api/deliveries/${did}/proof`)
                    .attach("proof", sampleFiles.validPdf, "comprobante_incierto_desactualizado.pdf")
                    .expect(500);

                expect(res.body.status).to.equal("error");
                expect(res.body.error.code).to.equal(ERROR_DICTIONARY.UPLOAD_ERROR.code);

                // Política de preservación: no se elimina a ciegas
                const filesAfter = await countAllFilesInDir(config.UPLOAD_DIR);
                expect(filesAfter).to.equal(filesBefore + 1);
            } finally {
                deliveriesRepository.addProof = originalAddProof;
                deliveriesRepository.getById = originalGetById;
            }
        });
    });

    describe("Protección de rutas al eliminar archivos (safeUnlink e isPathInside)", () => {
        it("debe eliminar un archivo legítimo ubicado dentro del directorio de uploads", async () => {
            const normalFile = path.join(config.UPLOAD_DIR, "temp", `test_normal_${Date.now()}.txt`);
            await fs.writeFile(normalFile, "contenido de prueba para borrar");

            await safeUnlink(normalFile);

            let exists = true;
            try {
                await fs.access(normalFile);
            } catch {
                exists = false;
            }
            expect(exists).to.be.false;
        });

        it("debe no eliminar y registrar advertencia si el archivo está en una carpeta hermana con el mismo prefijo (uploads-sibling)", async () => {
            const siblingDir = path.resolve(`${config.UPLOAD_DIR}-sibling`);
            await fs.mkdir(siblingDir, { recursive: true });
            const siblingFile = path.join(siblingDir, `sibling_${Date.now()}.txt`);
            await fs.writeFile(siblingFile, "contenido hermano que debe preservarse");

            try {
                await safeUnlink(siblingFile);

                // El archivo en carpeta hermana no debe eliminarse
                const content = await fs.readFile(siblingFile, "utf-8");
                expect(content).to.equal("contenido hermano que debe preservarse");
            } finally {
                await fs.rm(siblingDir, { recursive: true, force: true });
            }
        });

        it("debe no eliminar si se intenta salir del directorio de uploads mediante segmentos '..'", async () => {
            const outsideDir = path.dirname(path.resolve(config.UPLOAD_DIR));
            const escapeFile = path.join(outsideDir, `escape_test_${Date.now()}.txt`);
            await fs.writeFile(escapeFile, "archivo fuera del directorio de uploads");

            try {
                const traversalPath = path.join(config.UPLOAD_DIR, "..", path.basename(escapeFile));
                await safeUnlink(traversalPath);

                const content = await fs.readFile(escapeFile, "utf-8");
                expect(content).to.equal("archivo fuera del directorio de uploads");
            } finally {
                await fs.rm(escapeFile, { force: true });
            }
        });

        it("no debe romper ni lanzar error ante un archivo inexistente (idempotencia ante ENOENT)", async () => {
            const nonExistent = path.join(config.UPLOAD_DIR, "temp", `no_existe_${Date.now()}.txt`);
            let error = null;
            try {
                await safeUnlink(nonExistent);
            } catch (err) {
                error = err;
            }
            expect(error).to.be.null;
        });

        it("debe permitir eliminar archivos legítimos cuyos nombres comiencen con dos puntos dentro de uploads", async () => {
            const dotFile = path.join(config.UPLOAD_DIR, "temp", `..archivo_con_puntos_${Date.now()}.txt`);
            await fs.writeFile(dotFile, "contenido legitimo con puntos");

            await safeUnlink(dotFile);

            let exists = true;
            try {
                await fs.access(dotFile);
            } catch {
                exists = false;
            }
            expect(exists).to.be.false;
        });

        it("isPathInside debe validar correctamente pertenencia, rechazando raíz, escapes y carpetas hermanas", () => {
            const root = path.resolve(config.UPLOAD_DIR);
            expect(isPathInside(root, path.join(root, "file.pdf"))).to.be.true;
            expect(isPathInside(root, path.join(root, "temp", "file.pdf"))).to.be.true;
            expect(isPathInside(root, path.join(root, "..legit.pdf"))).to.be.true;

            // Raíz misma
            expect(isPathInside(root, root)).to.be.false;

            // Carpeta hermana con prefijo idéntico
            expect(isPathInside(root, `${root}-sibling\\file.pdf`)).to.be.false;
            expect(isPathInside(root, `${root}-sibling/file.pdf`)).to.be.false;

            // Path traversal hacia arriba
            expect(isPathInside(root, path.join(root, "..", "file.pdf"))).to.be.false;
            expect(isPathInside(root, path.join(root, "temp", "..", "..", "file.pdf"))).to.be.false;
        });

        it("debe detener la limpieza y no invocar fs.unlink si falla fs.realpath() del directorio raíz", async () => {
            const normalFile = path.join(config.UPLOAD_DIR, "temp", `root_fail_${Date.now()}.txt`);
            await fs.writeFile(normalFile, "contenido que debe permanecer intacto");

            const originalRealpath = fs.realpath;
            let unlinkCalled = false;
            const originalUnlink = fs.unlink;

            fs.unlink = async (...args) => {
                unlinkCalled = true;
                return originalUnlink.apply(fs, args);
            };

            fs.realpath = async (p, opts) => {
                if (path.resolve(p) === path.resolve(config.UPLOAD_DIR)) {
                    throw new Error("EACCES: permission denied, fallo simulado en raíz");
                }
                return originalRealpath(p, opts);
            };

            try {
                await safeUnlink(normalFile);
                expect(unlinkCalled).to.be.false;

                // El archivo físico debe permanecer intacto
                const content = await fs.readFile(normalFile, "utf-8");
                expect(content).to.equal("contenido que debe permanecer intacto");
            } finally {
                fs.realpath = originalRealpath;
                fs.unlink = originalUnlink;
                await fs.rm(normalFile, { force: true });
            }
        });

        it("debe detener la limpieza y no invocar fs.unlink si falla fs.realpath() del destino con un error distinto de ENOENT", async () => {
            const normalFile = path.join(config.UPLOAD_DIR, "temp", `dest_fail_${Date.now()}.txt`);
            await fs.writeFile(normalFile, "contenido de destino que debe permanecer intacto");

            const originalRealpath = fs.realpath;
            let unlinkCalled = false;
            const originalUnlink = fs.unlink;

            fs.unlink = async (...args) => {
                unlinkCalled = true;
                return originalUnlink.apply(fs, args);
            };

            fs.realpath = async (p, opts) => {
                if (path.resolve(p) === path.resolve(normalFile)) {
                    const err = new Error("EPERM: operation not permitted");
                    err.code = "EPERM";
                    throw err;
                }
                return originalRealpath(p, opts);
            };

            try {
                await safeUnlink(normalFile);
                expect(unlinkCalled).to.be.false;

                const content = await fs.readFile(normalFile, "utf-8");
                expect(content).to.equal("contenido de destino que debe permanecer intacto");
            } finally {
                fs.realpath = originalRealpath;
                fs.unlink = originalUnlink;
                await fs.rm(normalFile, { force: true });
            }
        });
    });
});

