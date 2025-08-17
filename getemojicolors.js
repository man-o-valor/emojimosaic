const inquirer = require("inquirer");
const fetch = require("node-fetch");
const fs = require("fs");
const { PNG } = require("pngjs");
const emojiUnicode = require("emoji-unicode");
const formatToJson = require("format-to-json");
const emojiData = require("unicode-emoji-json");

const { styles } = require("./emojistyles.js");

async function promptStyle() {
  const response = await inquirer.prompt([
    {
      type: "list",
      name: "style",
      message: "Which emoji design do you want to fetch?",
      choices: Object.keys(styles),
    },
  ]);
  return response.style;
}

async function downloadEmoji(emoji, styleConfig) {
  const filename = styleConfig.filename(emoji);
  const url = `${styleConfig.baseUrl}${filename}`;
  console.log(`Downloading ${emoji} from ${url}`);
  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type");
    console.log(`Content-Type for ${emoji}: ${contentType}`);
    if (!res.ok) throw new Error(`Not found: ${url}`);
    const buffer = await res.buffer();
    const png = PNG.sync.read(buffer);
    let rSum = 0,
      gSum = 0,
      bSum = 0,
      aSum = 0,
      count = 0;
    let rgbCount = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const idx = (png.width * y + x) << 2;
        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        const a = png.data[idx + 3];
        aSum += a;
        count++;
        if (a > 0) {
          rSum += r;
          gSum += g;
          bSum += b;
          rgbCount++;
        }
      }
    }
    if (rgbCount === 0) throw new Error("No visible pixels");
    const avgColor = {
      r: Math.round(rSum / rgbCount),
      g: Math.round(gSum / rgbCount),
      b: Math.round(bSum / rgbCount),
      a: Math.round(aSum / count),
    };
    let unicodeKey;
    if (styleConfig === styles.Noto) {
      unicodeKey = emojiUnicode(emoji).split(" ").join("_").toLowerCase();
      if (unicodeKey.endsWith("_fe0f")) {
        unicodeKey = unicodeKey.replace(/_fe0f$/, "");
      }
    } else {
      unicodeKey = emojiUnicode(emoji);
    }
    return { emoji, unicode: unicodeKey, color: avgColor };
  } catch (err) {
    console.error(`Error downloading ${emoji}:`, err.message);
    return null;
  }
}

(async () => {
  const selectedStyle = await promptStyle();
  if (!selectedStyle) {
    console.log("🚫 No style selected. Exiting.");
    return;
  }

  const styleConfig = styles[selectedStyle];
  const allEmojis = Object.keys(emojiData);
  const colorMap = {};
  const jsonFile = `./data/${selectedStyle.toLowerCase()}_colors.json`;
  console.log(`Writing to file "${jsonFile}"`);

  let successCount = 0;
  let failCount = 0;
  for (const emoji of allEmojis) {
    const result = await downloadEmoji(emoji, styleConfig);
    if (result) {
      colorMap[emoji] = result.color;
      successCount++;
      console.log(`✅ Successfully processed emoji: ${emoji}`);
    } else {
      console.error(`❌ Failed to process emoji: ${emoji}`);
      failCount++;
    }
  }

  const formattedjson = formatToJson(JSON.stringify(colorMap), {
    withDetails: true,
  });
  fs.writeFileSync(jsonFile, formattedjson.result, "utf8");
  console.log(
    `🎉 Finished processing ${successCount} ${selectedStyle} emojis. Colors saved to ${jsonFile}`
  );
  console.log(`❌ Failed to process ${failCount} emojis`);
})();
