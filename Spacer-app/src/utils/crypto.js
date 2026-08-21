/**
 * Cryptographic utility using Web Crypto API (AES-GCM)
 * Encrypts and decrypts sensitive data locally before persistence.
 */

// Retrieve or generate a master key stored in local storage.
// This is user-specific and is not stored on the database.
export async function getOrCreateMasterKey() {
  let keyStr = localStorage.getItem("spacers_vault_key");
  if (!keyStr) {
    const key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exported = await window.crypto.subtle.exportKey("raw", key);
    keyStr = btoa(String.fromCharCode(...new Uint8Array(exported)));
    localStorage.setItem("spacers_vault_key", keyStr);
  }
  return keyStr;
}

/**
 * Encrypts plaintext using AES-GCM (256-bit)
 * Returns a base64 encoded string containing the salt/IV and ciphertext.
 */
export async function encryptText(plaintext, keyStr) {
  try {
    if (!plaintext) return "";
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // Generate cryptographically secure 12-byte IV (Initialization Vector)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Import raw key
    const binaryKey = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      binaryKey,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"]
    );

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      data
    );

    // Combine IV and Ciphertext for storage
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Return as base64 string
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption failed:", error);
    throw error;
  }
}

/**
 * Decrypts AES-GCM base64 encoded ciphertext
 */
export async function decryptText(ciphertextStr, keyStr) {
  try {
    if (!ciphertextStr) return "";
    const combined = Uint8Array.from(atob(ciphertextStr), c => c.charCodeAt(0));
    if (combined.length < 12) return "";
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    // Import raw key
    const binaryKey = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      binaryKey,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"]
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Decryption Error: Invalid Key or Corrupted Data]";
  }
}
