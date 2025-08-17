const emojiUnicode = require("emoji-unicode");
const emojiData = require("unicode-emoji-json");

const styles = {
  Noto: {
    baseUrl:
      "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/png/128/emoji_u",
    filename: (emoji) => {
      let name = emojiUnicode(emoji)
        .split(" ")
        .filter((code) => {
          const c = code.toLowerCase();
          return c !== "fe0f" && c !== "20e3";
        })
        .join("_")
        .toLowerCase();
      return name + ".png";
    },
  },
  Twemoji: {
    baseUrl: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
    filename: (emoji) =>
      emojiUnicode(emoji)
        .split(" ")
        .filter((code) => code.toLowerCase() !== "fe0f" && code.toLowerCase() !== "200d")
        .join("-")
        .toLowerCase() + ".png",
  },
  Fluent: {
    baseUrl:
      "https://raw.githubusercontent.com/microsoft/fluentui-emoji/refs/heads/main/assets/",
    filename: (emoji) => {
      let name = emojiData[emoji]?.name || "";
      const folder = name
        .replace(
          /^(\w+)/,
          (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()
        )
        .replace(/ /g, "%20")
        .replace(/,/g, "")
        .replace(/’/g, "")
        .replace(/'/g, "");
      const file = name.toLowerCase().replace(/ /g, "_") + "_3d.png";
      return `${folder}/3D/${file}`;
    },
  },
  Samsung: {
    baseUrl: "https://em-content.zobj.net/source/samsung/411/",
    filename: (emoji) => {
      const name = (emojiData[emoji]?.name || "")
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/,/g, "")
                .replace(/’/g, "")
        .replace(/'/g, "");
      const codepoint = emojiUnicode(emoji).split(" ").join("-");
      return `${name}_${codepoint}.png`;
    },
  },
};

module.exports = { styles };
