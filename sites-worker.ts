type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

type SitesEnv = {
  ASSETS: AssetBinding;
};

export default {
  async fetch(request: Request, env: SitesEnv): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !['GET', 'HEAD'].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = '/index.html';
    indexUrl.search = '';
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
