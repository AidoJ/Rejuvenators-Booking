// scripts.js

// --- Global state ---
let currentStep = 1;
let therapists = [], availableTherapists = [], selectedTherapist = null;
let bookingId = null;
let timer = null, timeRemaining = 180;
let bookingAccepted = false, currentTherapistIndex = 0;
let stripe = null, card = null;
let currentLat = null, currentLon = null;

// Helper to read form values
const getVal = id => document.getElementById(id)?.value.trim() || '';

// Calculate dynamic price
function calculatePrice() {
  const base = 159;
  const dur = parseInt(getVal('duration')) || 60;
  let price = base + ((dur - 60)/15)*15;
  const dt = new Date(`${getVal('date')}T${getVal('time')}`);
  if (!isNaN(dt)) {
    const wk = [0,6].includes(dt.getUTCDay()), hr = dt.getHours();
    if (wk || hr<9 || hr>=18) price *= 1.2;
  }
  if (getVal('parking') !== 'free') price += 20;
  return price.toFixed(2);
}

// Update price display whenever inputs change
function bindPrice() {
  ['duration','date','time','parking'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      document.getElementById('priceAmount').textContent = calculatePrice();
    });
  });
}

// Step navigation
function showStep(n) {
  currentStep = n;
  document.querySelectorAll('.step').forEach(s => s.classList.toggle('active', s.id==='step'+n));
  document.querySelectorAll('.progress-step').forEach((ps,i)=>{
    ps.classList.toggle('completed', i< n-1);
    ps.classList.toggle('active', i===n-1);
  });
  if (n===6) loadTherapistsUI();
  if (n===7) initStripe();
}
document.querySelectorAll('.next').forEach(b=>b.onclick=()=>showStep(currentStep+1));
document.querySelectorAll('.prev').forEach(b=>b.onclick=()=>showStep(currentStep-1));

// Load mock therapists.json
function loadTherapists() {
  fetch('mock-api/therapists.json')
    .then(r=>r.json()).then(js=>therapists=js)
    .catch(()=>{});
}

// Haversine formula to compute distance between two lat/lon points (in km)
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
            Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Try browser Geolocation (if user permits)
function tryGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      currentLat = pos.coords.latitude;
      currentLon = pos.coords.longitude;
    });
  }
}

// Step 6: therapist dropdown (with distance filter)
function loadTherapistsUI() {
  const selDiv = document.getElementById('therapistSelection');
  const btn = document.getElementById('requestBtn');
  let filtered = therapists;
  if (currentLat !== null && currentLon !== null) {
    filtered = therapists.filter(t => {
      if (typeof t.lat !== 'number' || typeof t.lon !== 'number') return false;
      return distanceKm(currentLat, currentLon, t.lat, t.lon) <= 20 && t.available;
    });
  } else {
    filtered = therapists.filter(t => t.available);
  }
  availableTherapists = filtered;
  if (!availableTherapists.length) {
    selDiv.innerHTML = `<p style=\"color:red\">No therapists available in your area. Please try a different location.</p>`;
    btn.disabled = true;
    return;
  }
  if (currentLat !== null && currentLon !== null) {
    availableTherapists.sort((a, b) => {
      const dA = distanceKm(currentLat, currentLon, a.lat, a.lon);
      const dB = distanceKm(currentLat, currentLon, b.lat, b.lon);
      return dA - dB;
    });
  }
  selDiv.innerHTML = `
    <select id=\"therapistSelect\">
      ${availableTherapists.map((t,i)=>{
        let dist = '';
        if (currentLat !== null && currentLon !== null && typeof t.lat === 'number' && typeof t.lon === 'number') {
          dist = ` (${distanceKm(currentLat, currentLon, t.lat, t.lon).toFixed(1)} km away)`;
        }
        return `<option value=\"${i}\">${t.name}${dist}</option>`;
      }).join('')}
    </select>`;
  selectedTherapist = availableTherapists[0];
  document.getElementById('therapistSelect').onchange = e=>{
    selectedTherapist = availableTherapists[e.target.value];
  };
  btn.disabled = false;
}
document.getElementById('requestBtn')?.addEventListener('click', ()=>{
  if (!selectedTherapist) return alert('Select a therapist');
  availableTherapists = [ selectedTherapist, ...availableTherapists.filter(t=>t!==selectedTherapist) ];
  showStep(7);
});

// Address manual input fallback: if user types an address (no autocomplete)
const addressEl = document.getElementById('address');
if (addressEl) {
  addressEl.addEventListener('input', function() {
    if (this.value.length > 10 && (currentLat === null || currentLon === null)) {
      currentLat = -27.4698;
      currentLon = 153.0251;
    }
  });
}

// Step 7: Initialize Stripe Elements
function initStripe() {
  const summary = document.getElementById('summary');
  const price = calculatePrice();
  summary.innerHTML = `<p><strong>Total:</strong> $${price}</p>
    <div id=\"card-element\"></div>
    <button id=\"payBtn\" disabled style=\"opacity:.5\">Pay</button>`;

  stripe = Stripe('pk_test_51PGxKUKn3GaB6FyY1qeTOeYxWnBMDax8bUZhdP7RggDi1OyUp4BbSJWPhgb7hcvDynNqakuSfpGzwfuVhOsTvXmb001lwoCn7a');
  const elements = stripe.elements();
  card = elements.create('card', { hidePostalCode: true });
  card.mount('#card-element');
  card.on('change', ev=>{
    const btn = document.getElementById('payBtn');
    btn.disabled = !ev.complete;
    btn.style.opacity = ev.complete? '1':'.5';
  });
  document.getElementById('payBtn').onclick = handlePayment;
}

