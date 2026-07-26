/**
 * TEMP build-identity marker (production verification).
 *
 * Sets window.__98PLUS_BUILD_IDENTITY__ and logs [98PLUS_BUILD_IDENTITY] once,
 * so the running bundle can be matched against the deployed commit from inside
 * Telegram. Values are baked at build time from next.config env (SHA is read
 * from CI env or `git rev-parse HEAD`, never hardcoded).
 *
 * Also stamps the V3 overboard expected short SHA so Telegram console can prove
 * whether OVERBOARD_V3_PROD_TRACE is running on commit 70aff52.
 */

const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? '';
const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? '';
const BUILD_ENV = process.env.NEXT_PUBLIC_BUILD_ENV ?? '';
const OVERBOARD_V3_EXPECTED_COMMIT = '70aff52';

export function BuildIdentityScript() {
  const buildMatchesExpected =
    BUILD_COMMIT === OVERBOARD_V3_EXPECTED_COMMIT ||
    BUILD_COMMIT.startsWith(OVERBOARD_V3_EXPECTED_COMMIT);
  const payload = JSON.stringify({
    commit: BUILD_COMMIT,
    builtAt: BUILD_TIMESTAMP,
    env: BUILD_ENV,
    overboardV3ExpectedCommit: OVERBOARD_V3_EXPECTED_COMMIT,
    overboardV3BuildMatchesExpected: buildMatchesExpected,
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
    console.info('[OVERBOARD_V3_PROD_TRACE]',{
      marker:'OVERBOARD_V3_PROD_TRACE',
      step:'BUILD_BOOT',
      buildCommit:identity.commit,
      expectedCommit:identity.overboardV3ExpectedCommit,
      buildMatchesExpected:identity.overboardV3BuildMatchesExpected,
      buildTimestamp:identity.builtAt,
      buildEnv:identity.env
    });
  } catch(e){}
})();
`,
      }}
    />
  );
}
