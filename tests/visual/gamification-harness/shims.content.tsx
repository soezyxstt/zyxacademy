import React from 'react';
export const ArticleCodingProvider = ({children}: any) => <>{children}</>;
export const StaticCodeReadingProvider = ({children}: any) => <>{children}</>;
export const ArticleParts = ({parts}: any) => <div className="space-y-2 text-body-sm">{parts.map((p: any) => <p key={p.id}>{p.markdown}</p>)}</div>;
export const MarkdownRenderer = ({content}: any) => <p className="text-body-sm">{content}</p>;
export const MathText = ({children}: any) => <>{children}</>;
