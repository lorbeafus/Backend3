import { DocumentDTO } from "./document.dto.js";

export class UserDTO {
    constructor(user) {
        if (!user) return;
        this.id = user._id ? user._id.toString() : user.id;
        this.first_name = user.first_name;
        this.last_name = user.last_name;
        this.email = user.email;
        this.role = user.role;
        if (user.documents && Array.isArray(user.documents)) {
            this.documents = DocumentDTO.getFrom(user.documents);
        }
    }

    static getFrom(user) {
        if (!user) return null;
        if (Array.isArray(user)) {
            return user.map((u) => new UserDTO(u));
        }
        return new UserDTO(user);
    }
}

export class CurrentUserDTO {
    constructor(user) {
        if (!user) return;
        this.id = user._id ? user._id.toString() : user.id;
        this.email = user.email;
        this.role = user.role;
        if (user.first_name) this.first_name = user.first_name;
        if (user.last_name) this.last_name = user.last_name;
    }

    static getFrom(user) {
        if (!user) return null;
        return new CurrentUserDTO(user);
    }
}
