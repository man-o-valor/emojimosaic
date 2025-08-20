const express = require("express");
const multer = require("multer");
const path = require("path");

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

const fs = require("fs");
const { createCanvas, loadImage } = require("canvas");
const emojiUnicode = require("emoji-unicode");

async function generateMosaic(config) {
  const {
    design,
    imagePath,
    width,
    height,
    ignoreAlpha,
    bgColor,
    includeEmojis,
    excludeEmojis,
    includeZwj,
    outputAsImage,
    HDOutput,
  } = config;

  const img = await loadImage(imagePath);
  const aspectRatio = img.height / img.width;
  const outWidth = width || img.width;
  const outHeight = height || Math.round(width * aspectRatio);

  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const includeSet = includeEmojis
    ? new Set(
        Array.from(segmenter.segment(includeEmojis), (seg) => seg.segment)
      )
    : null;
  const excludeSet = excludeEmojis
    ? new Set(
        Array.from(segmenter.segment(excludeEmojis), (seg) => seg.segment)
      )
    : null;

  const canvas = createCanvas(outWidth, outHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, outWidth, outHeight);

  const imageData = ctx.getImageData(0, 0, outWidth, outHeight);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 255) {
      const alpha = data[i + 3] / 255;
      data[i] = Math.round(data[i] * alpha);
      data[i + 1] = Math.round(data[i + 1] * alpha);
      data[i + 2] = Math.round(data[i + 2] * alpha);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const colorFile = {
    noto: "noto_colors.json",
    twemoji: "twemoji_colors.json",
    fluent: "fluent_colors.json",
    samsung: "samsung_colors.json",
  }[design];
  const emojiColors = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", colorFile), "utf8")
  );
  const emojis = Object.keys(emojiColors);

  function closestEmoji(r, g, b) {
    let minDist = Infinity,
      bestEmoji = emojis[0];
    for (const emoji of emojis) {
      if (includeSet && !includeSet.has(emoji)) continue;
      if (!includeSet && excludeSet && excludeSet.has(emoji)) continue;
      if (!includeZwj && [...emoji].length > 1) continue;
      const ec = emojiColors[emoji];
      let testR, testG, testB;
      if (ignoreAlpha) {
        testR = ec.r;
        testG = ec.g;
        testB = ec.b;
      } else {
        const alpha = ec.a / 255;
        testR = Math.round(ec.r * alpha + bgColor.r * (1 - alpha));
        testG = Math.round(ec.g * alpha + bgColor.g * (1 - alpha));
        testB = Math.round(ec.b * alpha + bgColor.b * (1 - alpha));
      }
      const dr = r - testR,
        dg = g - testG,
        db = b - testB;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        bestEmoji = emoji;
      }
    }
    return bestEmoji;
  }

  let mosaic = "";
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const idx = (y * outWidth + x) * 4;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      mosaic += closestEmoji(r, g, b);
    }
    mosaic += "\n";
  }

  let toReturn;

  if (outputAsImage) {
    const emojiSize = 72;
    const spacing = 8;
    const gridWidth = outWidth * (emojiSize + spacing) - spacing;
    const gridHeight = outHeight * (emojiSize + spacing) - spacing;
    const outCanvas = createCanvas(gridWidth, gridHeight);
    const outCtx = outCanvas.getContext("2d");
    outCtx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
    outCtx.fillRect(0, 0, gridWidth, gridHeight);

    const { styles } = require("./emojistyles");

    const styleConfig =
      styles[design.charAt(0).toUpperCase() + design.slice(1)];

    const uniqueEmojis = new Set();
    const mosaicString = mosaic.replace(/\n/g, "");
    const emojiSegmenter = new Intl.Segmenter("en", {
      granularity: "grapheme",
    });
    for (const seg of emojiSegmenter.segment(mosaicString)) {
      uniqueEmojis.add(seg.segment);
    }

    const fetch = require("node-fetch");
    const { loadImage: loadCanvasImage } = require("canvas");
    const tempBase = path.join(__dirname, "temp");
    if (!fs.existsSync(tempBase)) {
      fs.mkdirSync(tempBase);
    }
    const tempDir = fs.mkdtempSync(path.join(tempBase, "run-"));
    let emojiImagePaths = {};
    for (const emoji of uniqueEmojis) {
      const url = styleConfig.baseUrl + styleConfig.filename(emoji);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Not found: ${url}`);
        const buffer = await res.buffer();
        const filePath = path.join(tempDir, `${emojiUnicode(emoji)}.png`);
        fs.writeFileSync(filePath, buffer);
        emojiImagePaths[emoji] = filePath;
      } catch (err) {
        console.error(`Failed to fetch emoji ${emoji}: ${url}`);
        console.error(err);
      }
    }

    for (let y = 0; y < outHeight; y++) {
      const row = mosaic.split("\n")[y];
      const rowEmojis = Array.from(
        new Intl.Segmenter("en", { granularity: "grapheme" }).segment(row),
        (seg) => seg.segment
      );
      for (let x = 0; x < outWidth; x++) {
        const emoji = rowEmojis[x];
        const imgPath = emojiImagePaths[emoji];
        if (imgPath && fs.existsSync(imgPath)) {
          const img = await loadCanvasImage(fs.readFileSync(imgPath));
          outCtx.drawImage(
            img,
            x * (emojiSize + spacing),
            y * (emojiSize + spacing),
            emojiSize,
            emojiSize
          );
        }
      }
    }
    let buffer;
    if (!HDOutput) {
      const resizeCanvas = createCanvas(img.width, img.height);
      const resizeCtx = resizeCanvas.getContext("2d");
      resizeCtx.drawImage(
        outCanvas,
        0,
        0,
        gridWidth,
        gridHeight,
        0,
        0,
        img.width,
        img.height
      );
      buffer = resizeCanvas.toBuffer("image/png");
    } else {
      buffer = outCanvas.toBuffer("image/png");
    }

    // Clean up temp files
    for (const file of fs.readdirSync(tempDir)) {
      fs.unlinkSync(path.join(tempDir, file));
    }
    fs.rmdirSync(tempDir);
    try {
      if (fs.existsSync(tempBase) && fs.readdirSync(tempBase).length === 0) {
        fs.rmdirSync(tempBase);
      }
    } catch (err) {
      console.error("Error deleting temp base directory:", err);
    }

    toReturn = { buffer, mimeType: "image/png", filename: `mosaic.png` };
  } else {
    const buffer = Buffer.from(mosaic, "utf8");
    toReturn = { buffer, mimeType: "text/plain", filename: `mosaic.txt` };
  }
  fs.unlink(imagePath, (err) => {
    if (err) {
      console.error("Error deleting file:", err);
    }
  });
  return toReturn;
}
