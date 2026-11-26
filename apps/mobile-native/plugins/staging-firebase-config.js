const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const PROJECT_ID = 'zyx-academy-staging';
const ANDROID_PACKAGE = 'com.zyx.academy.nativeparity';
const DEFAULT_FILE = 'google-services.json';
const CAPABILITY = `${ANDROID_PACKAGE}.STAGING_FCM`;
const GOOGLE_OAUTH_CLIENT = `${ANDROID_PACKAGE}.STAGING_GOOGLE_OAUTH_CLIENT`;
const GOOGLE_OAUTH_SIGNERS = `${ANDROID_PACKAGE}.STAGING_GOOGLE_OAUTH_SIGNERS`;

function containsServerCredentials(value) {
  if (!value || typeof value !== 'object') return false;
  return value.type === 'service_account' || Object.hasOwn(value, 'private_key') || Object.hasOwn(value, 'private_key_id')
    || Object.values(value).some(containsServerCredentials);
}

function serviceStatus(service) {
  const status = service?.status;
  return status === 1 || status === 2 || status === '1' || status === '2' ? status : undefined;
}

function validateStagingFirebase(raw, androidPackage, onGoogleIdentity) {
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

  // Emit only the public fields read by GoogleServicesTask in the pinned Gradle plugin.
  const projectInfo = { project_id: project.project_id, project_number: project.project_number };
  if (typeof project.firebase_url === 'string') projectInfo.firebase_url = project.firebase_url;
  if (typeof project.storage_bucket === 'string') projectInfo.storage_bucket = project.storage_bucket;

  const selected = {
    client_info: { mobilesdk_app_id: applicationId, android_client_info: { package_name: androidPackage } },
    api_key: keys.map(({ current_key }) => ({ current_key })),
  };
  const webOAuth = Array.isArray(client.oauth_client) && client.oauth_client.find(entry =>
    (entry?.client_type === 3 || entry?.client_type === '3') && typeof entry.client_id === 'string');
  if (webOAuth) selected.oauth_client = [{ client_type: webOAuth.client_type, client_id: webOAuth.client_id }];

  const oauth = Array.isArray(client.oauth_client) ? client.oauth_client : [];
  const webAudiences = [...new Set(oauth.filter(entry => Number(entry?.client_type) === 3)
    .map(entry => entry.client_id).filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,228}\.apps\.googleusercontent\.com$/.test(id)))];
  const signers = [...new Set(oauth.filter(entry => Number(entry?.client_type) === 1 && entry.android_info?.package_name === androidPackage)
    .map(entry => entry.android_info.certificate_hash)
    .filter(hash => typeof hash === 'string' && /^(?:[a-f0-9]{40}|(?:[a-f0-9]{2}:){19}[a-f0-9]{2})$/i.test(hash))
    .map(hash => hash.replaceAll(':', '').toLowerCase()))].sort();
  onGoogleIdentity?.(webAudiences.length === 1 && signers.length ? { clientId: webAudiences[0], signers } : null);

  const mapsStatus = serviceStatus(client.services?.maps_service);
  const analytics = client.services?.analytics_service;
  const analyticsStatus = serviceStatus(analytics);
  const trackingId = analytics?.analytics_property?.tracking_id;
  if (mapsStatus !== undefined || analyticsStatus !== undefined) {
    selected.services = {};
    if (mapsStatus !== undefined) selected.services.maps_service = { status: mapsStatus };
    if (analyticsStatus !== undefined) {
      selected.services.analytics_service = {
        status: analyticsStatus,
        ...(typeof trackingId === 'string' && { analytics_property: { tracking_id: trackingId } }),
      };
    }
  }
  return { project_info: projectInfo, client: [selected] };
}

function readStagingFirebase(projectRoot, android, onGoogleIdentity) {
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
  return validateStagingFirebase(raw, android?.package, onGoogleIdentity);
}

module.exports = { ANDROID_PACKAGE, CAPABILITY, GOOGLE_OAUTH_CLIENT, GOOGLE_OAUTH_SIGNERS, readStagingFirebase, validateStagingFirebase };