// On Pay: create a token then start booking flow
function handlePayment() {
  stripe.createToken(card).then(res=>{
    if (res.error) {
      alert(res.error.message);
    } else {
      window.paymentToken = res.token.id;
      startBookingRequest();
    }
  });
}

// Step 8+: loop through therapists with timer
function startBookingRequest() {
  bookingId = 'b_'+Date.now();
  bookingAccepted = false;
  currentTherapistIndex = 0;
  showStep(8);
  contactTherapist();
}

function contactTherapist() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (bookingAccepted || currentTherapistIndex>=availableTherapists.length) {
    if(!bookingAccepted) {
      document.getElementById('requestMsg').innerText = 'No response – refund issued.';
    }
    return;
  }
  const t = availableTherapists[currentTherapistIndex];
  document.getElementById('currentTherapist').textContent = t.name;
  document.getElementById('requestMsg').innerText = 
    currentTherapistIndex===0
      ? `Requesting ${t.name}…`
      : `Fallback → requesting ${t.name}…`;
  sendTherapistEmail(t);
  runTimer();
}

function runTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  timeRemaining = 180;
  document.getElementById('timeRemaining').textContent = `${timeRemaining}s`;
  timer = setInterval(()=>{
    if (bookingAccepted) {
      clearInterval(timer);
      timer = null;
      return;
    }
    timeRemaining--;
    document.getElementById('timeRemaining').textContent = `${timeRemaining}s`;
    if (timeRemaining<=0) {
      clearInterval(timer);
      timer = null;
      currentTherapistIndex++;
      contactTherapist();
    }
  },1000);
}

// Send EmailJS to therapist with accept/decline links
function sendTherapistEmail(t) {
  const data = {
    ...getBookingData(),
    therapist: t.name,
    bookingId
  };
  const enc = encodeURIComponent(JSON.stringify(data));
  const base = `${location.origin}${location.pathname}`;
  const accept = `${base}?action=accept&booking=${enc}`;
  const decline = `${base}?action=decline&booking=${enc}`;
  const html = `
    <h2>New Booking</h2>
    <p>${data.customerName} wants ${data.service} at ${data.time}.</p>
    <p>
      <a href="${accept}">✅ ACCEPT</a>
      &nbsp;
      <a href="${decline}">❌ DECLINE</a>
    </p>`;
  emailjs.send('service_puww2kb','template_zh8jess',{
    to_name: t.name,
    to_email: t.email||'aishizhengjing@gmail.com',
    message_html: html
  });
}

// Grab all form fields into one object
function getBookingData() {
  return {
    customerName: getVal('customerName'),
    customerEmail: getVal('customerEmail'),
    customerPhone: getVal('customerPhone'),
    address: getVal('address'),
    service: getVal('service'),
    duration: getVal('duration'),
    date: getVal('date'),
    time: getVal('time'),
    parking: getVal('parking'),
    roomNumber: getVal('roomNumber'),
    bookerName: getVal('bookerName'),
    price: calculatePrice()
  };
}

// Google Maps Autocomplete for Address
function loadGoogleMapsAPI() {
  const apiKey = 'AIzaSyBo632bfwdyKtue_-wkAms0Ac2mMRVnTWg';
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAutocomplete`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

window.initAutocomplete = function() {
  const addressInput = document.getElementById('address');
  if (!addressInput) return;
  if (typeof google === 'undefined' || !google.maps || !google.maps.places) return;
  try {
    const autocomplete = new google.maps.places.Autocomplete(addressInput, {
      componentRestrictions: { country: 'au' }
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        currentLat = place.geometry.location.lat();
        currentLon = place.geometry.location.lng();
      }
    });
  } catch (e) {}
};

document.addEventListener('DOMContentLoaded', ()=>{
  bindPrice();
  loadTherapists();
  showStep(1);
  emailjs.init('V8qq2pjH8vfh3a6q3');
  loadGoogleMapsAPI();
  tryGeolocation();
});





