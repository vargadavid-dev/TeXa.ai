// File System Access API és IndexedDB alapú helyi munkakönyvtár kezelő
// A fájlok és mappák 100%-ban a felhasználó saját gépén élnek, a szerverre semmi sem mentődik.

const DB_NAME = 'ai_latex_studio_db';
const STORE_NAME = 'workspace_handles';
const HANDLE_KEY = 'root_dir_handle';

// ── 1. IndexedDB Segédfüggvények a mappajogosultság tartós megőrzéséhez ──

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandleToDB(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getHandleFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function clearHandleFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ── 2. Fő Munkakönyvtár Kezelő Osztály ──

export const localWorkspace = {
  // Támogatja-e a felhasználó böngészője a közvetlen merevlemez-hozzáférést?
  isSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  },

  // Natív mappa kiválasztása a felhasználó saját gépén
  async selectDirectory() {
    if (!this.isSupported()) {
      throw new Error('A böngésződ nem támogatja a közvetlen mappaelérést. Kérjük, használj Google Chrome vagy Microsoft Edge böngészőt!');
    }

    const dirHandle = await window.showDirectoryPicker({
      id: 'ai-latex-workspace',
      mode: 'readwrite',
      startIn: 'documents'
    });

    await saveHandleToDB(dirHandle);
    return dirHandle;
  },

  // Korábban elmentett mappa lekérése jogosultság-ellenőrzéssel
  async getSavedDirectory() {
    if (!this.isSupported()) return null;
    try {
      const handle = await getHandleFromDB();
      if (!handle) return null;

      // Ellenőrizzük, hogy él-e még az olvasás/írási engedély
      const queryPerm = await handle.queryPermission({ mode: 'readwrite' });
      if (queryPerm === 'granted') {
        return handle;
      }
      return { handle, needsPermission: true };
    } catch (err) {
      console.warn('Nem sikerült betölteni a korábbi munkakönyvtárat:', err);
      return null;
    }
  },

  // Jogosultság megerősítése (újratöltéskor a böngésző rákérdez)
  async requestPermission(handle) {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    return perm === 'granted';
  },

  // Munkakönyvtár leválasztása
  async disconnectDirectory() {
    await clearHandleFromDB();
  },

  // ── 3. Helyi Fájlfa és Tartalom Beolvasása ──

  // Rekurzívan beolvassa a helyi mappát, és előállítja a Sidebar számára a fát
  async readDirectoryTree(dirHandle, pathPrefix = '') {
    const files = [];
    const folders = [];
    let totalCount = 0;

    for await (const entry of dirHandle.values()) {
      if (entry.name.startsWith('.')) continue; // Rejtett fájlok (.git, .DS_Store) kihagyása

      const relPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;

      if (entry.kind === 'directory') {
        const sub = await this.readDirectoryTree(entry, relPath);
        folders.push({
          name: entry.name,
          path: relPath,
          relativePath: relPath,
          isFolder: true,
          handle: entry,
          folders: sub.folders,
          files: sub.files,
          totalCount: sub.totalCount
        });
        totalCount += sub.totalCount;
      } else if (entry.kind === 'file' && entry.name.endsWith('.tex')) {
        files.push({
          name: entry.name,
          path: relPath,
          relativePath: relPath,
          isFolder: false,
          handle: entry,
          tags: []
        });
        totalCount += 1;
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name, 'hu'));
    files.sort((a, b) => a.name.localeCompare(b.name, 'hu'));

    return { files, folders, totalCount };
  },

  // Előállítja a Sidebar által várt fa struktúrát
  async getProjectTree(dirHandle) {
    const raw = await this.readDirectoryTree(dirHandle);
    const tree = {};
    const availableFolders = [];

    function collectFolders(node, list = [], depth = 0) {
      list.push({
        name: node.name,
        path: node.path,
        relativePath: node.relativePath,
        depth
      });
      if (Array.isArray(node.folders)) {
        for (const sub of node.folders) {
          collectFolders(sub, list, depth + 1);
        }
      }
      return list;
    }

    // Főmappák felvétele
    if (raw.folders.length > 0) {
      for (const f of raw.folders) {
        tree[f.name] = f;
        collectFolders(f, availableFolders, 0);
      }
    }

    // Ha vannak gyökérfájlok közvetlenül a főkönyvtárban
    if (raw.files.length > 0 || raw.folders.length === 0) {
      const rootCatName = dirHandle.name || 'Dokumentumok';
      tree[rootCatName] = {
        name: rootCatName,
        path: '',
        relativePath: '',
        isFolder: true,
        folders: [],
        files: raw.files,
        totalCount: raw.files.length
      };
      availableFolders.unshift({
        name: rootCatName,
        path: '',
        relativePath: '',
        depth: 0
      });
    }

    return { tree, availableFolders, totalCount: raw.totalCount };
  },

  // ── 4. Fájlműveletek (Írás, Olvasás, Új Mappa, Törlés) ──

  // Egy fájl tartalmának kiolvasása a helyi gépről
  async readFileContent(dirHandle, relativePath) {
    const fileHandle = await this.getFileHandleFromPath(dirHandle, relativePath);
    const file = await fileHandle.getFile();
    return await file.text();
  },

  // Fájl mentése / létrehozása a helyi merevlemezen
  async saveFileContent(dirHandle, relativePath, content) {
    const parts = relativePath.split('/').filter(Boolean);
    const filename = parts.pop();

    let currentDir = dirHandle;
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await currentDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  },

  // Új mappa létrehozása a helyi merevlemezen
  async createFolder(dirHandle, parentPath, newFolderName) {
    let currentDir = dirHandle;
    if (parentPath) {
      const parts = parentPath.split('/').filter(Boolean);
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: true });
      }
    }
    await currentDir.getDirectoryHandle(newFolderName, { create: true });
    return true;
  },

  // Fájl vagy mappa törlése
  async deleteEntry(dirHandle, relativePath) {
    const parts = relativePath.split('/').filter(Boolean);
    const targetName = parts.pop();

    let parentDir = dirHandle;
    for (const part of parts) {
      parentDir = await parentDir.getDirectoryHandle(part);
    }

    await parentDir.removeEntry(targetName, { recursive: true });
    return true;
  },

  // Fájl áthelyezése / átnevezése
  async renameFile(dirHandle, oldRelativePath, newRelativePath) {
    const content = await this.readFileContent(dirHandle, oldRelativePath);
    await this.saveFileContent(dirHandle, newRelativePath, content);
    await this.deleteEntry(dirHandle, oldRelativePath);
    return true;
  },

  // Segédfüggvény: elérési út alapján megkeresi a FileHandle-t
  async getFileHandleFromPath(dirHandle, relativePath) {
    const parts = relativePath.split('/').filter(Boolean);
    const filename = parts.pop();

    let currentDir = dirHandle;
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part);
    }

    return await currentDir.getFileHandle(filename);
  }
};
