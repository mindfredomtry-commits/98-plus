/**
 * TEMP build-identity marker (production verification).
 *
 * Sets window.__98PLUS_BUILD_IDENTITY__ and logs [98PLUS_BUILD_IDENTITY] once,
 * so the running bundle can be matched against the deployed commit from inside
 * Telegram. Values are baked at build time from next.config env (SHA is read
 * from CI env or `git rev-parse HEAD`, never hardcoded).
 */

const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? '';
const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? '';
const BUILD_ENV = process.env.NEXT_PUBLIC_BUILD_ENV ?? '';

export function BuildIdentityScript() {
  const payload = JSON.stringify({
    commit: BUILD_COMMIT,
    builtAt: BUILD_TIMESTAMP,
    env: BUILD_ENV,
  });

  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  try {
    var identity=${payload};
    window.__98PLUS_BUILD_IDENTITY__=identity;
    console.log('[98PLUS_BUILD_IDENTITY]',identity);
  } catch(e){}
})();
`,
      }}
    />
  );
}
