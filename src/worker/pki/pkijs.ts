/**
 * PKI.js Initialization & Engine Setup
 */

import * as pkijs from "pkijs";

/**
 * Initialize PKI.js with Cloudflare's crypto engine
 */
export function initializePkijsEngine() {
  pkijs.setEngine(
    "cloudflare",
    new pkijs.CryptoEngine({
      name: "cloudflare",
      crypto,
      subtle: crypto.subtle,
    })
  );
}

// Re-export pkijs for use throughout the application
export { pkijs };
