import createQrCode from "qrcode-generator";

const quietZone = 4;

export function shortLinkQr(value: string) {
  const qr = createQrCode(0, "H");
  qr.addData(value, "Byte");
  qr.make();
  const modules = qr.getModuleCount();
  const segments: string[] = [];
  for (let row = 0; row < modules; row += 1) {
    let start = -1;
    for (let column = 0; column <= modules; column += 1) {
      const dark = column < modules && qr.isDark(row, column);
      if (dark && start < 0) start = column;
      else if (!dark && start >= 0) {
        const length = column - start;
        segments.push(`M${start + quietZone} ${row + quietZone}h${length}v1h-${length}z`);
        start = -1;
      }
    }
  }
  return { path: segments.join(""), size: modules + quietZone * 2 };
}
