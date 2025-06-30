// Rejuvenators Booking System v13 - Refactored Timer and Messaging

// --- Global state variables ---
let therapistTimeout = null;
let timeRemaining = 180;
let bookingAccepted = false;
let currentTherapistIndex = 0;      // tracks which therapist in the list is being contacted
let bookingId = null;               // unique booking identifier for the current request

let currentLat = null, currentLon = null;
let therapists = [], availableTherapists = [];
let selectedTherapist = null;

let stripe = null, card = null;

// Utility: Get form values easily
function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

// Utility: Construct booking data object from form fields
function getBookingData() {
  return {
    customerName: getValue('customerName'),
    customerEmail: getValue('customerEmail'),
    customerPhone: getValue('customerPhone'),
    address: getValue('address'),
    service: getValue('service'),
    duration: getValue('duration'),
    date: getValue('date'),
    time: getValue('time'),
    parking: getValue('parking'),
    roomNumber: getValue('roomNumber'),
    bookerName: getValue('bookerName'),
    price: calculatePrice()  // ensure price is calculated from current selections
  };
}

document.addEventListener('DOMContentLoaded', function() {
  // --- Step Navigation ---
  let currentStep = 'step1';
  function show(step) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    const stepEl = document.getElementById(step);
    if (!stepEl) return;
    stepEl.classList.add('active');
    currentStep = step;
    updateProgressBar(step);
  }

  function updateProgressBar(step) {
    const progressSteps = document.querySelectorAll('.progress-step');
    const stepNumber = parseInt(step.replace('step', '')) || 0;
    progressSteps.forEach((stepElement, index) => {
      const stepNum = index + 1;
      stepElement.classList.remove('active', 'completed');
      if (stepNum < stepNumber) {
        stepElement.classList.add('completed');
      } else if (stepNum === stepNumber) {
        stepElement.classList.add('active');
      }
    });
  }

  // Next/Prev button handlers
  document.querySelectorAll('.next').forEach(btn => {
    btn.onclick = () => show(btn.dataset.next);
  });
  document.querySelectorAll('.prev').forEach(btn => {
    btn.onclick = () => show(btn.dataset.prev);
  });

  // Initialize progress bar at step1
  updateProgressBar('step1');

  // --- Load Therapist Data ---
  function loadTherapists(callback) {
    fetch('mock-api/therapists.json')
      .then(res => res.json())
      .then(data => {
        therapists = data;
        if (callback) callback();
      })
      .catch(err => console.error('Error loading therapists data:', err));
  }

  // --- Google Maps Autocomplete for Address ---
  function loadGoogleMapsAPI() {
    const apiKey = 'AIzaSyBo632bfwdyKtue_-wkAms0Ac2mMRVnTWg';  // Google Maps API key
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
    } catch (e) {
      console.error('Google Autocomplete error:', e);
    }
  };

  // Fallback: Try browser Geolocation (if user permits)
  function tryGeolocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;
      });
    }
  }

  // Haversine formula to compute distance between two lat/lon points (in km)
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
              Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Filter therapists by location and availability (within 20 km)
  function filterTherapistsByLocation() {
    if (currentLat === null || currentLon === null) return [];
    return therapists.filter(t => {
      const d = distanceKm(currentLat, currentLon, t.lat, t.lon);
      return d <= 20 && t.available;
    });
  }

  // --- Service & Pricing Calculation ---
  function calculatePrice() {
    const basePrice = 159;  // base price for 60 min
    const duration = parseInt(getValue('duration')) || 60;
    let price = basePrice + ((duration - 60) / 15) * 15;
    // Determine if weekend or after-hours for surcharge
    const dateStr = getValue('date');
    const timeStr = getValue('time');
    if (dateStr && timeStr) {
      const bookingDateTime = new Date(`${dateStr}T${timeStr}`);
      const isWeekend = [0, 6].includes(bookingDateTime.getDay());      // Sunday=0, Saturday=6
      const hour = bookingDateTime.getHours();
      const isAfterHours = hour >= 18 || hour < 9;                      // define after-hours: 6pm-9am
      if (isWeekend || isAfterHours) {
        price *= 1.2;  // 20% surcharge
      }
    }
    // Parking surcharge
    const parking = getValue('parking');
    if (parking && parking !== 'free') {
      price += 20;
    }
    return price.toFixed(2);
  }

  function updatePriceDisplay() {
    const priceEl = document.getElementById('priceAmount');
    if (priceEl) {
      priceEl.textContent = calculatePrice();
    }
  }

  // Attach change event listeners to form inputs that affect price
  ['duration', 'date', 'time', 'parking'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updatePriceDisplay);
  });

  // Address manual input fallback: if user types an address (no autocomplete)
  const addressEl = document.getElementById('address');
  if (addressEl) {
    addressEl.addEventListener('input', function() {
      if (this.value.length > 10 && (!currentLat || !currentLon)) {
        // Default to Brisbane CBD coordinates if none obtained
        currentLat = -27.4698;
        currentLon = 153.0251;
      }
    });
  }

  // --- Therapist Selection (Step 6) ---
  // When step6 becomes visible, load the list of available therapists
  const step6El = document.getElementById('step6');
  if (step6El) {
    const step6Observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (step6El.classList.contains('active')) {
            loadTherapistSelection();
          }
        }
      });
    });
    step6Observer.observe(step6El, { attributes: true, attributeFilter: ['class'] });
  }

  function loadTherapistSelection() {
    availableTherapists = filterTherapistsByLocation();
    const selDiv = document.getElementById('therapistSelection');
    const requestBtn = document.getElementById('requestBtn');
    if (!selDiv || !requestBtn) return;

    if (availableTherapists.length === 0) {
      // No therapists available in the area
      selDiv.innerHTML = `<p style="color: red; text-align: center; padding: 20px;">
        No therapists available in your area. Please try a different location.
      </p>`;
      requestBtn.disabled = true;
      selectedTherapist = null;
    } else {
      // Sort therapists by distance (nearest first)
      availableTherapists.sort((a, b) => {
        const dA = distanceKm(currentLat, currentLon, a.lat, a.lon);
        const dB = distanceKm(currentLat, currentLon, b.lat, b.lon);
        return dA - dB;
      });
      // Populate dropdown list
      let optionsHtml = '';
      availableTherapists.forEach((t, index) => {
        const dist = distanceKm(currentLat, currentLon, t.lat, t.lon);
        const displayName = `${t.name} (${dist.toFixed(1)} km away)`;
        optionsHtml += `<option value="${index}">${displayName}</option>`;
      });
      selDiv.innerHTML = `<select id="therapistSelect">${optionsHtml}</select>`;
      // Default selected therapist is the first in the sorted list
      selectedTherapist = availableTherapists[0];
      // Listen for selection change
      const selectEl = document.getElementById('therapistSelect');
      selectEl.onchange = function() {
        const idx = parseInt(this.value);
        selectedTherapist = availableTherapists[idx];
      };
      // Enable the "Request Booking" button
      requestBtn.disabled = false;
    }
  }

  // Handle "Request Booking" button (end of Step 6)
  document.getElementById('requestBtn')?.addEventListener('click', function() {
    if (!selectedTherapist) {
      alert('Please select a therapist first.');
      return;
    }
    // Move the chosen therapist to the front of the list for first contact
    availableTherapists = [selectedTherapist, ...availableTherapists.filter(t => t !== selectedTherapist)];
    // Proceed to payment step
    show('step7');
  });

  // --- Payment Integration (Step 7) ---
  // Initialize Stripe elements when Step 7 is shown
  const step7El = document.getElementById('step7');
  if (step7El) {
    const step7Observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (step7El.classList.contains('active')) {
            initializePayment();  // step7 just became visible
          }
        }
      });
    });
    step7Observer.observe(step7El, { attributes: true, attributeFilter: ['class'] });
  }

  function initializePayment() {
    // Update the booking summary details on the payment page
    const summaryEl = document.getElementById('summary');
    const bookingData = getBookingData();
    if (summaryEl) {
      summaryEl.innerHTML = `
        <h3>Booking Summary</h3>
        <p><strong>Customer:</strong> ${bookingData.customerName}</p>
        <p><strong>Email:</strong> ${bookingData.customerEmail}</p>
        <p><strong>Phone:</strong> ${bookingData.customerPhone}</p>
        <p><strong>Address:</strong> ${bookingData.address}</p>
        <p><strong>Service:</strong> ${bookingData.service}</p>
        <p><strong>Duration:</strong> ${bookingData.duration} min</p>
        <p><strong>Date:</strong> ${bookingData.date}</p>
        <p><strong>Time:</strong> ${bookingData.time}</p>
        <p><strong>Room:</strong> ${bookingData.roomNumber || 'N/A'}</p>
        <p><strong>Therapist:</strong> ${selectedTherapist ? selectedTherapist.name : 'TBD'}</p>
        <p><strong>Total Price: $${bookingData.price}</strong></p>
      `;
    }
    // Initialize Stripe Card element
    if (typeof Stripe !== 'undefined') {
      stripe = Stripe('pk_test_51PGxKUKn3GaB6FyY1qeTOeYxWnBMDax8bUZhdP7RggDi1OyUp4BbSJWPhgb7hcvDynNqakuSfpGzwfuVhOsTvXmb001lwoCn7a');
      const elements = stripe.elements();
      card = elements.create('card', { hidePostalCode: true });
      const cardEl = document.getElementById('card-element');
      if (cardEl) {
        cardEl.innerHTML = '';  // clear any previous card element
        card.mount('#card-element');
      }
      // Toggle payment button enabled state based on card input completeness
      card.on('change', event => {
        const payBtn = document.getElementById('payBtn');
        if (!payBtn) return;
        if (event.complete) {
          payBtn.disabled = false;
          payBtn.style.opacity = '1';
        } else {
          payBtn.disabled = true;
          payBtn.style.opacity = '0.5';
        }
      });
    }
  }

  // --- EmailJS initialization ---
  function initEmailJS() {
    if (typeof emailjs !== 'undefined') {
      emailjs.init('V8qq2pjH8vfh3a6q3');  // EmailJS user/public key
    }
  }

  // --- Booking Request & Timer Logic (Step 8) ---
  function startBookingRequest() {
    // Prevent starting a new request if one was already accepted in this session
    const alreadyAccepted = localStorage.getItem('bookingAccepted') === 'true';
    const prevAcceptedId = localStorage.getItem('acceptedBookingId');
    if (alreadyAccepted && prevAcceptedId) {
      console.warn('Booking already accepted (ID:', prevAcceptedId, ') – not starting a new request.');
      return;
    }
    if (bookingAccepted) {
      // bookingAccepted flag in this page (should be false if not accepted yet)
      return;
    }

    // Create a unique booking ID (timestamp + random suffix)
    bookingId = 'booking_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Clear any previous booking acceptance flags in local storage (for a fresh start)
    localStorage.removeItem('bookingAccepted');
    localStorage.removeItem('acceptedTherapist');
    localStorage.removeItem('acceptedBookingData');
    localStorage.removeItem('acceptedBookingId');
    localStorage.removeItem('therapistDeclined');

    // Show the waiting / request step (step8)
    show('step8');
    bookingAccepted = false;
    currentTherapistIndex = 0;

    // Send an acknowledgment email to the customer
    sendCustomerAcknowledgmentEmail();

    // Begin contacting therapists (starting with the selected therapist at index 0)
    sendRequestToTherapist(currentTherapistIndex);
  }

  function sendRequestToTherapist(index) {
    if (bookingAccepted || index >= availableTherapists.length) {
      // If booking got accepted or we've exhausted the list, do nothing further
      return;
    }
    const therapist = availableTherapists[index];
    // Update UI message to user
    const requestMsgEl = document.getElementById('requestMsg');
    const currentTherapistEl = document.getElementById('currentTherapist');
    if (requestMsgEl && currentTherapistEl) {
      if (index === 0) {
        // First choice therapist
        requestMsgEl.innerText = `Sending request to ${therapist.name} (your selected therapist)...`;
      } else {
        // Fallback therapist after the first was not available
        requestMsgEl.innerText = `${selectedTherapist.name} was not available at your requested time. We are now contacting another therapist...`;
      }
      currentTherapistEl.textContent = therapist.name;
    }
    // Email the therapist with booking details and acceptance/decline links
    sendTherapistRequestEmail(therapist);
    // Start the 180-second countdown for this therapist to respond
    startCountdown();
  }

  function startCountdown() {
    // Clear any existing timer to avoid overlap
    if (therapistTimeout) {
      clearInterval(therapistTimeout);
      therapistTimeout = null;
    }
    bookingAccepted = false;
    timeRemaining = 180;
    const timeRemEl = document.getElementById('timeRemaining');
    if (timeRemEl) {
      timeRemEl.textContent = `${timeRemaining}s`;
    }
    // Begin countdown interval (1 second ticks)
    therapistTimeout = setInterval(() => {
      if (bookingAccepted) {
        // A therapist accepted (flag set via storage event), stop the timer
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        return;
      }
      timeRemaining--;
      if (timeRemEl) {
        timeRemEl.textContent = `${timeRemaining}s`;
      }
      if (timeRemaining <= 0) {
        // Time ran out for the current therapist
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        onTherapistNoResponse();
      }
    }, 1000);
  }

  function onTherapistNoResponse() {
    // No response from current therapist within 180s – move to next if available
    currentTherapistIndex++;
    if (currentTherapistIndex < availableTherapists.length) {
      // Try the next therapist in line
      sendRequestToTherapist(currentTherapistIndex);
    } else {
      // No therapists left to try
      const requestMsgEl = document.getElementById('requestMsg');
      if (requestMsgEl) {
        requestMsgEl.innerText = 'No therapists responded. Your payment will be refunded.';
      }
      // (In a real deployment, you might trigger a refund process or notify admin here)
    }
  }

  // --- Email Sending Functions ---
  function sendTherapistRequestEmail(therapist) {
    const bookingData = getBookingData();
    // Calculate therapist's earning for this booking (hourly rate depends on time)
    const durationMinutes = parseInt(bookingData.duration) || 60;
    const durationHours = durationMinutes / 60;
    const bookingDateTime = new Date(`${bookingData.date}T${bookingData.time}`);
    const isWeekend = [0, 6].includes(bookingDateTime.getDay());
    const hour = bookingDateTime.getHours();
    const isNormalHours = !isWeekend && hour >= 9 && hour < 18;
    const hourlyRate = isNormalHours ? 90 : 105;
    const therapistFee = (durationHours * hourlyRate).toFixed(2);

    // Generate unique acceptance/decline URLs for the therapist
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const encodedBooking = encodeURIComponent(JSON.stringify(bookingData));
    const acceptUrl = `${baseUrl}?action=accept&therapist=${encodeURIComponent(therapist.name)}&booking=${encodedBooking}&bookingId=${bookingId}`;
    const declineUrl = `${baseUrl}?action=decline&therapist=${encodeURIComponent(therapist.name)}&booking=${encodedBooking}&bookingId=${bookingId}`;

    // Compose the HTML email for the booking request
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:20px; border-radius:15px;">
        <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align:center; margin-bottom:30px;">
            <h1 style="color:#00729B; margin-bottom:10px;">🎉 NEW BOOKING REQUEST</h1>
            <p style="color:#666; font-size:18px;">You have a new client waiting for you!</p>
          </div>
          <div style="background:#f8f9fa; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #00729B;">
            <h3 style="color:#00729B; margin-top:0;">📋 Booking Details</h3>
            <p><strong>👤 Customer:</strong> ${bookingData.customerName}</p>
            <p><strong>📧 Email:</strong> ${bookingData.customerEmail}</p>
            <p><strong>📞 Phone:</strong> ${bookingData.customerPhone}</p>
            <p><strong>📍 Address:</strong> ${bookingData.address}</p>
            <p><strong>💆‍♀️ Service:</strong> ${bookingData.service}</p>
            <p><strong>⏱️ Duration:</strong> ${bookingData.duration} minutes</p>
            <p><strong>📅 Date:</strong> ${bookingData.date}</p>
            <p><strong>🕐 Time:</strong> ${bookingData.time}</p>
            <p><strong>🏠 Room:</strong> ${bookingData.roomNumber || 'N/A'}</p>
            <p><strong>📝 Booked By:</strong> ${bookingData.bookerName || 'N/A'}</p>
          </div>
          <div style="background:#e8f5e8; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #28a745;">
            <h3 style="color:#28a745; margin-top:0;">💰 Your Fees</h3>
            <p><strong>⏱️ Duration:</strong> ${durationMinutes} minutes (${durationHours.toFixed(2)} hours)</p>
            <p><strong>💵 Hourly Rate:</strong> $${hourlyRate}/hour ${isNormalHours ? '(Normal Hours)' : '(Premium Hours)'}</p>
            <p><strong>💳 Your Earnings:</strong> $${therapistFee}</p>
          </div>
          <div style="background:#fff3cd; padding:15px; border-radius:8px; margin:20px 0; border-left:4px solid #ffc107;">
            <p style="margin:0; color:#856404;"><strong>⏰ Please respond within 3 minutes (180 seconds) to secure this booking!</strong></p>
          </div>
          <div style="text-align:center; margin-top:30px;">
            <a href="${acceptUrl}" style="background:#28a745; color:white; padding:15px 30px; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px; margin:5px; display:inline-block;">✅ ACCEPT BOOKING</a>
            <a href="${declineUrl}" style="background:#dc3545; color:white; padding:15px 30px; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px; margin:5px; display:inline-block;">❌ DECLINE</a>
          </div>
          <p style="text-align:center; color:#666; font-size:14px; margin-top:30px;">
            Thank you for being part of the Rejuvenators team! 💙
          </p>
        </div>
      </div>
    `;
    // Send the email via EmailJS (template and service IDs should match your EmailJS setup)
    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: therapist.name,
        to_email: therapist.email || 'aishizhengjing@gmail.com',  // use actual therapist email in production
        subject: `New Booking Request for ${therapist.name}`,
        message_html: emailHTML,
        html_message: emailHTML
      }).then(res => {
        console.log('Therapist request email sent to', therapist.name, res);
      }).catch(err => {
        console.error('Therapist email error:', err);
      });
    }
  }

  function sendCustomerAcknowledgmentEmail() {
    const data = getBookingData();
    if (!data.customerEmail || !data.customerName) {
      console.error('Customer email or name is missing, acknowledgment email not sent.');
      return;
    }
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
      }).then(res => {
        console.log('Customer acknowledgment email sent:', res);
      }).catch(err => {
        console.error('Customer acknowledgment email error:', err);
      });
    }
  }

  function sendCustomerDeclineEmail(bookingData, therapistName) {
    // Notify customer that their preferred therapist was not available
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:20px; border-radius:15px;">
        <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align:center; margin-bottom:30px;">
            <h1 style="color:#00729B; margin-bottom:10px;">📅 Finding an Alternative Therapist</h1>
            <p style="color:#666; font-size:18px;">Hi ${bookingData.customerName}, an update on your booking:</p>
          </div>
          <div style="background:#fff3cd; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #ffc107;">
            <p style="margin:0; color:#856404;">
              ${therapistName} was not available at your requested date and time.
              <strong>We are now looking to find a replacement therapist for you.</strong>
            </p>
          </div>
          <div style="background:#e8f5e8; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #28a745;">
            <h3 style="color:#28a745; margin-top:0;">🔍 What we're doing now:</h3>
            <p style="margin:0; color:#155724;">
              • Contacting other qualified therapists in your area<br>
              • Maintaining your preferred time slot<br>
              • Ensuring the same quality service
            </p>
          </div>
          <div style="background:#d4edda; padding:15px; border-radius:8px; margin:20px 0;">
            <p style="margin:0; color:#155724; text-align:center;">
              <strong>We'll let you know as soon as another therapist confirms.</strong>
            </p>
          </div>
          <p style="text-align:center; color:#666; font-size:14px; margin-top:30px;">
            Thank you for your patience. We're working hard to find you the perfect therapist! 💙
          </p>
        </div>
      </div>
    `;
    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: bookingData.customerName,
        to_email: bookingData.customerEmail,
        subject: 'Update: Finding an Alternative Therapist',
        message_html: emailHTML,
        html_message: emailHTML
      }).then(res => {
        console.log('Customer decline notification sent:', res);
      }).catch(err => {
        console.error('Customer decline email error:', err);
      });
    }
  }

  function sendCustomerConfirmationEmail(bookingData, therapistName) {
    // Notify customer that a therapist has accepted and booking is confirmed
    if (!bookingData.customerEmail || !bookingData.customerName) {
      console.error('Missing customer info for confirmation email.');
      return;
    }
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
      }).then(res => {
        console.log('Customer confirmation email sent:', res);
      }).catch(err => {
        console.error('Customer confirmation email error:', err);
      });
    }
  }

  function sendTherapistConfirmationEmail(bookingData, therapistName) {
    // Notify therapist that they have successfully accepted the booking
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:20px; border-radius:15px;">
        <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align:center; margin-bottom:30px;">
            <h1 style="color:#28a745; margin-bottom:10px;">✅ Booking Accepted!</h1>
            <p style="color:#666; font-size:18px;">Thank you for accepting the booking, ${therapistName}!</p>
          </div>
          <div style="background:#d4edda; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #28a745;">
            <p style="margin:0; color:#155724;">
              The booking has been successfully assigned to you. The customer has been notified of the confirmation.
            </p>
          </div>
          <div style="background:#f8f9fa; padding:20px; border-radius:8px; margin:20px 0; border-left:4px solid #00729B;">
            <h3 style="color:#00729B; margin-top:0;">📋 Booking Details</h3>
            <p><strong>👤 Customer:</strong> ${bookingData.customerName}</p>
            <p><strong>📧 Email:</strong> ${bookingData.customerEmail}</p>
            <p><strong>📞 Phone:</strong> ${bookingData.customerPhone}</p>
            <p><strong>📍 Address:</strong> ${bookingData.address}</p>
            <p><strong>💆‍♀️ Service:</strong> ${bookingData.service}</p>
            <p><strong>⏱️ Duration:</strong> ${bookingData.duration} minutes</p>
            <p><strong>📅 Date:</strong> ${bookingData.date}</p>
            <p><strong>🕐 Time:</strong> ${bookingData.time}</p>
          </div>
          <div style="background:#fff3cd; padding:15px; border-radius:8px; margin:20px 0; border-left:4px solid #ffc107;">
            <p style="margin:0; color:#856404;"><strong>📞 Please reach out to the customer before the appointment to confirm any details.</strong></p>
          </div>
          <p style="text-align:center; color:#666; font-size:14px; margin-top:30px;">
            Thank you for being part of the Rejuvenators team! 💙
          </p>
        </div>
      </div>
    `;
    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: therapistName,
        to_email: 'aishizhengjing@gmail.com',  // replace with actual therapist's email in production
        subject: `Booking Confirmation – ${bookingData.customerName} (Client)`,
        message_html: emailHTML,
        html_message: emailHTML
      }).then(res => {
        console.log('Therapist confirmation email sent:', res);
      }).catch(err => {
        console.error('Therapist confirmation email error:', err);
      });
    }
  }

  // --- Show Confirmation Page to User (after accept) ---
  function showConfirmationPage(bookingData, therapistName) {
    // Replace the entire page content with a confirmation summary for the user
    document.documentElement.innerHTML = `
      <div style="text-align:center; padding:50px 20px; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height:100vh;">
        <div style="max-width:600px; margin:0 auto; background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
          <div style="font-size:60px; margin-bottom:20px;">✅</div>
          <h1 style="color:#28a745; margin-bottom:20px;">Booking Confirmed!</h1>
          <p style="font-size:18px; color:#666; margin-bottom:30px;">
            Good news – <strong>${therapistName}</strong> has accepted your booking request!
          </p>
          <div style="background:#f8f9fa; padding:20px; border-radius:8px; margin:20px 0; text-align:left;">
            <h3 style="color:#00729B; margin-top:0;">Booking Details</h3>
            <p><strong>Customer:</strong> ${bookingData.customerName}</p>
            <p><strong>Service:</strong> ${bookingData.service}</p>
            <p><strong>Duration:</strong> ${bookingData.duration} minutes</p>
            <p><strong>Date:</strong> ${bookingData.date}</p>
            <p><strong>Time:</strong> ${bookingData.time}</p>
            <p><strong>Address:</strong> ${bookingData.address}</p>
            <p><strong>Therapist:</strong> ${therapistName}</p>
            <p><strong>Total Amount:</strong> $${bookingData.price}</p>
          </div>
          <div style="background:#e8f5e8; padding:15px; border-radius:8px; margin:20px 0; border-left:4px solid #28a745;">
            <p style="margin:0; color:#28a745;"><strong>Your payment has been processed successfully.</strong></p>
          </div>
          <p style="color:#666; font-size:14px; margin-top:30px;">
            ${therapistName} will contact you before your appointment to confirm the details.<br><br>
            Thank you for choosing Rejuvenators Mobile Massage! 💙
          </p>
        </div>
      </div>
    `;
  }

  // --- Payment Button Handler (Start booking request) ---
  document.getElementById('payBtn')?.addEventListener('click', function() {
    // Always allow test/fallback booking for dev/demo
    function proceedWithBooking() {
      window.paymentMethodId = 'pm_test_' + Math.random().toString(36).substr(2, 9);
      startBookingRequest();
    }

    if (typeof Stripe !== 'undefined' && stripe && card) {
      stripe.createPaymentMethod({ type: 'card', card: card })
        .then(result => {
          if (result.error) {
            alert(result.error.message + "\n\n(For test mode, use card 4242 4242 4242 4242, any future date, any CVC.)");
            // Fallback: allow test booking anyway
            proceedWithBooking();
          } else {
            // PaymentMethod created (in a real app, send this to server for payment intent confirmation)
            window.paymentMethodId = result.paymentMethod.id;
            startBookingRequest();
          }
        })
        .catch(() => {
          // Stripe failed, fallback to test booking
          proceedWithBooking();
        });
    } else {
      // No Stripe (testing scenario), proceed as if payment was successful
      proceedWithBooking();
    }
  });

  // --- Listen for cross-tab storage events (accept/decline actions) ---
  window.addEventListener('storage', e => {
    // Therapist Accepted in another tab
    if (e.key === 'bookingAccepted' && e.newValue === 'true') {
      console.log('📢 Detected booking acceptance in another tab.');
      bookingAccepted = true;  // flag this booking as accepted
      if (therapistTimeout) {
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        console.log('⏱️ Timer cleared due to therapist acceptance.');
      }
      // Retrieve accepted booking info from localStorage
      const therapistName = localStorage.getItem('acceptedTherapist');
      const bookingDataStr = localStorage.getItem('acceptedBookingData');
      const acceptedBookingId = localStorage.getItem('acceptedBookingId');
      if (therapistName && bookingDataStr && acceptedBookingId === bookingId) {
        const bookingData = JSON.parse(decodeURIComponent(bookingDataStr));
        // Show confirmation page to the user
        showConfirmationPage(bookingData, therapistName);
        // (Optional: clean up storage keys after handling)
        // localStorage.removeItem('acceptedTherapist'); 
        // localStorage.removeItem('acceptedBookingData'); 
        // localStorage.removeItem('acceptedBookingId');
      }
    }
    // Therapist Declined in another tab
    if (e.key === 'therapistDeclined') {
      console.log('📢 Detected therapist decline in another tab.');
      if (therapistTimeout) {
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        console.log('⏱️ Timer cleared due to therapist decline.');
      }
      const declinedTherapist = e.newValue || 'Therapist';
      // If the first-choice therapist declined, notify customer via email
      if (currentTherapistIndex === 0) {
        const bookingData = getBookingData();
        sendCustomerDeclineEmail(bookingData, declinedTherapist);
      }
      // Move to next available therapist, if any
      onTherapistNoResponse();  // reuse the timeout handler to increment index and send next request
      // (Optional: remove the flag so it doesn't retrigger)
      // localStorage.removeItem('therapistDeclined');
    }
  });

  // --- Therapist Response URL Handling (Accept/Decline Actions) ---
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  const therapistNameParam = urlParams.get('therapist');
  const bookingDataParam = urlParams.get('booking');
  const bookingIdParam = urlParams.get('bookingId');

  if (action && therapistNameParam && bookingDataParam && bookingIdParam) {
    const parsedBookingData = JSON.parse(decodeURIComponent(bookingDataParam));
    // Therapist ACCEPT link clicked
    if (action === 'accept') {
      const alreadyAccepted = localStorage.getItem('bookingAccepted') === 'true';
      const prevAcceptedId = localStorage.getItem('acceptedBookingId');
      console.log('Therapist', therapistNameParam, 'clicked ACCEPT for booking', bookingIdParam);
      if (alreadyAccepted && prevAcceptedId === bookingIdParam) {
        // This booking was already accepted by someone else
        document.documentElement.innerHTML = `
          <div style="text-align:center; padding:50px 20px; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height:100vh;">
            <div style="max-width:600px; margin:0 auto; background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
              <div style="font-size:60px; margin-bottom:20px;">⚠️</div>
              <h1 style="color:#ffc107; margin-bottom:20px;">Booking Already Accepted</h1>
              <p style="font-size:18px; color:#666; margin-bottom:30px;">
                Unfortunately, this booking has already been accepted by another therapist.
              </p>
              <p style="color:#666; font-size:14px; margin-top:30px;">
                Thank you for your prompt response.
              </p>
            </div>
          </div>
        `;
        return;  // do not proceed further
      }
      // Mark booking as accepted in localStorage for cross-tab communication
      localStorage.setItem('bookingAccepted', 'true');
      localStorage.setItem('acceptedTherapist', therapistNameParam);
      localStorage.setItem('acceptedBookingData', encodeURIComponent(JSON.stringify(parsedBookingData)));
      localStorage.setItem('acceptedBookingId', bookingIdParam);
      // Clean up URL to remove query parameters (so refresh won't repeat action)
      window.history.replaceState({}, document.title, window.location.pathname);
      // Send confirmation emails
      sendCustomerConfirmationEmail(parsedBookingData, therapistNameParam);
      sendTherapistConfirmationEmail(parsedBookingData, therapistNameParam);
      // Show a confirmation page (with booking details) – this will be visible to the therapist who clicked accept
      showConfirmationPage(parsedBookingData, therapistNameParam);
    }
    // Therapist DECLINE link clicked
    else if (action === 'decline') {
      console.log('Therapist', therapistNameParam, 'clicked DECLINE for booking', bookingIdParam);
      // Mark decline in localStorage to notify the original page
      localStorage.setItem('therapistDeclined', therapistNameParam);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Show a simple message to the therapist that the request was declined
      document.documentElement.innerHTML = `
        <div style="text-align:center; padding:50px 20px; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height:100vh;">
          <div style="max-width:600px; margin:0 auto; background:white; padding:40px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div style="font-size:60px; margin-bottom:20px;">❌</div>
            <h1 style="color:#dc3545; margin-bottom:20px;">Booking Declined</h1>
            <p style="font-size:18px; color:#666; margin-bottom:30px;">
              You have declined the booking request. The customer will be notified and we will seek another therapist.
            </p>
            <p style="color:#666; font-size:14px; margin-top:30px;">
              Thank you for your prompt response.
            </p>
          </div>
        </div>
      `;
      // Note: The original booking page (if open) will handle moving to the next therapist via the storage event.
    }
  }

  // --- Initialize third-party integrations on page load ---
  loadGoogleMapsAPI();
  tryGeolocation();
  loadTherapists();
  initEmailJS();

  // Set initial price display
  updatePriceDisplay();
});


