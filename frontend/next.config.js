const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, path.sep + 'config.json');
if (!fs.existsSync(configPath)) {
  throw new Error('Configuration could not be found at location: ' + configPath);
}
const config = JSON.parse(fs.readFileSync(configPath).toString('utf-8'));

module.exports = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverRuntimeConfig: config.serverRuntimeConfig,
  publicRuntimeConfig: config.publicRuntimeConfig,
  async redirects() {
    return [
      {
        source: '/catalog.aspx',
        destination: '/catalog',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/api/applicationcallback',
        destination: 'http://127.0.0.1:5000/api/applicationcallback',
      },
      {
        source: '/api/logincallback',
        destination: 'http://127.0.0.1:5000/api/logincallback',
      },
      {
        source: '/bot/verify',
        destination: 'http://127.0.0.1:5000/bot/verify',
      },
    ]
  },
  webpack(config) {
    config.plugins = config.plugins.filter(plugin => {
      return plugin.constructor.name !== 'ReactFreshWebpackPlugin';
    });

    return config;
  }
}
