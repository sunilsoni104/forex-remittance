// Fee and payer state
let currentFeeUsd = 0; // change to 0 to simulate ZERO charges
let payerIsSender = true;

// Redesigned form inputs
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
// We always convert FROM selected send currency TO INR.
let baseCurrency = 'INR'; // target is INR
let quoteCurrency = 'USD'; // source = send currency
let latestRate = 88.0987; // fallback initial
const rateCache = new Map(); // key: `${base}_${quote}` => {rate, ts}

function formatNumber(num) {
    return new Intl.NumberFormat('en-IN').format(num);
}

function updateExchangeRateText() {
    if (exchangeRateText) {
        exchangeRateText.textContent = `1 ${quoteCurrency} = ${formatNumber(latestRate)} INR`;
    }
}

function updateConversion() {
    // New widget math: amount to send (in quoteCurrency) -> convert to INR
    const amountToSend = parseFloat((amountToSendInput?.value || '0').replace(/,/g, '')) || 0;
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

function setQuoteCurrency(code) {
    quoteCurrency = code || quoteCurrency;
    // keep all UI selects/badges in sync
    if (sendCurrencySelect) sendCurrencySelect.value = quoteCurrency;
    if (toCurrencySelect) toCurrencySelect.value = quoteCurrency;
    
    console.group('setQuoteCurrency');
    console.log(quoteCurrency);
    console.groupEnd();

    if (receiveCurrencyDisplay) receiveCurrencyDisplay.textContent = quoteCurrency;
    fetchAndSetRate();
}

function setCurrencies(leftCode, rightCode) {
    baseCurrency = 'INR';
    setQuoteCurrency(rightCode);
}

// Sync selects to internal state
function syncSelectsFromState() {
    if (fromCurrencySelect) fromCurrencySelect.value = 'INR';
    if (toCurrencySelect) toCurrencySelect.value = quoteCurrency;
    if (sendCurrencySelect) sendCurrencySelect.value = quoteCurrency;
    if (receiveCurrencyDisplay) receiveCurrencyDisplay.textContent = quoteCurrency;
}

async function fetchRate(fromCode, toCode) {
    if (!fromCode || !toCode) throw new Error('Invalid currency codes');
    if (fromCode === toCode) return 1;
    const key = `${fromCode}_${toCode}`;
    const cached = rateCache.get(key);
    const now = Date.now();
    if (cached && (now - cached.ts) < 10 * 60 * 1000) {
        return cached.rate;
    }

    // Primary: Frankfurter (no API key)
    try {
        const url1 = `https://api.frankfurter.app/latest?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}`;
        const res1 = await fetch(url1);
        const data1 = await res1.json();
        const rate1 = data1 && data1.rates && typeof data1.rates[toCode] === 'number' ? data1.rates[toCode] : null;
        if (rate1) { rateCache.set(key, { rate: rate1, ts: now }); return rate1; }
    } catch (e) { /* continue to fallback */ }

    // Fallback: open.er-api.com
    try {
        const url2 = `https://open.er-api.com/v6/latest/${encodeURIComponent(fromCode)}`;
        const res2 = await fetch(url2);
        const data2 = await res2.json();
        const rate2 = data2 && data2.rates && typeof data2.rates[toCode] === 'number' ? data2.rates[toCode] : null;
        if (rate2) { rateCache.set(key, { rate: rate2, ts: now }); return rate2; }
    } catch (e) { /* fall through */ }

    // Last resort: minimal static approximations
    const approx = {
        USD: { INR: 88.1, EUR: 0.92, GBP: 0.78 },
        EUR: { INR: 95.5, USD: 1.09 },
        GBP: { INR: 111.0, USD: 1.28 },
        AUD: { INR: 58.0 },
        CAD: { INR: 64.0 }
    };
    const r = approx[fromCode] && approx[fromCode][toCode];
    if (typeof r === 'number') { rateCache.set(key, { rate: r, ts: now }); return r; }

    throw new Error('Invalid rate response');
}

async function fetchAndSetRate() {
    try {
        // We need rate of 1 [send currency] in INR
        latestRate = await fetchRate(quoteCurrency, 'INR');
    } catch (e) {
        // fallback keep previous latestRate
        console.error('Rate fetch failed, using last known rate', e);
    }
    updateExchangeRateText();
    updateConversion();
    syncSelectsFromState();
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

// Kick off loading on page ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('dom loaded');

    // Initialize payer toggle and default fees
    if (payerSenderBtn && payerRecipientBtn) {
        payerSenderBtn.addEventListener('click', () => { payerIsSender = true; setPayerActive(); updateConversion(); });
        payerRecipientBtn.addEventListener('click', () => { payerIsSender = false; setPayerActive(); updateConversion(); });
    }
    setPayerActive();
    updateConversion();

    // Bind selects
    if (fromCurrencySelect) fromCurrencySelect.addEventListener('change', () => { /* locked to INR */ syncSelectsFromState(); });
    if (toCurrencySelect) toCurrencySelect.addEventListener('change', () => { setQuoteCurrency(toCurrencySelect.value); });

    console.log(sendCurrencySelect);

    if (sendCurrencySelect) {
        sendCurrencySelect.addEventListener('change', () => {
            console.log('sendCurrencySelect change', sendCurrencySelect.value);
            setQuoteCurrency(sendCurrencySelect.value);
        });
    }
    
    // Initialize quote currency from current selects
    const initialQuote = (sendCurrencySelect && sendCurrencySelect.value) || (toCurrencySelect && toCurrencySelect.value) || quoteCurrency;
    setQuoteCurrency(initialQuote);
    // Submit booking
    if (bookOrderBtn) {
        bookOrderBtn.addEventListener('click', (e) => {
            e.preventDefault();
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
            if (amountToSend <= 0) errors.push('Enter a valid Amount to be Sent.');
            if (receivingAmount <= 0) errors.push('Enter a valid Receiving amount.');
            if (fromCur === toCur && toCur !== 'INR') errors.push('Transfer From and To currencies cannot be same unless base is INR.');

            if (errors.length) {
                alert(errors.join('\n'));
                return;
            }

            const payload = {
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


function setPayerActive() {
    if (!payerSenderBtn || !payerRecipientBtn) return;
    payerSenderBtn.classList.toggle('btn-outline-primary', !payerIsSender);
    payerSenderBtn.classList.toggle('btn-primary', payerIsSender);
    payerRecipientBtn.classList.toggle('btn-light', payerIsSender);
    payerRecipientBtn.classList.toggle('btn-primary', !payerIsSender);
}