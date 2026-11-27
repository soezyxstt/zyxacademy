const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const NAME = 'parity_loopback_network';
const HOST = '127.0.0.1';

module.exports = function withParityLoopback(config) {
  config = withAndroidManifest(config, mod => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:networkSecurityConfig'] = `@xml/${NAME}`;
    return mod;
  });
  config = withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${NAME}.xml`), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">${HOST}</domain>
  </domain-config>
</network-security-config>
`);
    return mod;
  }]);
  return withInfoPlist(config, mod => {
    const ats = mod.modResults.NSAppTransportSecurity ?? {};
    mod.modResults.NSAppTransportSecurity = {
      ...ats,
      NSExceptionDomains: {
        ...ats.NSExceptionDomains,
        [HOST]: { NSExceptionAllowsInsecureHTTPLoads: true },
      },
    };
    return mod;
  });
};
