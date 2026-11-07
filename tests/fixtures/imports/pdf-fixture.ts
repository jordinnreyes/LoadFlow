type TextItem = string | [x: number, y: number, text: string];

// A tiny synthetic, selectable PDF. Each item has a real PDF text position.
export function pdfFixture(pages: TextItem[][]) {
  const objects = new Map<number, string>();
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => id + " 0 R").join(" ")}] /Count ${pages.length} >>`,
  );
  objects.set(
    3,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  for (const [index, page] of pages.entries()) {
    const id = pageIds[index];
    const content = page
      .map((item, i) => {
        const [x, y, value] =
          typeof item === "string" ? [30, 740 - i * 20, item] : item;
        const literal = value.replace(/[\\()]/g, "\\$&");
        return `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${literal}) Tj ET`;
      })
      .join("\n");
    objects.set(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    objects.set(
      id + 1,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
  }
  let file = "%PDF-1.7\n";
  const offsets: string[] = [];
  for (const [id, object] of objects) {
    offsets.push(
      String(Buffer.byteLength(file, "latin1")).padStart(10, "0") +
        " 00000 n \n",
    );
    file += `${id} 0 obj\n${object}\nendobj\n`;
  }
  const offset = Buffer.byteLength(file, "latin1");
  file += `xref\n0 ${objects.size + 1}\n0000000000 65535 f \n${offsets.join("")}trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(file, "latin1");
}
