//keeps the last uploaded video and audio in IndexedDB, so they survive a reload. object URLs
//don't outlive the page, and localStorage is too small for media files

const dbName = "music_viz_gltchr";
const storeName = "media";

//opens the database, creating its one store the first time
function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

//runs one request on the store and resolves with its result once the transaction is done
async function withStore(mode, makeRequest) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = makeRequest(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

//saves an uploaded file under its type ("video" or "audio"), replacing the last one.
//the name is kept separately since some browsers store a File as a plain Blob
export function saveMedia(type, file) {
  return withStore("readwrite", store => store.put({ blob: file, name: file.name }, type));
}

//the saved { blob, name } for a type, or undefined if there's none
export function loadMedia(type) {
  return withStore("readonly", store => store.get(type));
}
