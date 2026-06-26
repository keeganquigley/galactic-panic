// Galactic Panic merch — the single source of truth for the Store page.
//
// Each product: { id, name, image, alt, price, checkout_url, sold_out }
//   - checkout_url: the Square Online Checkout link for the item. Leave null to
//     keep the product in its "For Sale Soon" state (button not yet active).
//   - sold_out: set true to show a "Sold Out" badge. Inventory is enforced by
//     Square itself (each tee/CD is capped at 30, shared with the in-person
//     Square Reader); this flag just reflects a fully-sold-out item on the site.
//   - price: display only — Square is the source of truth for the charged amount.
//   - T-shirt size (S/M/L/XL) is chosen on Square's hosted checkout page, so one
//     checkout_url per design is all that's needed here.
module.exports = [
  {
    id: "shirt-black",
    name: "T-Shirt — Black",
    image: "site/assets/store/shirt-black.png",
    alt: "Galactic Panic T-shirt, black",
    price: "$25",
    checkout_url: null,
    sold_out: false,
  },
  {
    id: "shirt-white",
    name: "T-Shirt — White",
    image: "site/assets/store/shirt-white.png",
    alt: "Galactic Panic T-shirt, white",
    price: "$25",
    checkout_url: null,
    sold_out: false,
  },
  {
    id: "stickers",
    name: "Stickers",
    image: "site/assets/store/sticker.png",
    alt: "Galactic Panic stickers",
    price: "$5",
    checkout_url: null,
    sold_out: false,
  },
  {
    id: "cd",
    name: "CD",
    image: "site/assets/store/cd.jpg",
    alt: "Galactic Panic CD",
    price: "$12",
    checkout_url: null,
    sold_out: false,
  },
];
