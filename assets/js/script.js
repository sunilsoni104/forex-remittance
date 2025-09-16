const sendInput = document.getElementById('sendAmount');
const receiveInput = document.getElementById('receiveAmount');
const exchangeRateText = document.getElementById('exchangeRateText');
let baseCurrency = 'INR'; // left selector code
let quoteCurrency = 'USD'; // right selector code
let latestRate = 88.0987; // fallback initial
const rateCache = new Map(); // key: `${base}_${quote}` => {rate, ts}

function formatNumber(num) {
    return new Intl.NumberFormat('en-IN').format(num);
}

function updateExchangeRateText() {
    if (exchangeRateText) {
        exchangeRateText.textContent = `1 ${quoteCurrency} = ${formatNumber(latestRate)} ${baseCurrency}`;
    }
}

function updateConversion() {
    const sendValue = parseFloat((sendInput?.value || '0').replace(/,/g, '')) || 0;
    // sendAmount is in baseCurrency, recipient gets is in quoteCurrency
    const receiveValue = latestRate ? (sendValue / latestRate) : 0;
    if (receiveInput) receiveInput.value = receiveValue.toFixed(2);
}

function setCurrencies(leftCode, rightCode) {
    baseCurrency = leftCode || baseCurrency;
    quoteCurrency = rightCode || quoteCurrency;
    fetchAndSetRate();
}

