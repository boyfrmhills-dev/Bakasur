/* ========== CONFIG ========== */
let VAULT_PASSWORD = "1234";   // default user password
const ADMIN_PASSWORD = "Amankumar@16";
const SECRET_KEY = "relink-secret-key";
const MAX_FILE_SIZE = 1 * 1024 * 1024;

let currentUserId = null;   // "user" or "admin"
let db = null;

/* ========== INIT IndexedDB ========== */
const request = indexedDB.open("MemoryVaultDB", 4);

request.onupgradeneeded = function (event) {
    db = event.target.result;

    if (!db.objectStoreNames.contains("memories")) {
        const store = db.createObjectStore("memories", { keyPath: "id", autoIncrement: true });
        store.createIndex("ownerId", "ownerId", { unique: false });
    } else {
        const store = request.transaction.objectStore("memories");
        if (!store.indexNames.contains("ownerId")) {
            store.createIndex("ownerId", "ownerId", { unique: false });
        }
    }

    if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
    }
};

request.onsuccess = function (event) {
    db = event.target.result;
    loadSavedPassword();
};

request.onerror = function () {
    alert("Database error");
};

/* ========== LOAD PASSWORD FROM DB ========== */
function loadSavedPassword() {
    const tx = db.transaction("settings", "readonly");
    const store = tx.objectStore("settings");

    const req = store.get("vaultPassword");

    req.onsuccess = () => {
        if (req.result) {
            VAULT_PASSWORD = req.result.value;
        }
    };
}

/* ========== SAVE PASSWORD INTO DB ========== */
function savePasswordToDB(newPassword) {
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");

    store.put({ key: "vaultPassword", value: newPassword });

    tx.oncomplete = () => {
        VAULT_PASSWORD = newPassword;
        alert("Password changed successfully!");
        closePasswordModal();
    };
}

/* ========== LOGIN / UNLOCK ========== */
document.getElementById("unlockBtn").addEventListener("click", () => {
    const pass = document.getElementById("vaultPassword").value;

    if (pass === ADMIN_PASSWORD) {
        currentUserId = "admin";
        startApp(true);
    }
    else if (pass === VAULT_PASSWORD) {
        currentUserId = "user";
        startApp(false);
    }
    else {
        alert("Incorrect password");
    }
});

function startApp(isAdmin) {
    document.getElementById("lockScreen").style.display = "none";
    document.getElementById("mainApp").style.display = "block";

    if (isAdmin) {
        document.getElementById("uploadSection").style.display = "none";
        loadAllMemories();
    } else {
        document.getElementById("uploadSection").style.display = "block";
        loadUserMemories();
    }
}

/* ========== LOGOUT ========== */
document.getElementById("logoutBtn").onclick = () => {
    location.reload();
};

/* ========== CHANGE PASSWORD MODAL ========== */
const modal = document.getElementById("passwordModal");

document.getElementById("changePassBtn").onclick = () => {
    if (currentUserId === "admin") {
        alert("Admin cannot change user password.");
        return;
    }
    modal.style.display = "flex";
};

document.getElementById("closePassModal").onclick = closePasswordModal;

function closePasswordModal() {
    modal.style.display = "none";
    document.getElementById("oldPass").value = "";
    document.getElementById("newPass").value = "";
    document.getElementById("confirmPass").value = "";
}

/* ========== SAVE NEW PASSWORD ========== */
document.getElementById("savePassBtn").onclick = () => {
    const oldP = document.getElementById("oldPass").value;
    const newP = document.getElementById("newPass").value;
    const confirmP = document.getElementById("confirmPass").value;

    if (oldP !== VAULT_PASSWORD) {
        alert("Old password is incorrect.");
        return;
    }
    if (newP.length < 3) {
        alert("Password must be at least 3 characters.");
        return;
    }
    if (newP !== confirmP) {
        alert("New passwords do not match.");
        return;
    }

    savePasswordToDB(newP);
};

/* ========== MEMORY SAVE ========== */
document.getElementById("saveBtn").addEventListener("click", () => {
    if (currentUserId === "admin") return;

    const file = document.getElementById("fileInput").files[0];
    const title = document.getElementById("titleInput").value;
    const category = document.getElementById("categoryInput").value;
    const description = document.getElementById("descriptionInput").value;

    if (file && file.size > MAX_FILE_SIZE) {
        alert("File too large! Max 1 MB.");
        return;
    }

    if (!file && !description.trim()) {
        alert("Write something or upload a file.");
        return;
    }

    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            const encrypted = CryptoJS.AES.encrypt(
                CryptoJS.enc.Utf8.parse(e.target.result),
                SECRET_KEY
            ).toString();

            saveToDB({
                title,
                category,
                description,
                fileData: encrypted,
                type: file.type,
                fileName: file.name,
                ownerId: "user"
            });
        };
        reader.readAsDataURL(file);

    } else {
        const encrypted = CryptoJS.AES.encrypt(
            CryptoJS.enc.Utf8.parse(description),
            SECRET_KEY
        ).toString();

        saveToDB({
            title,
            category,
            description,
            fileData: encrypted,
            type: "text/plain",
            fileName: "note.txt",
            ownerId: "user"
        });
    }
});

/* ========== IndexedDB SAVE MEMORY ========== */
function saveToDB(memory) {
    const tx = db.transaction("memories", "readwrite");
    tx.objectStore("memories").add(memory);

    tx.oncomplete = () => {
        alert("Memory saved!");

        if (currentUserId === "admin") loadAllMemories();
        else loadUserMemories();
    };
}

/* ========== LOAD USER MEMORIES ========== */
function loadUserMemories() {
    const tx = db.transaction("memories", "readonly");
    const store = tx.objectStore("memories");
    const index = store.index("ownerId");

    const req = index.getAll("user");

    req.onsuccess = e => displayMemories(e.target.result);
}

/* ========== LOAD ALL MEMORIES (ADMIN) ========== */
function loadAllMemories() {
    const tx = db.transaction("memories", "readonly");
    tx.objectStore("memories").getAll().onsuccess = e => displayMemories(e.target.result);
}

/* ========== DELETE MEMORY ========== */
function deleteMemory(id) {
    const tx = db.transaction("memories", "readwrite");
    tx.objectStore("memories").delete(id);

    tx.oncomplete = () => {
        if (currentUserId === "admin") loadAllMemories();
        else loadUserMemories();
    };
}

/* ========== DISPLAY MEMORY CARDS ========== */
function displayMemories(memories) {
    const list = document.getElementById("memoryList");
    list.innerHTML = "";

    memories.forEach(m => {
        const div = document.createElement("div");
        div.className = "memory";

        const decryptedBytes = CryptoJS.AES.decrypt(m.fileData, SECRET_KEY);
        const decrypted = decryptedBytes.toString(CryptoJS.enc.Utf8);

        div.innerHTML = `
            <strong>${m.title}</strong><br>
            <small>${m.category} — <b>${currentUserId === "admin" ? "User" : "You"}</b></small>
            <p>${m.description}</p>
        `;

        if (m.type.startsWith("image")) {
            const img = document.createElement("img");
            img.src = decrypted;
            img.style.maxWidth = "100%";
            div.appendChild(img);
        }

        const download = document.createElement("a");
        download.textContent = "⬇️ Download";
        download.className = "download-btn";
        download.href = decrypted;
        download.download = m.fileName;
        download.target = "_blank";
        div.appendChild(download);

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑 Delete";
        delBtn.className = "delete-btn";
        delBtn.onclick = () => deleteMemory(m.id);
        div.appendChild(delBtn);

        list.appendChild(div);
    });
}
