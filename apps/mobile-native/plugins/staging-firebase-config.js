const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const PROJECT_ID = 'zyx-academy-staging';
const ANDROID_PACKAGE = 'com.zyx.academy.nativeparity';
const DEFAULT_FILE = 'google-services.json';
const CAPABILITY = `${ANDROID_PACKAGE}.STAGING_FCM`;

function containsServerCredentials(value) {
  if (!value || typeof value !== 'object') return false;
  return value.type === 'service_account' || Object.hasOwn(value, 'private_key') || Object.hasOwn(value, 'private_key_id')
    || Object.values(value).some(containsServerCredentials);
}

function validateStagingFirebase(raw, androidPackage) {
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error('Expo Android Firebase requires valid client JSON.');
  }
  if (containsServerCredentials(config)) {
    throw new Error('Expo Android Firebase requires an Android client file. Server credentials are prohibited.');
  }
  const project = config?.project_info;
  if (project?.project_id !== PROJECT_ID || typeof project.project_number !== 'string' || !/^\d+$/.test(project.project_number)) {
    throw new Error('Expo Android Firebase requires the Zyx staging Firebase project.');
  }
  const clients = Array.isArray(config.client) ? config.client : [];
  const matching = clients.filter(client => client?.client_info?.android_client_info?.package_name === androidPackage);
  if (androidPackage !== ANDROID_PACKAGE || matching.length !== 1) {
    throw new Error('Firebase Android client must match the Expo application package exactly once.');
  }
  const [client] = matching;
  const applicationId = client.client_info.mobilesdk_app_id;
  const applicationPattern = new RegExp(`^1:${project.project_number}:android:[a-f0-9]+$`);
  const keys = client.api_key;
  if (typeof applicationId !== 'string' || !applicationPattern.test(applicationId) || !Array.isArray(keys) || !keys.length
      || !keys.every(key => typeof key?.current_key === 'string' && /^[A-Za-z0-9_-]+$/.test(key.current_key))) {
    throw new Error('Expo Android Firebase client is missing a valid Android app ID or client API key.');
  }
  return { ...config, client: matching };
}

function readStagingFirebase(projectRoot, android) {
  const explicit = android?.googleServicesFile;
  if (explicit !== undefined && (typeof explicit !== 'string' || !explicit.trim())) {
    throw new Error('Expo Android Firebase client file could not be read.');
  }
  let raw;
  try {
    raw = readFileSync(resolve(projectRoot, explicit ?? DEFAULT_FILE), 'utf8');
  } catch (error) {
    if (!explicit && error.code === 'ENOENT') return null;
    throw new Error('Expo Android Firebase client file could not be read.');
  }
  return validateStagingFirebase(raw, android?.package);
}

module.exports = { ANDROID_PACKAGE, CAPABILITY, readStagingFirebase, validateStagingFirebase };
