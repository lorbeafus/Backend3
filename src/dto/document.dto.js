export class DocumentDTO {
    constructor(doc) {
        if (!doc) return;
        this.id = doc._id ? doc._id.toString() : doc.id;
        this.original_name = doc.original_name;
        this.filename = doc.filename;
        this.path = doc.path;
        this.mimetype = doc.mimetype;
        this.size = doc.size;
        this.type = doc.type;
        this.uploaded_at = doc.uploaded_at instanceof Date ? doc.uploaded_at.toISOString() : doc.uploaded_at;
    }

    static getFrom(doc) {
        if (!doc) return null;
        if (Array.isArray(doc)) {
            return doc.map((d) => new DocumentDTO(d));
        }
        return new DocumentDTO(doc);
    }
}

