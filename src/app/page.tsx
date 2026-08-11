import Image from "next/image";
import { readDoc } from "@/lib/content";
import portrait from "../../public/portrait-hero.jpg";

// next/image is used only for curated assets we control. Visitor-submitted photos
// are served straight from Cloudflare Images and never touch sharp here.
// See ARCHITECTURE.md → "Security boundaries".

export default function Home() {
  const obituary = readDoc("obituary");

  // Unfilled placeholders are marked in development so a draft can't quietly ship.
  const html =
    process.env.NODE_ENV === "development"
      ? obituary.html.replace(/X{3,}/g, (m) => `<mark class="todo">${m}</mark>`)
      : obituary.html;

  return (
    <main className="page" id="main">
      <figure className="portrait">
        <Image
          src={portrait}
          alt="Joe Weisman on the playa in a wide-brimmed hat and dusty work gloves, arms open in a shrug, a dust-covered car beside him."
          priority
          sizes="(max-width: 40rem) 100vw, 40rem"
          placeholder="blur"
        />
      </figure>

      <h1 className="name">Joe Weisman</h1>
      <p className="dates">December 16, 1944 &ndash; July 10, 2026</p>
      <hr className="rule" />

      {/* Source is ours and lives in the repo, so this HTML is trusted.
          Visitor-submitted text never renders this way — see ARCHITECTURE.md
          → "Security boundaries". */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
