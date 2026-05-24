'use client';

import { useCallback, useEffect, useState } from 'react';

const TELEGRAM_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ??
  `https://t.me/${
    process.env.NEXT_PUBLIC_BOT_USERNAME?.replace('@', '') ??
    'Ninety_eight_pluss_Bot'
  }`;

function openTelegramDirect() {
  window.location.href = TELEGRAM_URL;
}

export default function OpenLandingPage() {
  const [modalOpen, setModalOpen] = useState(false);

  const closeModal = useCallback(() => setModalOpen(false), []);
  const openModal = useCallback(() => setModalOpen(true), []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, closeModal]);

  return (
    <main className="open-page">
      <div className="open-page__bg" aria-hidden>
        <div className="open-page__orb open-page__orb--1" />
        <div className="open-page__orb open-page__orb--2" />
        <div className="open-page__orb open-page__orb--3" />
        <div className="open-page__grid" />
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
            onClick={openTelegramDirect}
          >
            🚫 ОТКРЫТЬ 98+ В TELEGRAM
          </button>
          <button
            type="button"
            className="open-page__btn open-page__btn--secondary"
            onClick={openModal}
          >
            🌐 ОТКРЫТЬ В БРАУЗЕРЕ
          </button>
        </div>

        <p className="open-page__footer">
          Если Telegram не открывается внутри TikTok — открой страницу во внешнем
          браузере.
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
          <h2 id="open-modal-title" className="open-modal__title">
            Как открыть во внешнем браузере
          </h2>
          <p className="open-modal__lead">
            TikTok блокирует Telegram внутри приложения.
          </p>

          <div className="open-modal__steps" role="list">
            <div className="open-modal__step" role="listitem">
              <span className="open-modal__step-icon" aria-hidden>
                ⋮
              </span>
              <div className="open-modal__step-body">
                <span className="open-modal__step-num">ШАГ 1</span>
                <p className="open-modal__step-text">Нажми ⋮ в правом верхнем углу</p>
                <p className="open-modal__step-hint">Меню TikTok / Instagram</p>
              </div>
            </div>
            <span className="open-modal__arrow" aria-hidden>
              ↓
            </span>
            <div className="open-modal__step" role="listitem">
              <span className="open-modal__step-icon" aria-hidden>
                🌐
              </span>
              <div className="open-modal__step-body">
                <span className="open-modal__step-num">ШАГ 2</span>
                <p className="open-modal__step-text">Open in browser</p>
                <p className="open-modal__step-hint">
                  «Открыть в браузере» / «Open in Safari»
                </p>
              </div>
            </div>
            <span className="open-modal__arrow" aria-hidden>
              ↓
            </span>
            <div className="open-modal__step" role="listitem">
              <span className="open-modal__step-icon" aria-hidden>
                ✈️
              </span>
              <div className="open-modal__step-body">
                <span className="open-modal__step-num">ШАГ 3</span>
                <p className="open-modal__step-text">Telegram откроется автоматически</p>
                <p className="open-modal__step-hint">Нажми кнопку ниже в браузере</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="open-page__btn open-page__btn--primary open-modal__cta"
            onClick={openTelegramDirect}
          >
            🚫 ОТКРЫТЬ 98+ В TELEGRAM
          </button>
        </div>
      </div>
    </main>
  );
}
