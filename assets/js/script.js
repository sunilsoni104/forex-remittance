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

// Custom City Dropdown Functionality
document.addEventListener('DOMContentLoaded', function() {
    const cityDropdownTrigger = document.getElementById('cityDropdownTrigger');
    const cityDropdownMenu = document.getElementById('cityDropdownMenu');
    const citySearchInput = document.getElementById('citySearchInput');
    const cityOptionsContainer = document.getElementById('cityOptionsContainer');
    const cityOptions = cityOptionsContainer.querySelectorAll('.city-option');
    const citySelectedText = cityDropdownTrigger.querySelector('.city-selected-text');
    const hiddenInput = document.getElementById('sendCity');

    // Toggle dropdown
    cityDropdownTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = cityDropdownMenu.classList.contains('show');
        
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    // Search functionality
    citySearchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        
        cityOptions.forEach(option => {
            const cityName = option.textContent.toLowerCase();
            if (cityName.includes(searchTerm)) {
                option.classList.remove('hidden');
            } else {
                option.classList.add('hidden');
            }
        });
    });

    // City option selection
    cityOptions.forEach(option => {
        option.addEventListener('click', function() {
            const cityValue = this.getAttribute('data-value');
            const cityName = this.textContent;
            
            // Update selected text
            citySelectedText.textContent = cityName;
            
            // Update hidden input
            hiddenInput.value = cityValue;
            
            // Update visual state
            cityOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            // Close dropdown
            closeDropdown();
            
            // Clear search
            citySearchInput.value = '';
            cityOptions.forEach(opt => opt.classList.remove('hidden'));
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!cityDropdownTrigger.contains(e.target) && !cityDropdownMenu.contains(e.target)) {
            closeDropdown();
        }
    });

    // Keyboard navigation
    citySearchInput.addEventListener('keydown', function(e) {
        const visibleOptions = Array.from(cityOptions).filter(opt => !opt.classList.contains('hidden'));
        const currentIndex = visibleOptions.findIndex(opt => opt.classList.contains('selected'));
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = currentIndex < visibleOptions.length - 1 ? currentIndex + 1 : 0;
            updateSelection(visibleOptions, nextIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleOptions.length - 1;
            updateSelection(visibleOptions, prevIndex);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentIndex >= 0) {
                visibleOptions[currentIndex].click();
            }
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    function openDropdown() {
        cityDropdownMenu.classList.add('show');
        cityDropdownTrigger.classList.add('active');
        citySearchInput.focus();
    }

    function closeDropdown() {
        cityDropdownMenu.classList.remove('show');
        cityDropdownTrigger.classList.remove('active');
        citySearchInput.value = '';
        cityOptions.forEach(opt => opt.classList.remove('hidden'));
    }

    function updateSelection(visibleOptions, index) {
        visibleOptions.forEach(opt => opt.classList.remove('selected'));
        if (visibleOptions[index]) {
            visibleOptions[index].classList.add('selected');
            visibleOptions[index].scrollIntoView({ block: 'nearest' });
        }
    }
});

// Country Dropdown Functionality
document.addEventListener('DOMContentLoaded', function() {
    const countryDropdownTrigger = document.getElementById('countryDropdownTrigger');
    const countryDropdownMenu = document.getElementById('countryDropdownMenu');
    const countrySearchInput = document.getElementById('countrySearchInput');
    const countryOptionsContainer = document.getElementById('countryOptionsContainer');
    const countryOptions = countryOptionsContainer.querySelectorAll('.country-option');
    const selectedCountryFlag = document.getElementById('selectedCountryFlag');
    const selectedCountryName = document.getElementById('selectedCountryName');
    const hiddenInput = document.getElementById('transferToCountry');

    // Toggle dropdown
    countryDropdownTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = countryDropdownMenu.classList.contains('show');
        
        if (isOpen) {
            closeCountryDropdown();
        } else {
            openCountryDropdown();
        }
    });

    // Search functionality
    countrySearchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        
        countryOptions.forEach(option => {
            const countryName = option.textContent.toLowerCase();
            if (countryName.includes(searchTerm)) {
                option.classList.remove('hidden');
            } else {
                option.classList.add('hidden');
            }
        });
    });

    // Country option selection
    countryOptions.forEach(option => {
        option.addEventListener('click', function() {
            const countryValue = this.getAttribute('data-value');
            const countryFlag = this.getAttribute('data-flag');
            const countryName = this.getAttribute('data-name');
            
            // Update selected country display
            selectedCountryFlag.src = `https://flagcdn.com/w20/${countryFlag}.png`;
            selectedCountryFlag.alt = countryName;
            selectedCountryName.textContent = countryName;
            
            // Update hidden input
            hiddenInput.value = countryValue;
            
            // Update visual state
            countryOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            // Close dropdown
            closeCountryDropdown();
            
            // Clear search
            countrySearchInput.value = '';
            countryOptions.forEach(opt => opt.classList.remove('hidden'));
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!countryDropdownTrigger.contains(e.target) && !countryDropdownMenu.contains(e.target)) {
            closeCountryDropdown();
        }
    });

    // Keyboard navigation
    countrySearchInput.addEventListener('keydown', function(e) {
        const visibleOptions = Array.from(countryOptions).filter(opt => !opt.classList.contains('hidden'));
        const currentIndex = visibleOptions.findIndex(opt => opt.classList.contains('selected'));
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = currentIndex < visibleOptions.length - 1 ? currentIndex + 1 : 0;
            updateCountrySelection(visibleOptions, nextIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleOptions.length - 1;
            updateCountrySelection(visibleOptions, prevIndex);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentIndex >= 0) {
                visibleOptions[currentIndex].click();
            }
        } else if (e.key === 'Escape') {
            closeCountryDropdown();
        }
    });

    function openCountryDropdown() {
        countryDropdownMenu.classList.add('show');
        countryDropdownTrigger.classList.add('active');
        countrySearchInput.focus();
    }

    function closeCountryDropdown() {
        countryDropdownMenu.classList.remove('show');
        countryDropdownTrigger.classList.remove('active');
        countrySearchInput.value = '';
        countryOptions.forEach(opt => opt.classList.remove('hidden'));
    }

    function updateCountrySelection(visibleOptions, index) {
        visibleOptions.forEach(opt => opt.classList.remove('selected'));
        if (visibleOptions[index]) {
            visibleOptions[index].classList.add('selected');
            visibleOptions[index].scrollIntoView({ block: 'nearest' });
        }
    }
});