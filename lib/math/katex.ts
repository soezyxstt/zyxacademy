import katex, { type KatexOptions } from "katex";
import "katex/contrib/mhchem";

/** Keep chemistry support and the untrusted-content boundary identical across renderers. */
const scientificKatex = {
  renderToString(expression: string, options: KatexOptions = {}): string {
    return katex.renderToString(expression, { ...options, trust: false });
  },
};

export default scientificKatex;
