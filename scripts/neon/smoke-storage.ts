import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3StorageConfig } from "../../lib/storage/r2";
import { validateTarget } from "./copy-storage";

const config = getS3StorageConfig("neon");
validateTarget(config.client.endpoint!, config.bucket);
const client = new S3Client(config.client);
const key = `migration/smoke/${randomUUID()}.txt`;
const body = "Zyx isolated storage verification";
const get = () => client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
try {
  await client.send(new PutObjectCommand({ Bucket:config.bucket, Key:key, Body:body, ContentType:"text/plain", IfNoneMatch:"*" }));
  let rejected = false;
  try { await client.send(new PutObjectCommand({ Bucket:config.bucket, Key:key, Body:"must not overwrite", IfNoneMatch:"*" })); }
  catch (error: any) { rejected = error?.$metadata?.httpStatusCode === 412; }
  assert.ok(rejected, "Neon must enforce create-only uploads");
  assert.equal(await (await get()).Body!.transformToString(), body);
  assert.equal((await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:key}))).ContentLength, Buffer.byteLength(body));
  assert.equal((await fetch(`${config.client.endpoint}/${config.bucket}/${key}`)).status, 403);
  const signed = await getSignedUrl(client, new GetObjectCommand({Bucket:config.bucket,Key:key}), {expiresIn:60});
  const response = await fetch(signed);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), body);
  const uploadKey = `${key}.signed-upload`;
  const signedUpload = await getSignedUrl(client, new PutObjectCommand({Bucket:config.bucket,Key:uploadKey,ContentType:"text/plain",ContentLength:Buffer.byteLength(body)}), {expiresIn:60});
  const origin = "https://zyx-neon-migration.vercel.app";
  const preflight = await fetch(signedUpload, {method:"OPTIONS",headers:{Origin:origin,"Access-Control-Request-Method":"PUT","Access-Control-Request-Headers":"content-type"}});
  assert.equal(preflight.status,200);
  assert.ok([origin,"*"].includes(preflight.headers.get("access-control-allow-origin") || ""));
  const uploaded = await fetch(signedUpload, {method:"PUT",body,headers:{Origin:origin,"content-type":"text/plain"}});
  assert.equal(uploaded.status,200);
  assert.equal(await (await client.send(new GetObjectCommand({Bucket:config.bucket,Key:uploadKey}))).Body!.transformToString(),body);
  const ranged = await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key,Range:"bytes=0-2"}));
  assert.equal(await ranged.Body!.transformToString(), "Zyx");
  await client.send(new CopyObjectCommand({Bucket:config.bucket,Key:`${key}.copy`,CopySource:`${config.bucket}/${key}`}));
  assert.equal((await client.send(new ListObjectsV2Command({Bucket:config.bucket,Prefix:key}))).KeyCount, 3);
  console.log(JSON.stringify({status:"passed", privateAnonymousRead:true, conditionalNoOverwrite:true, uploadDownload:true, signedDownload:true, signedUpload:true, corsPreflight:true, range:true, copy:true, list:true}));
} catch (error: any) {
  console.error(JSON.stringify({status:"failed", name:error?.name, httpStatus:error?.$metadata?.httpStatusCode, assertion:error?.name === "AssertionError" ? error.message : undefined}));
  process.exitCode=1;
} finally { client.destroy(); }
