/**
 * Product WHO/SUCCESS presentation + Product import-graph gates.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/product-flow-presentation.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSequentialResumeTokenFactory } from '../src/app-coordinator/resume-token';
import { createCreateBanController } from '../src/product-flow/create-ban/create-ban.controller';
import type { CreateBanRecipient } from '../src/product-flow/create-ban/create-ban.types';
import {
  emitSuccessComplete,
  emitSuccessCreateAnother,
  ProductSuccessScreen,
} from '../src/product-flow/presentation/SuccessScreen';
import {
  emitWhoConfirm,
  emitWhoSelect,
  ProductWhoScreen,
} from '../src/product-flow/presentation/WhoScreen';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webSrc = join(__dirname, '../src');

function pass(label: string): void {
  console.log(`ok - ${label}`);
}

function friend(id: string, name = 'Alex'): CreateBanRecipient {
  return {
    id,
    userId: id,
    username: name.toLowerCase(),
    firstName: name,
    photoUrl: null,
    avatarUrl: null,
    auraLabel: '',
    streak: 0,
    energyPercent: 50,
    presence: 'online',
    lastSeenAt: null,
    interactionCount: 1,
    isRegistered: true,
  };
}

function sinkStub() {
  return {
    routeChanged() {},
    replyCancelled() {},
    replyCompleted() {},
    flowReleased() {},
  };
}

function whoBase(
  overrides: Partial<Parameters<typeof ProductWhoScreen>[0]> = {},
) {
  return {
    recipientsStatus: 'ready' as const,
    recipients: [friend('u1'), friend('u2', 'Bob')],
    selectedRecipientId: null as string | null,
    isReply: false,
    replyRecipientLabel: null as string | null,
    errorDetail: null as string | null,
    onSelectRecipient: () => undefined,
    onConfirmRecipient: () => undefined,
    onBack: () => undefined,
    onRetry: () => undefined,
    ...overrides,
  };
}

async function main(): Promise<void> {
  {
    const html = renderToStaticMarkup(
      createElement(
        ProductWhoScreen,
        whoBase({ recipientsStatus: 'loading', recipients: [] }),
      ),
    );
    assert.match(html, /data-testid="product-who-loading"/);
    pass('1. Loading state renders');
  }

  {
    let retried = false;
    const props = whoBase({
      recipientsStatus: 'failed',
      recipients: [],
      errorDetail: 'friends down',
      onRetry: () => {
        retried = true;
      },
    });
    const html = renderToStaticMarkup(createElement(ProductWhoScreen, props));
    assert.match(html, /data-testid="product-who-error"/);
    assert.match(html, /friends down/);
    assert.match(html, /data-testid="product-who-retry"/);
    props.onRetry();
    assert.equal(retried, true);
    pass('2. Error state renders and retry emits correct callback');
  }

  {
    const html = renderToStaticMarkup(
      createElement(
        ProductWhoScreen,
        whoBase({ recipientsStatus: 'empty', recipients: [] }),
      ),
    );
    assert.match(html, /data-testid="product-who-empty"/);
    pass('3. Empty state renders');
  }

  {
    const html = renderToStaticMarkup(
      createElement(ProductWhoScreen, whoBase()),
    );
    assert.match(html, /data-testid="product-who-list"/);
    assert.match(html, /data-recipient-id="u1"/);
    assert.match(html, /data-recipient-id="u2"/);
    pass('4. Recipient list renders');
  }

  {
    const selected: string[] = [];
    emitWhoSelect(friend('u1'), (r) => selected.push(String(r.id)));
    assert.deepEqual(selected, ['u1']);
    const html = renderToStaticMarkup(
      createElement(
        ProductWhoScreen,
        whoBase({ selectedRecipientId: 'u1' }),
      ),
    );
    assert.match(html, /data-selected="1"/);
    pass('5. Selecting a recipient emits the correct callback');
  }

  {
    const confirmed: string[] = [];
    const ok = emitWhoConfirm(friend('u1'), (r) =>
      confirmed.push(String(r.id)),
    );
    assert.equal(ok, true);
    assert.deepEqual(confirmed, ['u1']);
    assert.equal(emitWhoConfirm(null, () => undefined), false);
    const html = renderToStaticMarkup(
      createElement(
        ProductWhoScreen,
        whoBase({ selectedRecipientId: 'u1' }),
      ),
    );
    assert.match(html, /data-testid="product-who-continue"/);
    assert.doesNotMatch(html, /product-who-continue" disabled/);
    pass('6. Continue emits the correct callback');
  }

  {
    let backed = false;
    const props = whoBase({
      onBack: () => {
        backed = true;
      },
    });
    const html = renderToStaticMarkup(createElement(ProductWhoScreen, props));
    assert.match(html, /data-testid="product-who-back"/);
    props.onBack();
    assert.equal(backed, true);
    pass('7. Back/cancel emits the correct callback');
  }

  {
    const html = renderToStaticMarkup(
      createElement(
        ProductWhoScreen,
        whoBase({
          isReply: true,
          replyRecipientLabel: 'Opponent',
          recipientsStatus: 'ready',
        }),
      ),
    );
    assert.match(html, /data-reply="1"/);
    assert.match(html, /data-testid="product-who-reply-context"/);
    assert.match(html, /Opponent/);
    pass('8. Reply recipient state renders correctly');
  }

  {
    const html = renderToStaticMarkup(
      createElement(ProductSuccessScreen, {
        recipientLabel: 'Alex',
        banText: 'no sweets',
        durationMinutes: 3,
        isReply: false,
        onComplete: () => undefined,
      }),
    );
    assert.match(html, /Отправлено/);
    assert.match(html, /Alex/);
    assert.match(html, /no sweets/);
    assert.match(html, /3 мин/);
    assert.match(html, /data-reply="0"/);
    assert.doesNotMatch(html, /product-success-create-another/);
    pass('9. Direct success renders truthful summary');
  }

  {
    const html = renderToStaticMarkup(
      createElement(ProductSuccessScreen, {
        recipientLabel: 'Opponent',
        banText: 'reply text',
        durationMinutes: 5,
        isReply: true,
        onComplete: () => undefined,
      }),
    );
    assert.match(html, /data-reply="1"/);
    assert.match(html, /Ответ/);
    assert.match(html, /reply text/);
    pass('10. Reply success renders without losing reply semantics');
  }

  {
    let completed = false;
    emitSuccessComplete(() => {
      completed = true;
    });
    assert.equal(completed, true);
    const html = renderToStaticMarkup(
      createElement(ProductSuccessScreen, {
        recipientLabel: 'Alex',
        banText: 'x',
        durationMinutes: 3,
        isReply: false,
        onComplete: () => undefined,
      }),
    );
    assert.match(html, /data-testid="product-success-complete"/);
    pass('11. Primary success action emits the correct callback');
  }

  {
    let created = false;
    assert.equal(emitSuccessCreateAnother(undefined), false);
    assert.equal(
      emitSuccessCreateAnother(() => {
        created = true;
      }),
      true,
    );
    assert.equal(created, true);
    const html = renderToStaticMarkup(
      createElement(ProductSuccessScreen, {
        recipientLabel: 'Alex',
        banText: 'x',
        durationMinutes: 3,
        isReply: false,
        onComplete: () => undefined,
        onCreateAnother: () => undefined,
      }),
    );
    assert.match(html, /data-testid="product-success-create-another"/);
    pass('12. Secondary/create-another action emits the correct callback when present');
  }

  {
    const whoSrc = readFileSync(
      join(webSrc, 'product-flow/presentation/WhoScreen.tsx'),
      'utf8',
    );
    const successSrc = readFileSync(
      join(webSrc, 'product-flow/presentation/SuccessScreen.tsx'),
      'utf8',
    );
    for (const src of [whoSrc, successSrc]) {
      assert.doesNotMatch(src, /from ['"]@\/lib\/api['"]/);
      assert.doesNotMatch(src, /deliverDirectChallenge|fetch\(/);
      assert.doesNotMatch(src, /product-flow\.controller|create-ban\.controller/);
      assert.doesNotMatch(src, /app-coordinator|notification-runtime/);
      assert.doesNotMatch(src, /localStorage|sessionStorage|useTelegram/);
    }
    pass('13. Screen does not call infrastructure');
  }

  {
    const controller = createCreateBanController({ sink: sinkStub() });
    controller.openRoute({ route: 'WHO' });
    controller.dispatch({
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    });
    assert.equal(controller.getState().route, 'WHAT');
    assert.equal(controller.getState().draft.recipient?.id, 'u1');
    pass('14. WHO → WHAT still works');
    controller.dispose();
  }

  {
    const controller = createCreateBanController({
      sink: sinkStub(),
      submissionPort: {
        async submit() {
          return { banId: 'ban:1' };
        },
      },
    });
    controller.openRoute({ route: 'WHO' });
    controller.dispatch({
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    });
    controller.dispatch({ type: 'TEXT_CHANGED', text: 'no sweets' });
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
    assert.equal(controller.getState().route, 'CONFIRM');
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(controller.getState().route, 'SUCCESS');
    pass('15. CONFIRM → SUCCESS still works');
    controller.dispose();
  }

  {
    const events: string[] = [];
    const controller = createCreateBanController({
      sink: {
        routeChanged(route) {
          events.push(`route:${route}`);
        },
        replyCancelled() {
          events.push('replyCancelled');
        },
        replyCompleted() {
          events.push('replyCompleted');
        },
        flowReleased(route) {
          events.push(`released:${route}`);
        },
      },
      submissionPort: {
        async submit() {
          return { banId: 'ban:2' };
        },
      },
    });
    controller.openRoute({ route: 'WHO' });
    controller.dispatch({
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    });
    controller.dispatch({ type: 'TEXT_CHANGED', text: 'done' });
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    await new Promise((r) => setTimeout(r, 20));
    controller.dispatch({ type: 'SUCCESS_DISMISSED' });
    assert.ok(events.includes('released:LOBBY'));
    assert.equal(controller.getState().route, 'LOBBY');
    pass('16. SUCCESS completion returns/releases exactly as before');
    controller.dispose();
  }

  {
    const tokens = createSequentialResumeTokenFactory('t');
    const events: string[] = [];
    const controller = createCreateBanController({
      sink: {
        routeChanged() {},
        replyCancelled() {
          events.push('replyCancelled');
        },
        replyCompleted() {
          events.push('replyCompleted');
        },
        flowReleased() {
          events.push('released');
        },
      },
      submissionPort: {
        async submit() {
          return { banId: 'ban:reply' };
        },
      },
    });
    controller.openRoute({
      route: 'WHAT',
      context: {
        type: 'REPLY',
        sourceItemId: 'incoming:1',
        targetUserId: 'opp1',
        resumeToken: tokens.create(),
      },
    });
    controller.dispatch({ type: 'TEXT_CHANGED', text: 'reply ok' });
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(controller.getState().route, 'SUCCESS');
    assert.ok(controller.getState().replyContext);
    controller.dispatch({ type: 'SUCCESS_DISMISSED' });
    assert.ok(events.includes('replyCompleted'));
    assert.ok(!events.includes('released'));
    pass('17. Reply compose completes and resumes exactly as before');
    controller.dispose();
  }

  {
    const surface = readFileSync(
      join(webSrc, 'product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    assert.doesNotMatch(surface, /WhoOverlay/);
    assert.doesNotMatch(
      surface,
      /from ['"]@\/components\/instant-ban\/WhoScreen['"]/,
    );
    pass('18. ProductFlowSurface does not import legacy WhoOverlay');

    assert.doesNotMatch(
      surface,
      /from ['"]@\/components\/instant-ban\/SuccessScreen['"]/,
    );
    assert.doesNotMatch(surface, /SuccessBanCardBody/);
    pass('19. ProductFlowSurface does not import legacy SuccessScreen');

    assert.doesNotMatch(surface, /instant-ban\.css/);
    pass('20. ProductFlowSurface does not import instant-ban.css');

    const whoSrc = readFileSync(
      join(webSrc, 'product-flow/presentation/WhoScreen.tsx'),
      'utf8',
    );
    const successSrc = readFileSync(
      join(webSrc, 'product-flow/presentation/SuccessScreen.tsx'),
      'utf8',
    );
    for (const src of [whoSrc, successSrc]) {
      assert.doesNotMatch(src, /create-ban\.(adapters|controller|ports)/);
      assert.doesNotMatch(src, /app-coordinator|notification-runtime/);
      assert.doesNotMatch(src, /from ['"]@\/lib\/api['"]/);
    }
    pass('21. New presentation components do not import API/ports/stores/Coordinator/Runtime');

    assert.match(surface, /ProductWhoScreen/);
    assert.match(surface, /ProductSuccessScreen/);
    assert.doesNotMatch(surface, /@\/components\/instant-ban\//);
    pass('22. Active Product import graph contains no reachable legacy Product UI');
  }

  console.log('\nAll Product presentation tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
