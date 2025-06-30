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
    <button id=\"payBtn\" disabled style=\"opacity:.5\">Submit Booking Request</button>`;

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

// Send customer acknowledgment email (styled)
function sendCustomerAcknowledgmentEmail() {
  const data = getBookingData();
  if (!data.customerEmail || !data.customerName) return;
  const emailHTML = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:20px; border-radius:15px;">
      <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
        <div style="text-align:center; margin-bottom:30px;">
          <h1 style="color:#00729B; margin-bottom:10px;">📧 Booking Request Received</h1>
          <p style="color:#666; font-size:18px;">Hi ${data.customerName}, we've got your request!</p>
        </div>
        <div style="background:#e8f5e8; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #28a745;">
          <h3 style="color:#28a745; margin-top:0;">✅ What happens next?</h3>
          <p style="color:#28a745; margin:0;">
            We're now contacting available therapists in your area. You'll receive a confirmation email once a therapist accepts your booking.
          </p>
        </div>
        <div style="background:#f8f9fa; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #00729B;">
          <h3 style="color:#00729B; margin-top:0;">📋 Your Booking Details</h3>
          <p><strong>💆‍♀️ Service:</strong> ${data.service}</p>
          <p><strong>⏱️ Duration:</strong> ${data.duration} minutes</p>
          <p><strong>📅 Date:</strong> ${data.date}</p>
          <p><strong>🕐 Time:</strong> ${data.time}</p>
          <p><strong>📍 Address:</strong> ${data.address}</p>
          <p><strong>🏠 Room:</strong> ${data.roomNumber || 'N/A'}</p>
          <p><strong>💰 Total Price:</strong> $${data.price}</p>
        </div>
        <div style="background:#fff3cd; padding:15px; border-radius:8px; margin:20px 0; border-left:4px solid #ffc107;">
          <p style="margin:0; color:#856404;"><strong>💳 Your payment will only be processed once a therapist accepts your booking.</strong></p>
        </div>
        <p style="text-align:center; color:#666; font-size:14px; margin-top:30px;">
          Thank you for choosing Rejuvenators Mobile Massage! We'll be in touch soon. 💙
        </p>
      </div>
    </div>
  `;
  if (typeof emailjs !== 'undefined') {
    emailjs.send('service_puww2kb', 'template_zh8jess', {
      to_name: data.customerName,
      to_email: data.customerEmail,
      subject: 'Booking Request Received',
      message_html: emailHTML,
      html_message: emailHTML
    });
  }
}

// Send customer confirmation email (styled)
function sendCustomerConfirmationEmail(bookingData, therapistName) {
  if (!bookingData.customerEmail || !bookingData.customerName) return;
  const emailHTML = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:20px; border-radius:15px;">
      <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
        <div style="text-align:center; margin-bottom:30px;">
          <h1 style="color:#28a745; margin-bottom:10px;">✅ Booking Confirmed!</h1>
          <p style="color:#666; font-size:18px;">Hi ${bookingData.customerName}, great news!</p>
        </div>
        <p style="color:#155724; font-size:16px;">
          Your booking has been confirmed. <strong>${therapistName}</strong> will be your therapist and will contact you before the appointment to go over any details.
        </p>
        <p style="color:#666; font-size:14px; margin-top:30px; text-align:center;">
          Thank you for choosing Rejuvenators Mobile Massage! 💙
        </p>
      </div>
    </div>
  `;
  if (typeof emailjs !== 'undefined') {
    emailjs.send('service_puww2kb', 'template_zh8jess', {
      to_name: bookingData.customerName,
      to_email: bookingData.customerEmail,
      subject: `Booking Confirmed – ${therapistName} is Booked`,
      message_html: emailHTML,
      html_message: emailHTML
    });
  }
}

