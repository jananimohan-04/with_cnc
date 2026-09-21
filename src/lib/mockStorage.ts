export const setMockImage = async (key: string, file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MockERPStorage", 1);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as any).result;
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images");
      }
    };
    
    request.onsuccess = (e) => {
      const db = (e.target as any).result;
      const tx = db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      // Store using lowercased key to be robust
      store.put(file, key.toLowerCase().trim());
      
      tx.oncomplete = () => {
        resolve(URL.createObjectURL(file));
      };
      tx.onerror = () => reject(tx.error);
    };
    
    request.onerror = () => reject(request.error);
  });
};

export const getMockImage = async (key: string): Promise<string | null> => {
  if (!key) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MockERPStorage", 1);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as any).result;
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images");
      }
    };
    
    request.onsuccess = (e) => {
      const db = (e.target as any).result;
      
      if (!db.objectStoreNames.contains("images")) {
        resolve(null);
        return;
      }

      const tx = db.transaction("images", "readonly");
      const store = tx.objectStore("images");
      const getReq = store.get(key.toLowerCase().trim());
      
      getReq.onsuccess = () => {
        if (getReq.result) {
          resolve(URL.createObjectURL(getReq.result));
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => reject(getReq.error);
    };
    
    request.onerror = () => reject(request.error);
  });
};
