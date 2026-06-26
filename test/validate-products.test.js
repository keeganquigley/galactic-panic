// Lean tests for the Store catalog validator. Focus is on the failure modes
// that actually matter: a "Buy Now" button pointing at a dead link, a broken
// image, or a sold-out item that's somehow still buyable. Built on Node's
// zero-dependency test runner.
//
//   node --test

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { validateProducts } = require("../scripts/validate-products.js");

// A known-good product — each test clones this and breaks one thing.
function validProduct(overrides = {}) {
  return {
    id: "shirt-black",
    name: "T-Shirt — Black",
    image: "site/assets/store/shirt-black.png",
    alt: "Galactic Panic T-shirt, black",
    price: "$25",
    checkout_url: null,
    sold_out: false,
    ...overrides,
  };
}

// Image checks are off by default here (assume present); tests that care pass
// their own imageExists.
const ok = { imageExists: () => true };

test("a valid catalog produces no errors", () => {
  assert.deepEqual(validateProducts([validProduct()], ok), []);
});

test("a non-array export is rejected", () => {
  assert.equal(validateProducts({}, ok).length, 1);
  assert.match(validateProducts(null, ok)[0], /must export an array/);
});

test("a missing required field is caught", () => {
  const p = validProduct();
  delete p.name;
  const errors = validateProducts([p], ok);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"name" must be a non-empty string/);
});

test("a non-kebab-case id is caught", () => {
  const errors = validateProducts([validProduct({ id: "Shirt_Black" })], ok);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /kebab-case/);
});

test("duplicate ids are caught", () => {
  const errors = validateProducts([validProduct(), validProduct()], ok);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicated/);
});

test("a missing image file is caught", () => {
  const errors = validateProducts([validProduct()], { imageExists: () => false });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"image" file not found/);
});

test("a non-https checkout_url is caught (the lost-sale failure mode)", () => {
  const errors = validateProducts([validProduct({ checkout_url: "square.link/u/x" })], ok);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must be null or an https URL/);
});

test("a valid https checkout_url passes", () => {
  const p = validProduct({ checkout_url: "https://square.link/u/ABCDEFGH" });
  assert.deepEqual(validateProducts([p], ok), []);
});

test("a non-boolean sold_out is caught", () => {
  const errors = validateProducts([validProduct({ sold_out: "yes" })], ok);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"sold_out" must be a boolean/);
});

test("sold_out + a live checkout_url is flagged as dead config", () => {
  const p = validProduct({ sold_out: true, checkout_url: "https://square.link/u/X" });
  const errors = validateProducts([p], ok);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sold_out but still has a checkout_url/);
});

// The real catalog must always validate against the real image files on disk —
// this is the check that guards an actual broken commit, like the metadata
// validator's "valid metadata produces no errors" test.
test("the real site/_data/products.js is valid", () => {
  const products = require("../site/_data/products.js");
  const repoRoot = path.join(__dirname, "..");
  const imageExists = (rel) => fs.existsSync(path.join(repoRoot, rel));
  assert.deepEqual(validateProducts(products, { imageExists }), []);
});
