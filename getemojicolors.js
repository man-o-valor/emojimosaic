const prompts = require("prompts");
const fetch = require("node-fetch");
const fs = require("fs-extra");
const { PNG } = require("pngjs");
const emojiUnicode = require("emoji-unicode");
const formatToJson = require("format-to-json");
const emojiData = require("unicode-emoji-json");

const OUTPUT_BASE = "./emojis";

const styles = {
  Noto: {
    baseUrl:
      "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/png/128/emoji_u",
    filename: (emoji) => {
      let name = emojiUnicode(emoji).split(" ").join("_").toLowerCase();
      if (name.endsWith("_fe0f")) {
        name = name.replace(/_fe0f$/, "");
      }
      return name + ".png";
    },
  },
  Twemoji: {
    baseUrl: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
    filename: (emoji) =>
      emojiUnicode(emoji).split(" ").join("-").toLowerCase() + ".png",
  },
};

async function promptStyle() {
  const response = await prompts({
    type: "select",
    name: "style",
    message: "Which emoji design do you want to fetch?",
    choices: Object.keys(styles).map((key) => ({ title: key, value: key })),
  });

  return response.style;
}

async function downloadEmoji(emoji, styleConfig, outputDir) {
  const filename = styleConfig.filename(emoji);
  const url = `${styleConfig.baseUrl}${filename}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Not found: ${url}`);
    const buffer = await res.buffer();
    const png = PNG.sync.read(buffer);
    let rSum = 0,
      gSum = 0,
      bSum = 0,
      aSum = 0,
      count = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const idx = (png.width * y + x) << 2;
        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        const a = png.data[idx + 3];
        rSum += r;
        gSum += g;
        bSum += b;
        aSum += a;
        count++;
      }
    }
    if (count === 0) throw new Error("No visible pixels");
    const avgColor = {
      r: Math.round(rSum / count),
      g: Math.round(gSum / count),
      b: Math.round(bSum / count),
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

  let successCount = 0;
  let failCount = 0;
  for (const emoji of allEmojis) {
    const result = await downloadEmoji(emoji, styleConfig, outputDir);
    if (result) {
      colorMap[emoji] = result.color;
      successCount++;
    } else {
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
