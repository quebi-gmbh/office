/** Default document shown the first time someone opens /typst. */
export const STARTER_DOC = `#set page(width: 21cm, height: auto, margin: 2cm)
#set text(font: "Libertinus Serif", size: 11pt)
#set par(justify: true)

= Welcome to the Typst editor

This document compiles entirely in your browser — no server, no upload.
Edit the source on the left and the preview updates on the right.

== Formatting

You get *bold*, _italic_, \`raw\`, and #underline[underlined] text, plus
lists, tables, and more:

- Fully client-side
- Renders to SVG live
- Exports to PDF

== Math

The quadratic formula is $x = (-b plus.minus sqrt(b^2 - 4 a c)) / (2 a)$,
and displayed:

$ integral_0^1 x^2 dif x = 1/3 $

== Code

\`\`\`rust
fn main() {
    println!("Hello from Typst!");
}
\`\`\`

Happy typesetting!
`;
