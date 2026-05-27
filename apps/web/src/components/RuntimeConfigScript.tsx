/**
 * Injects API URL before React hydrates (client-only values from build-time env).
 */
import { DEFAULT_API_URL } from '@/lib/config';

function sanitizeBuildUrl(url: string | undefined): string {
  if (!url?.trim()) return '';
  const trimmed = url.replace(/\/$/, '');
  if (/placeholder\.vercel\.app/i.test(trimmed)) return '';
  try {
    if (new URL(trimmed).hostname === 'placeholder.vercel.app') return '';
  } catch {
    return '';
  }
  return trimmed;
}

function deriveWsInline(apiUrl: string): string {
  if (apiUrl.startsWith('https://')) {
    return `${apiUrl.replace(/^https:/, 'wss:')}/ws`;
  }
  if (apiUrl.startsWith('http://')) {
    return `${apiUrl.replace(/^http:/, 'ws:')}/ws`;
  }
  return `${apiUrl}/ws`;
}

export function RuntimeConfigScript() {
  const apiUrl = sanitizeBuildUrl(process.env.NEXT_PUBLIC_API_URL) || DEFAULT_API_URL;
  const wsFromEnv = sanitizeBuildUrl(process.env.NEXT_PUBLIC_WS_URL);
  const wsUrl = wsFromEnv || deriveWsInline(apiUrl);

  const payload = JSON.stringify({
    apiUrl,
    wsUrl,
  });

  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  var DEFAULT_API=${JSON.stringify(DEFAULT_API_URL)};
  function bad(u){return !u||/placeholder\\.vercel\\.app/i.test(u);}
  function deriveWs(u){
    if(u.indexOf('https://')===0)return u.replace(/^https:/,'wss:')+'/ws';
    if(u.indexOf('http://')===0)return u.replace(/^http:/,'ws:')+'/ws';
    return u+'/ws';
  }
  var build=${payload};
  if(build.apiUrl&&!bad(build.apiUrl)){
    window.__98_CONFIG__={apiUrl:build.apiUrl,wsUrl:build.wsUrl||deriveWs(build.apiUrl)};
  } else {
    window.__98_CONFIG__={apiUrl:DEFAULT_API,wsUrl:deriveWs(DEFAULT_API)};
    console.warn('[98+] Invalid build API URL — using default',DEFAULT_API);
  }
  try {
    var q=new URLSearchParams(location.search);
    var u=q.get('api_url')||q.get('apiUrl');
    if(u&&!bad(u)){
      u=u.replace(/\\/$/,'');
      window.__98_CONFIG__={
        apiUrl:u,
        wsUrl:deriveWs(u)
      };
      localStorage.setItem('98plus_api_url',u);
      console.log('[98+] api_url override',u);
    } else {
      var s=localStorage.getItem('98plus_api_url');
      if(s&&bad(s))localStorage.removeItem('98plus_api_url');
      if(s&&!bad(s)&&!window.__98_CONFIG__?.apiUrl){
        s=s.replace(/\\/$/,'');
        window.__98_CONFIG__={
          apiUrl:s,
          wsUrl:deriveWs(s)
        };
      }
    }
  } catch(e){}
  if(window.__98_CONFIG__?.apiUrl){
    console.log('[ws-url]',{
      apiUrl:window.__98_CONFIG__.apiUrl,
      wsUrl:window.__98_CONFIG__.wsUrl,
      source:'runtime-script'
    });
  } else {
    console.warn('[98+] No API URL — use NEXT_PUBLIC_API_URL or ?api_url=https://your-api-tunnel');
  }
})();
`,
      }}
    />
  );
}