async function fetchRate(fromCode, toCode) {
    const key = `${fromCode}_${toCode}`;
    const cached = rateCache.get(key);
    const now = Date.now();
    if (cached && (now - cached.ts) < 10 * 60 * 1000) {
        return cached.rate;
    }
    // Using exchangerate.host (free)
    const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&amount=1`;
    const res = await fetch(url);
    const data = await res.json();
    const inv = data && typeof data.info?.rate === 'number' ? data.info.rate : null;
    if (inv) {
        // inv is rate of 1 fromCode in toCode; we need latestRate = base per quote, i.e., 1 quote = X base
        // Our UI defines latestRate as base per 1 quote to compute receive = base/quote.
        // So if base=INR, quote=USD, api returns 1 INR in USD; we want 1 USD in INR = 1 / inv.
        const basePerQuote = 1 / inv;
        rateCache.set(key, { rate: basePerQuote, ts: now });
        return basePerQuote;
    }
    throw new Error('Invalid rate response');
}

async function fetchAndSetRate() {
    try {
        latestRate = await fetchRate(baseCurrency, quoteCurrency);
    } catch (e) {
        // fallback keep previous latestRate
        console.error('Rate fetch failed, using last known rate', e);
    }
    updateExchangeRateText();
    updateConversion();
}

sendInput.addEventListener('input', function () {
    let rawValue = this.value.replace(/,/g, '');
    if (!isNaN(rawValue) && rawValue !== '') {
        this.value = formatNumber(parseFloat(rawValue));
        updateConversion();
    }
});

sendInput.addEventListener('blur', function () {
    if (this.value && !isNaN(this.value.replace(/,/g, ''))) {
        this.value = formatNumber(parseFloat(this.value.replace(/,/g, '')));
    }
});

updateExchangeRateText();
updateConversion();

// Reusable currency dropdown component
let currencies = [];

function renderCurrencyList(container) {
    const popular = currencies.filter(c => c.popular);
    const others = currencies.filter(c => !c.popular);
    const section = (title, list) => [
        `<div class="px-3 py-2 small text-muted fw-semibold text-uppercase">${title}</div>`,
        ...list.map(c => `
            <button class="w-100 text-start px-3 py-2 d-flex align-items-center gap-2 currency-item" data-code="${c.code}" data-flag="${c.flag}" data-name="${c.name}">
                <span class="fs-5">${c.flag}</span>
                <span class="fw-semibold fs-16">${c.code}</span>
                <span class="text-muted fs-16">${c.name}</span>
            </button>`)
    ].join('');
    container.innerHTML = section('Popular currencies', popular) + section('All currencies', others);
}

function initCurrencyDropdown(root) {
    const btn = root.querySelector('[data-currency-selector]') || root;
    const dropdown = root.querySelector('[data-currency-dropdown]');
    const search = root.querySelector('[data-currency-search]');
    const list = root.querySelector('[data-currency-list]');
    const flagEl = root.querySelector('[data-selected-flag]') || document.getElementById('selectedCurrencyFlag');
    const codeEl = root.querySelector('[data-selected-code]') || document.getElementById('selectedCurrencyCode');

    if (!dropdown || !list) return;
    renderCurrencyList(list);

    function open() { dropdown.classList.remove('d-none'); setTimeout(() => search && search.focus(), 0); }
    function close() { dropdown.classList.add('d-none'); }
    function toggle() { dropdown.classList.toggle('d-none'); if (!dropdown.classList.contains('d-none')) { setTimeout(() => search && search.focus(), 0); } }

    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) close();
    });

    if (search) {
        search.addEventListener('input', () => {
            const q = search.value.toLowerCase();
            Array.from(list.querySelectorAll('.currency-item')).forEach(el => {
                const code = el.getAttribute('data-code') || '';
                const name = el.getAttribute('data-name') || '';
                const text = `${code} ${name}`.toLowerCase();
                el.style.display = text.includes(q) ? 'flex' : 'none';
            });
        });
    }

    list.addEventListener('click', (e) => {
        const btnEl = e.target.closest('.currency-item');
        if (!btnEl) return;
        const code = btnEl.getAttribute('data-code') || '';
        const flag = btnEl.getAttribute('data-flag') || '';
        if (codeEl) codeEl.textContent = code;
        if (flagEl) flagEl.textContent = flag;
        // Detect which side changed and update currencies accordingly
        const container = root;
        const leftSelector = document.getElementById('selectedCurrencyCode');
        const rightSelector = document.querySelector('[data-selected-code]');
        const isLeft = container.querySelector('#selectedCurrencyCode');
        if (isLeft) {
            setCurrencies(code, quoteCurrency);
        } else {
            setCurrencies(baseCurrency, code);
        }
        close();
    });
}

function initAllDropdowns() {
    document.querySelectorAll('[data-currency-dropdown]').forEach((dropdown) => {
        const list = dropdown.querySelector('[data-currency-list]');
        if (list && list.innerHTML.trim() === '') {
            list.innerHTML = '<div class="px-3 py-2 small text-muted">Loading currencies…</div>';
        }
    });

    if (!currencies || currencies.length === 0) return;

    document.querySelectorAll('[data-currency-dropdown]').forEach((dropdown) => {
        const container = dropdown.closest('.position-relative') || dropdown.parentElement;
        if (container) initCurrencyDropdown(container);
    });
}

async function loadCurrencies() {
    try {
        // One call to get all countries with currencies and their flag emoji
        const res = await fetch('https://restcountries.com/v3.1/all?fields=currencies,flag');
        const data = await res.json();
        /** Map unique currency code -> representative {code,name,flag} */
        const map = {};
        data.forEach((country) => {
            const curr = country.currencies || {};
            Object.keys(curr).forEach((code) => {
                if (!map[code]) {
                    const info = curr[code];
                    map[code] = {
                        code,
                        name: info && (info.name || code),
                        flag: country.flag || '🏳️'
                    };
                }
            });
        });

        const popularSet = new Set(['USD', 'INR', 'EUR', 'AUD', 'JPY']);
        currencies = Object.values(map)
            .map(c => ({ ...c, popular: popularSet.has(c.code) }))
            .sort((a, b) => a.code.localeCompare(b.code));

        initAllDropdowns();
    } catch (e) {
        console.error('Failed to load currencies', e);
        // Fallback minimal set if API fails
        currencies = [
            { code: 'USD', name: 'United States dollar', flag: '🇺🇸', popular: true },
            { code: 'INR', name: 'Indian rupee', flag: '🇮🇳', popular: true },
            { code: 'GBP', name: 'British pound', flag: '🇬🇧', popular: true },
            { code: 'EUR', name: 'Euro', flag: '🇪🇺', popular: true }
        ];
        initAllDropdowns();
    }
}

// Kick off loading on page ready
document.addEventListener('DOMContentLoaded', () => {
    initAllDropdowns();
    loadCurrencies();
});