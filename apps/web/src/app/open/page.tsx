'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { openTelegramBotManual } from '@/lib/open-telegram-from-go';

const BLOCKED_CHECK_MS = 900;

export default function OpenLandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [blockedHint, setBlockedHint] = useState(false);
  const [opening, setOpening] = useState(false);
  const blockedTimerRef = useRef<number | null>(null);

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
          <div className="open-page__emblem">
            <h1 className="open-page__emblem-text">98+</h1>
          </div>
        </div>
        <p className="open-page__tagline">
          Открой 98+ mini app в Telegram и начни.
        </p>

        <div className="open-page__actions">
          <button
            type="button"
            className="open-page__btn open-page__btn--primary"
            onClick={openModal}
          >
            🚫 ЗАПРЕЩАТЬ
          </button>
        </div>

        <p className="open-page__hook">
          TikTok запретил переход в Telegram 😈
          <br />
          <span className="open-page__hook-accent">Запрети в ответ. 🚫</span>
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
          aria-labelledby="open-modal-heading"
        >
          <button
            type="button"
            className="open-modal__close"
            onClick={closeModal}
            aria-label="Закрыть"
          >
            ×
          </button>

          <h2 id="open-modal-heading" className="open-modal__heading">
            Обойди запрет TikTok! 🚫
          </h2>

          <div className="open-modal__cards">
            <article className="open-modal__card open-modal__card--step0">
              <div className="open-modal__card-body open-modal__card-body--stack">
                <h3 className="open-modal__card-title">
                  Когда нажмёшь &laquo;ЗАПРЕЩАТЬ&raquo; &mdash;
                </h3>
                <p className="open-modal__card-text open-modal__card-text--emph">
                  попадёшь на страницу Telegram.
                </p>
              </div>
            </article>

            <span className="open-modal__connector" aria-hidden>
              ↓
            </span>

            <article className="open-modal__card open-modal__card--step1">
              <div className="open-modal__card-body open-modal__card-body--stack">
                <h3 className="open-modal__card-title">
                  Не нажимай START BOT ❌
                </h3>
                <p className="open-modal__card-text">
                  Нажми ⋯ в правом верхнем углу
                </p>
                <div className="open-modal__step1-row" aria-hidden>
                  <div className="open-modal__start-bot-wrap">
                    <span className="open-modal__start-bot">START BOT</span>
                  </div>
                  <span className="open-modal__step1-arrow">→</span>
                  <span className="open-modal__dots-chrome">
                    <span className="open-modal__dots-pick">⋯</span>
                  </span>
                </div>
              </div>
            </article>

            <span className="open-modal__connector" aria-hidden>
              ↓
            </span>

            <article className="open-modal__card open-modal__card--step2">
              <div className="open-modal__menu-mock" aria-hidden>
                <span className="open-modal__menu-icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </span>
                <span className="open-modal__menu-item">Open in browser</span>
              </div>
              <div className="open-modal__card-body">
                <h3 className="open-modal__card-title">
                  Выбери &ldquo;Open in browser&rdquo;
                </h3>
                <p className="open-modal__card-text open-modal__card-text--short">
                  в меню TikTok
                </p>
              </div>
            </article>

            <span className="open-modal__connector" aria-hidden>
              ↓
            </span>

            <article className="open-modal__card open-modal__card--step3">
              <div className="open-modal__payoff-icon" aria-hidden>
                <span className="open-modal__payoff-plane">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </span>
                <span className="open-modal__payoff-badge">98+</span>
                <span className="open-modal__payoff-ring" />
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
            🚫 ЗАПРЕЩАТЬ
          </button>

          {blockedHint ? (
            <p className="open-modal__blocked" role="status">
              Если не открылось — открой через ⋯ → Open in browser.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
