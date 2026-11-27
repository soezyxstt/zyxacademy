export const INTERACTIVE_DOCUMENT_CONTENT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const INTERACTIVE_DOCUMENT_CSP = `sandbox allow-scripts; ${INTERACTIVE_DOCUMENT_CONTENT_CSP}; frame-ancestors 'self'`;
export const READY_BOOTSTRAP = `<script>document.addEventListener("DOMContentLoaded",function(){parent.postMessage({type:"zyx:ready"},"*")},{once:true})</script>`;
