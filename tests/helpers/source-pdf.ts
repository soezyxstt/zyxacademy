export function sourcePdf(width = 200, height = 100, rotation = 0) {
  const stream = "BT /F1 12 Tf 20 40 Td (Hello PDF) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${rotation} /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(source.length); source += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(source);
}

/** Original 100-point square PDF containing a solid red 16-by-16 JPEG2000 image. */
export function sourceJpeg2000Pdf() {
  return new Uint8Array(Buffer.from("JVBERi0xLjUKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAxMDAgMTAwXSAvUmVzb3VyY2VzIDw8IC9YT2JqZWN0IDw8IC9JbTAgNCAwIFIgPj4gPj4gL0NvbnRlbnRzIDUgMCBSID4+CmVuZG9iago0IDAgb2JqCjw8IC9UeXBlIC9YT2JqZWN0IC9TdWJ0eXBlIC9JbWFnZSAvV2lkdGggMTYgL0hlaWdodCAxNiAvQ29sb3JTcGFjZSAvRGV2aWNlUkdCIC9CaXRzUGVyQ29tcG9uZW50IDggL0ZpbHRlciAvSlBYRGVjb2RlIC9MZW5ndGggMjQ3ID4+CnN0cmVhbQoAAAAMalAgIA0KhwoAAAAUZnR5cGpwMiAAAAAAanAyIAAAAC1qcDJoAAAAFmloZHIAAAAQAAAAEAADBwcAAAAAAA9jb2xyAQAAAAAAEAAAAKpqcDJj/0//UQAvAAAAAAAQAAAAEAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEABAQEAAH/XAAQQEBISFBISFBISFBISFD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjT/kAAKAAAAAAAmAAH/k8+0BADfgAgH34AIB4CAgICAgICAgICAgP/ZCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvTGVuZ3RoIDMwID4+CnN0cmVhbQpxIDEwMCAwIDAgMTAwIDAgMCBjbSAvSW0wIERvIFEKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDUgMDAwMDAgbiAKMDAwMDAwMDY1NyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjczNwolJUVPRg==", "base64"));
}
