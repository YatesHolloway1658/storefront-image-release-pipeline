import sharp from "sharp";

const imageBase64 = (await sharp({
  create: { width: 1200, height: 900, channels: 3, background: "#24a148" },
}).png().toBuffer()).toString("base64");

const response = await fetch("http://localhost:3000/releases/images", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    releaseId: "checkout-refresh-42",
    productSlug: "canvas-weekender",
    imageBase64,
    contentType: "image/png",
    thumbnailWidth: 640,
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));
