// Shared navigation, language switching, and prototype notice.
let currentLang = 'en';

const langPopover = document.getElementById('langPopover');
const langGlobeBtn = document.getElementById('langGlobeBtn');

function toggleLangPopover() {
    if (!langPopover || !langGlobeBtn) return;
    const isOpen = langPopover.classList.toggle('show');
    langGlobeBtn.classList.toggle('active', isOpen);
}

document.addEventListener('click', (e) => {
    if (!langPopover || !langGlobeBtn) return;
    if (!e.target.closest('.lang-wrapper')) {
        langPopover.classList.remove('show');
        langGlobeBtn.classList.remove('active');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.querySelector('.nav-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('nav-open');
            menuBtn.classList.toggle('active');
        });
    }

    const nav = document.querySelector('.navbar');
    if (nav && !document.querySelector('.prototype-notice')) {
        const notice = document.createElement('div');
        notice.className = 'prototype-notice';
        notice.innerHTML = '<i class="ci-Info_Circle" aria-hidden="true"></i><span><strong>Student prototype.</strong> Not an official UQ website. Course information is for demonstration; verify details on official UQ pages before enrolment. Reviews stay in this browser only.</span>';
        nav.insertAdjacentElement('afterend', notice);
    }
});

function switchLang(lang) {
    currentLang = lang;
    const dict = i18n[lang];
    if (!dict) return;

    document.querySelectorAll('.lang-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    const titleEl = document.querySelector('.lang-popover-title');
    if (titleEl) titleEl.textContent = lang === 'zh' ? '\u8bed\u8a00' : 'Language';

    setTimeout(() => {
        if (!langPopover || !langGlobeBtn) return;
        langPopover.classList.remove('show');
        langGlobeBtn.classList.remove('active');
    }, 200);

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (dict[key] !== undefined) el.textContent = dict[key];
    });

    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const key = el.dataset.i18nHtml;
        if (dict[key] !== undefined) el.innerHTML = dict[key];
    });

    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        const key = el.dataset.i18nPh;
        if (dict[key] !== undefined) el.placeholder = dict[key];
    });

    if (typeof window.updateResultsCount === 'function') {
        window.updateResultsCount();
    }

    if (typeof window.refreshReviewLanguage === 'function') {
        window.refreshReviewLanguage();
    }
}

