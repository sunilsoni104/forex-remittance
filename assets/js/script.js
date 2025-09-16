// Legacy inputs (kept for backwards-compat support)
const sendInput = document.getElementById('sendAmount');
const receiveInput = document.getElementById('receiveAmount');
// New redesigned form inputs
const amountToSendInput = document.getElementById('amountToSend');
const amountInInrInput = document.getElementById('amountInInr');
const receivingAmountInput = document.getElementById('receivingAmount');
// New simple selects
const fromCurrencySelect = document.getElementById('fromCurrency');
const toCurrencySelect = document.getElementById('toCurrency');
const sendCurrencySelect = document.getElementById('sendCurrency');
const receiveCurrencyDisplay = document.getElementById('receiveCurrencyDisplay');
const bankFeeUsdEls = [
    document.getElementById('bankFeeUsd'),
    document.getElementById('bankFeeUsd2')
];
const bankFeeInrEl = document.getElementById('bankFeeInr');
const totalAmountValueEl = document.getElementById('totalAmountValue');
const effectiveRateEl = document.getElementById('effectiveRate');
const payerSenderBtn = document.getElementById('payerSender');
const payerRecipientBtn = document.getElementById('payerRecipient');
const exchangeRateText = document.getElementById('exchangeRateText');
const bookOrderBtn = document.getElementById('bookOrderBtn');
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
    // Legacy widget math
    const legacySend = parseFloat((sendInput?.value || '0').replace(/,/g, '')) || 0;
    const legacyReceive = latestRate ? (legacySend / latestRate) : 0;
    if (receiveInput) receiveInput.value = legacyReceive.toFixed(2);

    // New widget math
    const amountToSend = parseFloat((amountToSendInput?.value || '0').replace(/,/g, '')) || 0; // in quoteCurrency (e.g., USD)
    // amount in INR (baseCurrency)
    const amountInInr = latestRate ? (amountToSend * latestRate) : 0;
    if (amountInInrInput) amountInInrInput.value = Math.round(amountInInr).toString();
    // keep receiving amount mirrored to amountToSend when user isn't editing it
    if (receivingAmountInput && document.activeElement !== receivingAmountInput) {
        receivingAmountInput.value = isNaN(amountToSend) ? '0' : (amountToSend.toString());
    }

    // Fees (example USD 8 or ZERO)
    const bankFeeUsd = currentFeeUsd;
    bankFeeUsdEls.forEach(el => el && (el.textContent = bankFeeUsd.toString()));
    const bankFeeInr = bankFeeUsd * latestRate;
    if (bankFeeInrEl) bankFeeInrEl.textContent = Math.round(bankFeeInr).toString();

    // Total: if sender pays, add fee in INR, else zero
    const totalInInr = payerIsSender ? (amountInInr + bankFeeInr) : amountInInr;
    if (totalAmountValueEl) totalAmountValueEl.textContent = formatNumber(totalInInr.toFixed(2));

    // Effective rate = total INR / USD sent
    const effRate = amountToSend > 0 ? totalInInr / amountToSend : latestRate;
    if (effectiveRateEl) effectiveRateEl.textContent = effRate.toFixed(4);
}

function setCurrencies(leftCode, rightCode) {
    baseCurrency = leftCode || baseCurrency;
    quoteCurrency = rightCode || quoteCurrency;
    fetchAndSetRate();
}

// Sync selects to internal state
function syncSelectsFromState() {
    if (fromCurrencySelect) fromCurrencySelect.value = baseCurrency;
    if (toCurrencySelect) toCurrencySelect.value = quoteCurrency;
    if (sendCurrencySelect) sendCurrencySelect.value = quoteCurrency;
    if (receiveCurrencyDisplay) receiveCurrencyDisplay.textContent = quoteCurrency;
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
    syncSelectsFromState();
}

if (sendInput) {
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
}

// New inputs listeners
function bindNumericInput(el) {
    if (!el) return;
    el.addEventListener('input', function () {
        const raw = this.value.replace(/,/g, '');
        if (raw === '' || isNaN(raw)) return updateConversion();
        this.value = raw; // keep as simple number for ease, no grouping while typing
        updateConversion();
    });
    el.addEventListener('blur', function () { updateConversion(); });
}

