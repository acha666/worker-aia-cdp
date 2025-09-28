import * as pkijs from "pkijs";

export function initializePkijsEngine() {
  pkijs.setEngine(
    "cloudflare",
    new pkijs.CryptoEngine({ name: "cloudflare", crypto, subtle: crypto.subtle }),
  );
}

export { pkijs };
