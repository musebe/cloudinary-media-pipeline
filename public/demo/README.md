# Reusable demo images

`product-shoe.jpg` is a Cloudinary sample image from [the demo cloud](https://res.cloudinary.com/demo/image/upload/cld-sample-5.jpg). It was retained in the project's Cloudinary environment after one authorized upload. Source identity, version, verification time, and checksum are recorded in `fixtures/demo-image.json`.

`storefront.webp`, `social.webp`, and `catalog.webp` are actual Cloudinary eager outputs downloaded and verified on October 14, 2026. Their exact transformations, derived IDs, sizes, and SHA-256 checksums are in `fixtures/demo-outputs.json`. Creation used three standard transformations, two Admin reads, and three delivery reads. No AI analysis or generation ran.

These files let visitors try the deployed workflow without processing new images. They are public demonstration assets, not approval decisions. Every application run starts with human review pending. Never store credentials or signed delivery URLs in fixtures.
