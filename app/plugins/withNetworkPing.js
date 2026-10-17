// Config plugin: HTTP/2 pings for the app's network client.
//
// Without them, a connection that dies when the phone changes network (Wi-Fi to
// mobile data, or data off and on) stays in the pool, and every request after it
// hangs until the app restarts. A ping every 10 s finds the dead connection, so
// the next request opens a fresh one.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withMainApplication } = require('expo/config-plugins');

const CLASS = 'LangkahOkHttpFactory';

const kotlin = (pkg) => `package ${pkg}

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

// React Native's default client plus HTTP/2 pings (plugins/withNetworkPing.js).
class ${CLASS}(private val context: Context) : OkHttpClientFactory {
  override fun createNewNetworkModuleClient(): OkHttpClient =
    OkHttpClientProvider.createClientBuilder(context)
      .pingInterval(10, TimeUnit.SECONDS)
      .build()
}
`;

module.exports = function withNetworkPing(config) {
  const pkg = config.android?.package;
  if (!pkg) throw new Error('withNetworkPing needs android.package');

  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${CLASS}.kt`), kotlin(pkg));
      return c;
    },
  ]);

  return withMainApplication(config, (c) => {
    let src = c.modResults.contents;
    if (c.modResults.language !== 'kt') throw new Error('withNetworkPing expects MainApplication.kt');
    if (!src.includes(`${CLASS}(`)) {
      if (!/super\.onCreate\(\)/.test(src)) throw new Error('withNetworkPing: super.onCreate() not found');
      src = src.replace(
        /super\.onCreate\(\)/,
        `super.onCreate()\n    com.facebook.react.modules.network.OkHttpClientProvider.setOkHttpClientFactory(${CLASS}(applicationContext))`,
      );
    }
    c.modResults.contents = src;
    return c;
  });
};
