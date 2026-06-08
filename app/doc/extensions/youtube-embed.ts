/**
 * YouTubeEmbed node — lightweight custom embed for YouTube / Vimeo URLs.
 *
 * Converts raw video URL → embedded iframe.
 * Responsive via the 56.25% padding-bottom CSS trick (in app.css).
 * In print: iframe is hidden, URL shown as a text link.
 *
 * Command:  setYoutubeVideo({ src: string })
 */
import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    youtubeEmbed: {
      setYoutubeVideo: (opts: { src: string }) => ReturnType;
    };
  }
}

function toEmbedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.slice(1);
      return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    // Not a valid URL — use as-is
  }
  return raw;
}

export const YouTubeEmbed = Node.create({
  name: "youtubeEmbed",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return { src: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "div[data-youtube-video]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src as string;
    return [
      "div",
      mergeAttributes({
        "data-youtube-video": "",
        "data-src": src,
        class: "doc-youtube-wrapper",
      }),
      [
        "iframe",
        {
          src: toEmbedUrl(src),
          frameborder: "0",
          allowfullscreen: "true",
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          class: "doc-youtube-iframe",
        },
      ],
    ];
  },

  addCommands() {
    return {
      setYoutubeVideo:
        ({ src }: { src: string }) =>
        ({ chain }) =>
          chain().insertContent({ type: "youtubeEmbed", attrs: { src } }).run(),
    };
  },
});
