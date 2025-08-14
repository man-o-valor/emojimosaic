const inquirer = require("inquirer");
const fetch = require("node-fetch");
const fs = require("fs");
const { PNG } = require("pngjs");
const emojiUnicode = require("emoji-unicode");
const formatToJson = require("format-to-json");
const emojiData = require("unicode-emoji-json");

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
  Fluent: {
    baseUrl:
      "https://raw.githubusercontent.com/microsoft/fluentui-emoji/refs/heads/main/assets/",
    filename: (emoji) => {
      let name = emojiData[emoji]?.name || "";
    const folder = name.replace(/^(\w+)/, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()).replace(/ /g, "%20");
      const file = name.toLowerCase().replace(/ /g, "_") + "_3d.png";
      return `${folder}/3D/${file}`;
    },
  },
  Samsung: {
    baseUrl:
      "https://em-content.zobj.net/source/samsung/411/",
    filename: (emoji) => {
      const name = (emojiData[emoji]?.name || "").toLowerCase().replace(/ /g, "-");
      const codepoint = emojiUnicode(emoji).split(" ").join("-");
      return `${name}_${codepoint}.png`;
    },
  },
};

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
  try {
    console.log(`Downloading ${emoji} from ${url}`);
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
    const result = await downloadEmoji(emoji, styleConfig);
    if (result) {
      colorMap[emoji] = result.color;
      successCount++;
      const formattedjson = formatToJson(JSON.stringify(colorMap), {
        withDetails: true,
      });
      fs.writeFileSync(jsonFile, formattedjson.result, "utf8");
    } else {
      failCount++;
    }
  }

  console.log(
    `🎉 Finished processing ${successCount} ${selectedStyle} emojis. Colors saved to ${jsonFile}`
  );
  console.log(`❌ Failed to process ${failCount} emojis`);
})();
