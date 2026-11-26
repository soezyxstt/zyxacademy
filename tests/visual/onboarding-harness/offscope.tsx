import type { ReactNode } from "react";

// These integrations are outside onboarding and do not produce fixture UI.
export const NotificationRuntime = () => null;
export const NotificationRuntimeForAccount = () => null;
export const ZYX_NOTIFICATIONS_CHANGED = "fixture:notifications";
export const AppUpdateControl = () => null;
export const StudentProfileDialog = () => null;
export const StudentIdentity = ({ name }: { name: string }) => <span>{name}</span>;
export const StudentIdentityContent = StudentIdentity;
export const ZyraMascot3D = () => null;
export const LearningCanvasRenderer = () => null;
export const ArticleParts = ({ children }: { children?: ReactNode }) => <>{children}</>;
export const ProductLearningVisual = () => null;
export const ProductWorkedExample = () => null;
export const MarkdownRenderer = ({ content }: { content?: string }) => <p className="text-body-sm leading-relaxed">{content}</p>;
export const MathText = ({ children, text }: { children?: ReactNode; text?: string }) => <>{children ?? text}</>;