bindNumericInput(amountToSendInput);
bindNumericInput(receivingAmountInput);

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
    // Prefer local elements first, then legacy fallbacks
    const flagEl = root.querySelector('[data-selected-flag]') ||
        root.querySelector('#fromFlag') || root.querySelector('#toFlag') ||
        document.getElementById('selectedCurrencyFlag');
    const codeEl = root.querySelector('[data-selected-code]') ||
        root.querySelector('#fromCode') || root.querySelector('#toCode') ||
        document.getElementById('selectedCurrencyCode');

    if (!dropdown || !list) return;
    renderCurrencyList(list);

    function open() { dropdown.classList.remove('d-none'); setTimeout(() => search && search.focus(), 0); }
    function close() { dropdown.classList.add('d-none'); }
    function toggle() { dropdown.classList.toggle('d-none'); if (!dropdown.classList.contains('d-none')) { setTimeout(() => search && search.focus(), 0); } }

    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) close();
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
        // Detect which side changed based on known ids inside this root
        const isFrom = !!root.querySelector('#fromCode') || !!root.querySelector('#fromSelector');
        const isTo = !!root.querySelector('#toCode') || !!root.querySelector('#toSelector');
        if (isFrom) setCurrencies(code, quoteCurrency);
        else if (isTo) setCurrencies(baseCurrency, code);
        else {
            // Fallback: if it has data-selected-code but not from/to, assume right side (quote)
            const hasSelectedCode = !!root.querySelector('[data-selected-code]');
            if (hasSelectedCode) setCurrencies(baseCurrency, code); else setCurrencies(code, quoteCurrency);
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
    // No API dropdowns now, keep existing logic but it's harmless
    // Initialize payer toggle and default fees
    if (payerSenderBtn && payerRecipientBtn) {
        payerSenderBtn.addEventListener('click', () => { payerIsSender = true; setPayerActive(); updateConversion(); });
        payerRecipientBtn.addEventListener('click', () => { payerIsSender = false; setPayerActive(); updateConversion(); });
    }
    setPayerActive();
    updateConversion();
    // Bind selects
    if (fromCurrencySelect) fromCurrencySelect.addEventListener('change', (e) => { setCurrencies(fromCurrencySelect.value, quoteCurrency); });
    if (toCurrencySelect) toCurrencySelect.addEventListener('change', (e) => { setCurrencies(baseCurrency, toCurrencySelect.value); });
    if (sendCurrencySelect) sendCurrencySelect.addEventListener('change', () => { setCurrencies(baseCurrency, sendCurrencySelect.value); });
    syncSelectsFromState();
    // Submit booking
    if (bookOrderBtn) {
        bookOrderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const city = (document.getElementById('citySelect')?.value) || '';
            const fromCur = baseCurrency;
            const toCur = quoteCurrency;
            const amountToSend = parseFloat((amountToSendInput?.value || '0').replace(/,/g, '')) || 0;
            const receivingAmount = parseFloat((receivingAmountInput?.value || '0').replace(/,/g, '')) || 0;
            const amountInInr = parseFloat((amountInInrInput?.value || '0').replace(/,/g, '')) || 0;
            const bankFeeUsd = currentFeeUsd;
            const bankFeeInr = Math.round(bankFeeUsd * latestRate);
            const totalAmountInr = parseFloat((totalAmountValueEl?.textContent || '0').replace(/,/g, '')) || 0;

            // Basic validations
            const errors = [];
            if (!city) errors.push('Please select a city.');
            if (amountToSend <= 0) errors.push('Enter a valid Amount to be Sent.');
            if (receivingAmount <= 0) errors.push('Enter a valid Receiving amount.');
            if (fromCur === toCur && toCur !== 'INR') errors.push('Transfer From and To currencies cannot be same unless base is INR.');

            if (errors.length) {
                alert(errors.join('\n'));
                return;
            }

            const payload = {
                city,
                fromCurrency: fromCur,
                toCurrency: toCur,
                amountToBeSent: { value: amountToSend, currency: toCur },
                amountInINR: { value: amountInInr, currency: 'INR' },
                receivingAmount: { value: receivingAmount, currency: toCur },
                exchangeRate: { basePerQuote: latestRate, text: exchangeRateText?.textContent || '' },
                fees: {
                    bankFeeUsd,
                    bankFeeInr,
                    payer: payerIsSender ? 'SENDER' : 'RECIPIENT'
                },
                totals: {
                    totalPayableInINR: totalAmountInr,
                    effectiveRate: parseFloat(effectiveRateEl?.textContent || latestRate)
                },
                meta: {
                    ts: new Date().toISOString()
                }
            };

            // For now just show a confirmation
            console.log('Booking payload', payload);
            alert('Order booked successfully!\n\n' + JSON.stringify(payload, null, 2));
        });
    }
});

// Fee and payer state
let currentFeeUsd = 8; // change to 0 to simulate ZERO charges
let payerIsSender = true;
function setPayerActive() {
    if (!payerSenderBtn || !payerRecipientBtn) return;
    payerSenderBtn.classList.toggle('btn-outline-primary', !payerIsSender);
    payerSenderBtn.classList.toggle('btn-primary', payerIsSender);
    payerRecipientBtn.classList.toggle('btn-light', payerIsSender);
    payerRecipientBtn.classList.toggle('btn-primary', !payerIsSender);
}