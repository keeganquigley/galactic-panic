#!/usr/bin/env node
//
// Validates site/_data/products.js — the Store page catalog. A broken product
// entry fails quietly in a worse way than a broken metadata.json: a typo'd
// checkout_url ships a live "Buy Now" button that sends a customer to a dead
// link — a lost sale. This script fails loudly instead. Run it locally with
// `npm run validate` and in CI on every PR.
//
// Zero runtime dependencies on purpose. The validation logic is exported (see
// module.exports) so it can be unit-tested; running the file directly runs the
// CLI against site/_data/products.js.

const fs = require("fs");
const path = require("path");

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // kebab-case (also the buy-<id> key)
const HTTPS_RE = /^https:\/\//; // Square checkout links are always https

// Validates the full products array. `imageExists(relPath)` answers whether a
// product's image is present on disk; it's injected so unit tests run without a
// filesystem. Returns an array of error strings (empty when the catalog is ok).
function validateProducts(products, { imageExists = () => true } = {}) {
  if (!Array.isArray(products)) {
    return [`products.js must export an array (got ${typeof products})`];
  }

  const errors = [];
  const seenIds = new Set();

  products.forEach((p, i) => {
    // Label each error by id when we have one, otherwise by array index.
    const label = p && typeof p.id === "string" && p.id ? p.id : `#${i}`;
    const fail = (msg) => errors.push(`product ${label}: ${msg}`);

    if (p === null || typeof p !== "object" || Array.isArray(p)) {
      fail("must be an object");
      return;
    }

    // id — required, kebab-case, unique. It keys the GoatCounter buy-<id> attr.
    if (typeof p.id !== "string" || !p.id) {
      fail(`"id" must be a non-empty string (got ${JSON.stringify(p.id)})`);
    } else {
      if (!ID_RE.test(p.id)) fail(`"id" must be kebab-case (got ${JSON.stringify(p.id)})`);
      if (seenIds.has(p.id)) fail(`"id" is duplicated`);
      seenIds.add(p.id);
    }

    // Required display strings.
    for (const key of ["name", "image", "alt", "price"]) {
      if (typeof p[key] !== "string" || !p[key]) {
        fail(`"${key}" must be a non-empty string (got ${JSON.stringify(p[key])})`);
      }
    }

    // image must point at a real file, or the card silently renders broken.
    if (typeof p.image === "string" && p.image && !imageExists(p.image)) {
      fail(`"image" file not found: ${p.image}`);
    }

    // checkout_url — null/absent (not yet live), or an https URL.
    if (p.checkout_url !== null && p.checkout_url !== undefined) {
      if (typeof p.checkout_url !== "string" || !HTTPS_RE.test(p.checkout_url)) {
        fail(`"checkout_url" must be null or an https URL (got ${JSON.stringify(p.checkout_url)})`);
      }
    }

    // sold_out — must be an explicit boolean.
    if (typeof p.sold_out !== "boolean") {
      fail(`"sold_out" must be a boolean (got ${JSON.stringify(p.sold_out)})`);
    }

    // State coherence: sold_out hides the Buy Now button, so a sold-out product
    // that still carries a checkout_url is dead config — flag the ambiguity.
    if (p.sold_out === true && typeof p.checkout_url === "string" && p.checkout_url) {
      fail("is sold_out but still has a checkout_url — remove one (sold_out hides the Buy Now button)");
    }
  });

  return errors;
}

function main() {
  const productsPath =
    process.env.PRODUCTS_FILE ||
    path.join(__dirname, "..", "site", "_data", "products.js");

  if (!fs.existsSync(productsPath)) {
    console.error(`No products file at ${productsPath}`);
    process.exit(1);
  }

  let products;
  try {
    products = require(productsPath);
  } catch (e) {
    console.error(`✗ could not load ${productsPath} — ${e.message}`);
    process.exit(1);
  }

  // Image paths in products.js are repo-root-relative (e.g. site/assets/...).
  const repoRoot = path.join(__dirname, "..");
  const imageExists = (rel) => fs.existsSync(path.join(repoRoot, rel));

  const errors = validateProducts(products, { imageExists });

  if (errors.length) {
    console.error(`✗ products validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):\n`);
    console.error(errors.map((e) => `  ${e}`).join("\n"));
    console.error("");
    process.exit(1);
  }

  console.log(`✓ products valid — ${products.length} product${products.length === 1 ? "" : "s"} checked`);
}

if (require.main === module) main();

module.exports = { validateProducts };
