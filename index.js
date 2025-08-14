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
      validate: (input) => fs.existsSync(input.trim()) ? true : "File does not exist.",
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
  const defaultHeight = img.height;
  console.log(`Image loaded. Resolution: ${defaultWidth}x${defaultHeight}`);

  const resPrompt = await inquirer.prompt([
    {
      type: "input",
      name: "resolution",
      message: `Enter output resolution (width,height) [default: ${defaultWidth},${defaultHeight}]:`,
      filter: (input) => input.trim(),
    },
  ]);
  let outWidth = defaultWidth,
    outHeight = defaultHeight;
  if (resPrompt.resolution) {
    const parts = resPrompt.resolution.split(",").map((x) => parseInt(x.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      outWidth = parts[0];
      outHeight = parts[1];
    } else {
      console.log("Invalid input, using default resolution.");
    }
  }
  console.log(`Output resolution set to: ${outWidth}x${outHeight}`);

  const canvas = createCanvas(outWidth, outHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, outWidth, outHeight);

  const imageData = ctx.getImageData(0, 0, outWidth, outHeight);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 255) {
      // Blend with black: newRGB = alpha * rgb/255 + (1-alpha) * 0
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
      const ec = emojiColors[emoji];
      const dr = r - ec.r,
        dg = g - ec.g,
        db = b - ec.b;
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

  const mosaicPath = path.join(path.dirname(imagePath), "mosaic.txt");
  fs.writeFileSync(mosaicPath, mosaic);
  console.log(`Mosaic saved to: ${mosaicPath}`);
})();
