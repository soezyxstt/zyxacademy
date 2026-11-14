export const materializeArticleParts = (parts: any[]) => parts.map(p => p.markdown ?? '').join(' ');
