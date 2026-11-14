// File bytes stay in IndexedDB; localStorage holds only their metadata.
async function fileTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("zyx-public-demo-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("STORAGE_BLOCKED"));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("files", mode);
      const request = action(transaction.objectStore("files"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export const storeDemoFile = (scope: string, id: string, file: File) => fileTransaction("readwrite", store => store.put(file, `${scope}:${id}`));
export const readDemoFile = (scope: string, id: string) => fileTransaction<File | undefined>("readonly", store => store.get(`${scope}:${id}`));
export const deleteDemoFile = (scope: string, id: string) => fileTransaction("readwrite", store => store.delete(`${scope}:${id}`));
