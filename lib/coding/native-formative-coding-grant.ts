import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { formativeCodingField, formativeCodingGrant, nativeArticleCodingScope } from "./native-article-contract";

import { formativeMarkdownCodingParts } from "./native-article-parts";

const ttl = 10 * 60 * 1000;
const grantSchema = nativeArticleCodingScope.pick({ sectionId: true, revision: true }).extend({
  userId: z.string().min(1),
  courseId: z.string().min(1),
  articleId: z.string().min(1),
  articleVersion: z.number().int().positive(),
  blockId: z.string().min(1),
  field: formativeCodingField,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  expires: z.number().int().positive(),
});

export type FormativeCodingGrantIdentity = Pick<z.infer<typeof grantSchema>,
  "userId" | "courseId" | "articleId" | "articleVersion" | "revision" | "sectionId" | "blockId">;
export type FormativeCodingField = z.infer<typeof formativeCodingField>;

function sign(encoded: string, secret: string) {
  return createHmac("sha256", secret).update("zyx-native-formative-python-v1." + encoded).digest();
}

export function formativeCodingContentHash(markdown: string) {
  return createHash("sha256").update(markdown).digest("hex");
}

export function mintFormativeCodingGrant(
  identity: FormativeCodingGrantIdentity, field: FormativeCodingField, markdown: string, secret: string, now = Date.now(),
) {
  if (!secret) throw new Error("FORMATIVE_CODING_GRANT_SECRET_MISSING");
  const claims = grantSchema.parse({ ...identity, field, contentHash: formativeCodingContentHash(markdown), expires: now + ttl });
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${encoded}.${sign(encoded, secret).toString("base64url")}`;
}

export function verifyFormativeCodingGrant(
  token: string, identity: Omit<FormativeCodingGrantIdentity, "blockId">, secret: string, now = Date.now(),
) {
  if (!secret || !formativeCodingGrant.safeParse(token).success) return null;
  const [encoded, signature] = token.split(".");
  const actual = Buffer.from(signature, "base64url");
  const expected = sign(encoded, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const { data, success } = grantSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (!success || data.expires <= now || data.expires > now + ttl ||
      data.userId !== identity.userId || data.courseId !== identity.courseId || data.articleId !== identity.articleId ||
      data.articleVersion !== identity.articleVersion || data.revision !== identity.revision || data.sectionId !== identity.sectionId) return null;
    return data;
  } catch { return null; }
}

export function formativeCodingAccessForReveal(
  identity: FormativeCodingGrantIdentity, contents: Record<FormativeCodingField, string>, secret: string, now = Date.now(),
) {
  const access: Partial<Record<FormativeCodingField, string>> = {};
  for (const field of formativeCodingField.options) {
    const source = contents[field];
    if (formativeMarkdownCodingParts(source, identity.sectionId, { id: identity.blockId }, field).length) {
      access[field] = mintFormativeCodingGrant(identity, field, source, secret, now);
    }
  }
  return access;
}