// Step 8+: loop through therapists with timer
function startBookingRequest() {
  bookingId = 'b_'+Date.now();
  bookingAccepted = false;
  currentTherapistIndex = 0;
  showStep(8);
  sendCustomerAcknowledgmentEmail();
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

// Send EmailJS to therapist with accept/decline links (Rejuvenator style)
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
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:20px; border-radius:15px;">
      <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
        <div style="text-align:center; margin-bottom:30px;">
          <h1 style="color:#00729B; margin-bottom:10px;">🎉 NEW BOOKING REQUEST</h1>
          <p style="color:#666; font-size:18px;">You have a new client waiting for you!</p>
        </div>
        <div style="background:#f8f9fa; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #00729B;">
          <h3 style="color:#00729B; margin-top:0;">📋 Booking Details</h3>
          <p><strong>👤 Customer:</strong> ${data.customerName}</p>
          <p><strong>📧 Email:</strong> ${data.customerEmail}</p>
          <p><strong>📞 Phone:</strong> ${data.customerPhone}</p>
          <p><strong>📍 Address:</strong> ${data.address}</p>
          <p><strong>💆‍♀️ Service:</strong> ${data.service}</p>
          <p><strong>⏱️ Duration:</strong> ${data.duration} minutes</p>
          <p><strong>📅 Date:</strong> ${data.date}</p>
          <p><strong>🕐 Time:</strong> ${data.time}</p>
          <p><strong>🏠 Room:</strong> ${data.roomNumber || 'N/A'}</p>
          <p><strong>📝 Booked By:</strong> ${data.bookerName || 'N/A'}</p>
        </div>
        <div style="background:#e8f5e8; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #28a745;">
          <h3 style="color:#28a745; margin-top:0;">💰 Your Fees</h3>
          <p><strong>💳 Your Earnings:</strong> (see admin for details)</p>
        </div>
        <div style="background:#fff3cd; padding:15px; border-radius:8px; margin:20px 0; border-left:4px solid #ffc107;">
          <p style="margin:0; color:#856404;"><strong>⏰ Please respond within 3 minutes (180 seconds) to secure this booking!</strong></p>
        </div>
        <div style="text-align:center; margin-top:30px;">
          <a href="${accept}" style="background:#28a745; color:white; padding:15px 30px; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px; margin:5px; display:inline-block;">✅ ACCEPT BOOKING</a>
          <a href="${decline}" style="background:#dc3545; color:white; padding:15px 30px; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px; margin:5px; display:inline-block;">❌ DECLINE</a>
        </div>
        <p style="text-align:center; color:#666; font-size:14px; margin-top:30px;">
          Thank you for being part of the Rejuvenators team! 💙
        </p>
      </div>
    </div>
  `;
  if (typeof emailjs !== 'undefined') {
    emailjs.send('service_puww2kb','template_zh8jess',{
      to_name: t.name,
      to_email: t.email||'aishizhengjing@gmail.com',
      subject: `New Booking Request for ${t.name}`,
      message_html: html,
      html_message: html
    });
  }
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

// Listen for cross-tab storage events (therapist Accept/Decline)
window.addEventListener('storage', function(e) {
  if (e.key === 'bookingAccepted' && e.newValue === 'true') {
    bookingAccepted = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    // Update UI to show booking is accepted
    var msgEl = document.getElementById('requestMsg');
    if (msgEl) {
      msgEl.innerText = '🎉 Your booking has been accepted! Your therapist will contact you soon.';
    }
  }
});

// --- Therapist Accept/Decline Handler (robust, styled, stops timer, sends email) ---
(function handleTherapistAction() {
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  if (action === 'accept') {
    localStorage.setItem('bookingAccepted', 'true');
    // Show Rejuvenator-style confirmation to therapist
    document.body.innerHTML = `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:20px; border-radius:15px; min-height:100vh; display:flex; align-items:center; justify-content:center;">
        <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2); text-align:center;">
          <div style="font-size:60px; margin-bottom:20px;">✅</div>
          <h1 style="color:#28a745; margin-bottom:20px;">Thank you for Accepting the Booking!</h1>
          <p style="font-size:18px; color:#666; margin-bottom:30px;">This booking is now <strong>confirmed</strong>.<br>Rejuvenators and the customer have been notified.</p>
          <p style="color:#666; font-size:14px; margin-top:30px;">You will receive further details by email. 💙</p>
        </div>
      </div>
    `;
    // Send confirmation email to customer
    const bookingParam = urlParams.get('booking');
    let bookingData = null;
    try {
      bookingData = bookingParam ? JSON.parse(decodeURIComponent(bookingParam)) : null;
    } catch (e) {}
    if (bookingData) {
      sendCustomerConfirmationEmail(bookingData, bookingData.therapist || 'Your Therapist');
    }
    // Stop timer in all tabs
    setTimeout(function() {
      localStorage.setItem('bookingAccepted', 'true');
    }, 100); // ensure event fires in all tabs
  } else if (action === 'decline') {
    document.body.innerHTML = '<h2>Booking declined. Thank you for your response.</h2>';
  }
})();

document.addEventListener('DOMContentLoaded', ()=>{
  // Set #date field to today's date by default
  var dateInput = document.getElementById('date');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  bindPrice();
  loadTherapists();
  showStep(1);
  emailjs.init('V8qq2pjH8vfh3a6q3');
  loadGoogleMapsAPI();
  tryGeolocation();
});





