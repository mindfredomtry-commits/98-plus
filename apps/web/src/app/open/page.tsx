'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { openTelegramBotManual } from '@/lib/open-telegram-from-go';

const BLOCKED_CHECK_MS = 900;

export default function OpenLandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [blockedHint, setBlockedHint] = useState(false);
  const [opening, setOpening] = useState(false);
  const blockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeModal = useCallback(() => {
    if (blockedTimerRef.current) {
      clearTimeout(blockedTimerRef.current);
      blockedTimerRef.current = null;
    }
    setBlockedHint(false);
    setOpening(false);
    setModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setBlockedHint(false);
    setOpening(false);
    setModalOpen(true);
  }, []);

  const handleFinalCta = useCallback(() => {
    if (blockedTimerRef.current) {
      clearTimeout(blockedTimerRef.current);
    }
    setBlockedHint(false);
    setOpening(true);

    try {
      openTelegramBotManual();
    } catch {
      setBlockedHint(true);
      setOpening(false);
      return;
    }

    blockedTimerRef.current = window.setTimeout(() => {
      blockedTimerRef.current = null;
      setOpening(false);
      if (document.visibilityState === 'visible') {
        setBlockedHint(true);
      }
    }, BLOCKED_CHECK_MS);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (blockedTimerRef.current) {
          clearTimeout(blockedTimerRef.current);
          blockedTimerRef.current = null;
        }
        setBlockedHint(false);
        setOpening(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      document.body.style.overflow = prev;
      if (blockedTimerRef.current) {
        clearTimeout(blockedTimerRef.current);
        blockedTimerRef.current = null;
      }
    };
  }, [modalOpen, closeModal]);

  return (
    <main className="open-page">
      <div className="open-page__bg" aria-hidden>
        <div className="open-page__orb open-page__orb--1" />
        <div className="open-page__orb open-page__orb--2" />
        <div className="open-page__orb open-page__orb--3" />
        <div className="open-page__grid" />
        <div className="open-page__noise" />
        <div className="open-page__particles">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="open-page__inner">
        <div className="open-page__logo-wrap">
          <p className="open-page__logo" aria-hidden>
            98+
          </p>
        </div>
        <h1 className="open-page__title">98+</h1>
        <p className="open-page__tagline">Социальная система запретов</p>

        <div className="open-page__actions">
          <button
            type="button"
            className="open-page__btn open-page__btn--primary"
            onClick={openModal}
          >
            🚫 ЗАПРЕТИТЬ В ОТВЕТ
          </button>
        </div>

        <p className="open-page__hook">
          TikTok запретил переход в Telegram.
          <br />
          <span className="open-page__hook-accent">Запрети в ответ.</span>
        </p>
      </div>

      <div
        className="open-modal-backdrop"
        hidden={!modalOpen}
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div
          className="open-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="open-modal-title"
        >
          <button
            type="button"
            className="open-modal__close"
            onClick={closeModal}
            aria-label="Закрыть"
          >
            ×
          </button>

          <p className="open-modal__eyebrow">98+</p>
          <h2 id="open-modal-title" className="open-modal__title">
            TikTok запретил Telegram?
          </h2>
          <p className="open-modal__punch">ЗАПРЕТИ В ОТВЕТ!</p>
          <p className="open-modal__subtitle">
            Пройди мини-квест и открой 98+.
          </p>

          <div className="open-modal__cards">
            <article className="open-modal__card open-modal__card--step1">
              <div className="open-modal__step1-visual" aria-hidden>
                <span className="open-modal__wrong-btn">START BOT</span>
                <span className="open-modal__dots-pick">⋯</span>
              </div>
              <div className="open-modal__card-body">
                <h3 className="open-modal__card-title">
                  Не нажимай START BOT ❌
                </h3>
                <p className="open-modal__card-text">
                  Нажми ⋯ в правом верхнем углу
                </p>
              </div>
            </article>

            <span className="open-modal__connector" aria-hidden>
              ↓
            </span>

            <article className="open-modal__card open-modal__card--step2">
              <div className="open-modal__menu-mock" aria-hidden>
                <span className="open-modal__menu-icon">🌐</span>
                <span className="open-modal__menu-item">Open in browser</span>
              </div>
              <div className="open-modal__card-body">
                <h3 className="open-modal__card-title">
                  Выбери &ldquo;Open in browser&rdquo;
                </h3>
                <p className="open-modal__card-text open-modal__card-text--short">
                  В меню TikTok
                </p>
              </div>
            </article>

            <span className="open-modal__connector" aria-hidden>
              ↓
            </span>

            <article className="open-modal__card open-modal__card--step3">
              <div className="open-modal__payoff-icon" aria-hidden>
                <span className="open-modal__payoff-tg">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </span>
                <span className="open-modal__payoff-badge">98+</span>
              </div>
              <div className="open-modal__card-body">
                <h3 className="open-modal__card-title open-modal__card-title--payoff">
                  Пора запрещать!
                </h3>
                <p className="open-modal__card-text open-modal__card-text--payoff">
                  Бот 98+ откроется сам!
                </p>
              </div>
            </article>
          </div>

          <button
            type="button"
            className="open-page__btn open-page__btn--primary open-modal__cta"
            onClick={handleFinalCta}
            disabled={opening}
            aria-busy={opening}
          >
            🚫 ЗАПРЕТИТЬ В ОТВЕТ
          </button>

          {blockedHint ? (
            <p className="open-modal__blocked" role="status">
              Если не открылось — открой через ⋯ → Open in browser.
            </p>
          ) : null}

          <p className="open-modal__footer">
            Каждый запрет — это твоя свобода.
            <br />
            Добро пожаловать в 98+
          </p>
        </div>
      </div>
    </main>
  );
}
