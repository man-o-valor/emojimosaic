const express = require("express");
const multer = require("multer");
const path = require("path");
const { generateMosaic } = require("./mosaic.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const upload = multer({ dest: "uploads/" });

app.post("/api/run", upload.single("image"), async (req, res) => {
  try {
    const config = {
      design: req.body.design,
      imagePath: req.file.path,
      width: parseInt(req.body.width),
      height: req.body.height ? parseInt(req.body.height) : undefined,
      ignoreAlpha: req.body.ignoreAlpha === "on",
      bgColor: parseRGB(req.body.bgColor),
      includeEmojis: req.body.includeEmojis || null,
      excludeEmojis: req.body.excludeEmojis || null,
      includeZwj: req.body.includeZwj === "on",
      outputAsImage: req.body.outputAsImage === "on",
      HDOutput: req.body.HDOutput === "on",
    };

    const { buffer, mimeType, filename } = await generateMosaic(config);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Error generating mosaic:", err);
    res.status(500).send("Something went wrong.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

function parseRGB(str) {
  const parts = str.split(",").map((x) => parseInt(x.trim()));
  return { r: parts[0], g: parts[1], b: parts[2] };
}
