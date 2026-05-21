/**
 * Injects API URL before React hydrates (client-only values from build-time env).
 */
export function RuntimeConfigScript() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL ??
    (apiUrl
      ? apiUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws'
      : '');

  const payload = JSON.stringify({
    apiUrl: apiUrl.replace(/\/$/, ''),
    wsUrl: wsUrl.replace(/\/$/, ''),
  });

  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  var build=${payload};
  if(build.apiUrl) window.__98_CONFIG__=build;
  try {
    var q=new URLSearchParams(location.search);
    var u=q.get('api_url')||q.get('apiUrl');
    if(u){
      u=u.replace(/\\/$/,'');
      window.__98_CONFIG__={
        apiUrl:u,
        wsUrl:u.replace(/^https:/,'wss:').replace(/^http:/,'ws:')+'/ws'
      };
      localStorage.setItem('98plus_api_url',u);
      console.log('[98+] api_url override',u);
    } else {
      var s=localStorage.getItem('98plus_api_url');
      if(s&&!window.__98_CONFIG__?.apiUrl){
        s=s.replace(/\\/$/,'');
        window.__98_CONFIG__={
          apiUrl:s,
          wsUrl:s.replace(/^https:/,'wss:').replace(/^http:/,'ws:')+'/ws'
        };
      }
    }
  } catch(e){}
  if(window.__98_CONFIG__?.apiUrl){
    console.log('[98+] API',window.__98_CONFIG__.apiUrl);
  } else {
    console.warn('[98+] No API URL — use NEXT_PUBLIC_API_URL or ?api_url=https://your-api-tunnel');
  }
})();
`,
      }}
    />
  );
}
