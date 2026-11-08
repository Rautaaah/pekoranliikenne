import axios from 'axios';

const backendEndpoints = {
  login: { method: 'GET', path: '/auth/discord-login', oauth: true },
  signup: { method: 'GET', path: '/auth/discord-signup', oauth: true },
  'signup-metadata': { method: 'GET', path: '/apisite/auth/v2/signup-metadata' },
  'create-account': { method: 'POST', path: '/apisite/auth/v2/signup' },
};

const unavailable = (res) => res.status(502).json({
  error: 'Discord authorization is temporarily unavailable.',
});

export default async function discordOAuth(req, res) {
  const action = req.query.action;
  const endpoint = typeof action === 'string' ? backendEndpoints[action] : null;
  if (!endpoint) {
    return res.status(404).json({ error: 'Discord authorization route not found.' });
  }

  if (req.method !== endpoint.method) {
    res.setHeader('Allow', endpoint.method);
    return res.status(405).end();
  }

  try {
    const requestHeaders = {
      cookie: req.headers.cookie || '',
      'user-agent': req.headers['user-agent'] || 'SansyWebFrontend/1.0',
    };
    if (req.headers['x-csrf-token']) {
      requestHeaders['x-csrf-token'] = req.headers['x-csrf-token'];
    }
    if (req.headers['content-type']) {
      requestHeaders['content-type'] = req.headers['content-type'];
    }

    const response = await axios.request({
      method: req.method,
      url: `http://127.0.0.1:5000${endpoint.path}`,
      data: req.body,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: requestHeaders,
    });

    if (!endpoint.oauth) {
      for (const header of ['content-type', 'set-cookie', 'x-csrf-token', 'retry-after']) {
        if (response.headers[header]) {
          res.setHeader(header, response.headers[header]);
        }
      }
      res.status(response.status);
      return res.send(response.data);
    }

    const location = response.headers.location;
    if (response.status < 300 || response.status >= 400 || typeof location !== 'string') {
      console.error(`Discord OAuth backend returned HTTP ${response.status} for ${action}.`);
      return unavailable(res);
    }

    let authorizationUrl;
    try {
      authorizationUrl = new URL(location);
    } catch (error) {
      console.error(`Discord OAuth backend returned an invalid redirect for ${action}.`);
      return unavailable(res);
    }

    if (authorizationUrl.protocol !== 'https:' ||
      authorizationUrl.hostname !== 'discord.com' ||
      authorizationUrl.pathname !== '/oauth2/authorize') {
      console.error(`Discord OAuth backend returned an unexpected redirect for ${action}.`);
      return unavailable(res);
    }

    return res.redirect(302, authorizationUrl.toString());
  } catch (error) {
    console.error(`Discord OAuth backend request failed for ${action}:`, error.message);
    return unavailable(res);
  }
}
