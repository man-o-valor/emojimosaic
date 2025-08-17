const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const { createCanvas, loadImage } = require("canvas");

(async () => {
  const designPrompt = await inquirer.prompt([
    {
      type: "list",
      name: "design",
      message: "Which emoji design do you want to use?",
      choices: [
        { name: "Noto", value: "noto" },
        { name: "Twemoji", value: "twemoji" },
        { name: "Fluent", value: "fluent" },
        { name: "Samsung", value: "samsung" },
      ],
    },
  ]);
  const design = designPrompt.design;

  const imagePrompt = await inquirer.prompt([
    {
      type: "input",
      name: "imagePath",
      message: "Enter the path to the image file:",
      validate: (input) =>
        fs.existsSync(input.trim()) ? true : "File does not exist.",
    },
  ]);
  const imagePath = imagePrompt.imagePath.trim();

  let img;
  try {
    img = await loadImage(imagePath);
  } catch (err) {
    console.error("Failed to load image:", err);
    process.exit(1);
  }
  const defaultWidth = img.width;
  const aspectRatio = img.height / img.width;
  let defaultHeight = img.height;
  console.log(`Image loaded. Resolution: ${defaultWidth}x${defaultHeight}`);

  const resPrompt = await inquirer.prompt([
    {
      type: "input",
      name: "outWidth",
      message: `Enter output width:`,
      default: "100",
      filter: (input) => input.trim(),
      validate: (input) => {
        if (!input) return true;
        const val = parseInt(input);
        return Number.isFinite(val) && val > 0
          ? true
          : "Enter a positive integer.";
      },
    },
    {
      type: "input",
      name: "outHeight",
      message: `Enter output height:`,
      filter: (input) => input.trim(),
      validate: (input) => {
        if (!input) return true;
        const val = parseInt(input);
        return Number.isFinite(val) && val > 0
          ? true
          : "Enter a positive integer.";
      },
    },
  ]);
  let outWidth = defaultWidth;
  if (resPrompt.outWidth) {
    outWidth = parseInt(resPrompt.outWidth);
  }
  let outHeight;
  if (resPrompt.outHeight) {
    outHeight = parseInt(resPrompt.outHeight);
  } else {
    outHeight = Math.round(outWidth * aspectRatio);
  }
  console.log(`Output resolution set to: ${outWidth}x${outHeight}`);
  const alphaPrompt = await inquirer.prompt([
    {
      type: "confirm",
      name: "ignoreAlpha",
      message: "Ignore alpha channel (less clear image, more emoji variation)?",
      default: false,
    },
  ]);
  let bgColor = { r: 0, g: 0, b: 0 };
  if (!alphaPrompt.ignoreAlpha) {
    const bgPrompt = await inquirer.prompt([
      {
        type: "input",
        name: "bgColor",
        message: "Enter background color as r,g,b:",
        default: "0,0,0",
        filter: (input) => input.trim(),
      },
    ]);
    if (bgPrompt.bgColor) {
      const parts = bgPrompt.bgColor.split(",").map((x) => parseInt(x.trim()));
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        bgColor = { r: parts[0], g: parts[1], b: parts[2] };
      }
    }
  }
  const includeModePrompt = await inquirer.prompt([
    {
      type: "confirm",
      name: "chooseInclude",
      message:
        "Do you want to choose emojis to include (and exclude all others)?",
      default: false,
    },
  ]);
  let includeSet = null;
  let excludeSet = null;
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  if (includeModePrompt.chooseInclude) {
    const includePrompt = await inquirer.prompt([
      {
        type: "input",
        name: "includeEmojis",
        message: "Enter emojis to include (as a string):",
        filter: (input) => input.trim(),
      },
    ]);
    includeSet = new Set(
      Array.from(
        segmenter.segment(includePrompt.includeEmojis),
        (seg) => seg.segment
      )
    );
  } else {
    const excludePrompt = await inquirer.prompt([
      {
        type: "input",
        name: "excludeEmojis",
        message: "Enter emojis to exclude:",
        filter: (input) => input.trim(),
      },
    ]);
    excludeSet = new Set(
      Array.from(
        segmenter.segment(excludePrompt.excludeEmojis),
        (seg) => seg.segment
      )
    );
    excludeSet = new Set(
      Array.from(
        segmenter.segment(excludePrompt.excludeEmojis),
        (seg) => seg.segment
      )
    );
  }

  const zwjPrompt = await inquirer.prompt([
    {
      type: "confirm",
      name: "includeZwj",
      message: "Include ZWJ (multi-character) emojis?",
      default: true,
    },
  ]);
  const outputImagePrompt = await inquirer.prompt([
    {
      type: "confirm",
      name: "outputAsImage",
      message: "Output as image?",
      default: false,
    },
  ]);

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
      if (!includeSet && excludeSet.has(emoji)) continue;
      if (!zwjPrompt.includeZwj && [...emoji].length > 1) continue;
      const ec = emojiColors[emoji];
      let testR, testG, testB;
      if (alphaPrompt.ignoreAlpha) {
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

  if (outputImagePrompt.outputAsImage) {
    const emojiSize = 72;
    const spacing = 8;
    const gridWidth = outWidth * (emojiSize + spacing) - spacing;
    const gridHeight = outHeight * (emojiSize + spacing) - spacing;
    const outCanvas = createCanvas(gridWidth, gridHeight);
    const outCtx = outCanvas.getContext("2d");
    outCtx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
    outCtx.fillRect(0, 0, gridWidth, gridHeight);

    const { styles } = require("./emojistyles.js");

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
        const filePath = path.join(tempDir, `${emoji}.png`);
        fs.writeFileSync(filePath, buffer);
        emojiImagePaths[emoji] = filePath;
      } catch (err) {
        console.error(`Failed to fetch emoji ${emoji}: ${url}`);
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
    const outImagePath = path.join(path.dirname(imagePath), "mosaic.png");
    if (gridWidth !== defaultWidth || gridHeight !== defaultHeight) {
      const resizeCanvas = createCanvas(defaultWidth, defaultHeight);
      const resizeCtx = resizeCanvas.getContext("2d");
      resizeCtx.drawImage(
        outCanvas,
        0,
        0,
        gridWidth,
        gridHeight,
        0,
        0,
        defaultWidth,
        defaultHeight
      );
      fs.writeFileSync(outImagePath, resizeCanvas.toBuffer("image/png"));
    } else {
      fs.writeFileSync(outImagePath, outCanvas.toBuffer("image/png"));
    }
    console.log(`Mosaic image saved to: ${outImagePath}`);

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
  } else {
    const mosaicPath = path.join(path.dirname(imagePath), "mosaic.txt");
    fs.writeFileSync(mosaicPath, mosaic);
    console.log(`Mosaic saved to: ${mosaicPath}`);
  }
})();
