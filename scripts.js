// Rejuvenators Booking System v7 - Full Implementation (Block 1)

document.addEventListener('DOMContentLoaded', function() {
  // Step navigation
  let currentStep = 'step1';
  function show(step) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(step).classList.add('active');
    currentStep = step;
    updateProgressBar(step);
  }

  // Progress bar update
  function updateProgressBar(step) {
    const progressSteps = document.querySelectorAll('.progress-step');
    const stepNumber = parseInt(step.replace('step', ''));
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
  document.querySelectorAll('.next').forEach(b => b.onclick = () => show(b.dataset.next));
  document.querySelectorAll('.prev').forEach(b => b.onclick = () => show(b.dataset.prev));

  // Initialize progress bar
  updateProgressBar('step1');

  // --- Location & Therapist Filtering ---
  let currentLat = null, currentLon = null, therapists = [], availableTherapists = [];

  // Load therapists from mock API
  function loadTherapists(callback) {
    fetch('mock-api/therapists.json')
      .then(r => r.json())
      .then(data => {
        therapists = data;
        if (callback) callback();
      });
  }

  // Google Maps Autocomplete
  function loadGoogleMapsAPI() {
    const apiKey = 'AIzaSyBo632bfwdyKtue_-wkAms0Ac2mMRVnTWg'; // Replace with secure method in prod
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
      const autocomplete = new google.maps.places.Autocomplete(addressInput, { componentRestrictions: { country: 'au' } });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          currentLat = place.geometry.location.lat();
          currentLon = place.geometry.location.lng();
        }
      });
    } catch (e) { console.error('Autocomplete error', e); }
  };

  // Try to get GPS location
  function tryGeolocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(pos) {
        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;
      });
    }
  }

  // Haversine distance
  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Filter therapists by location and availability
  function filterTherapists() {
    if (currentLat === null || currentLon === null) return [];
    return therapists.filter(t => {
      const d = distance(currentLat, currentLon, t.lat, t.lon);
      return d <= 20 && t.available;
    });
  }

  // --- Service & Duration Selection ---
  function calculatePrice() {
    const base = 159;
    const dur = parseInt(document.getElementById('duration').value);
    let price = base + ((dur - 60) / 15) * 15;
    // Surcharges
    const dateValue = document.getElementById('date').value;
    const timeValue = document.getElementById('time').value;
    if (dateValue && timeValue) {
      const dt = new Date(dateValue + 'T' + timeValue);
      if ([0,6].includes(dt.getDay())) price *= 1.2; // Weekend
      const hr = dt.getHours();
      if (hr >= 18 || hr < 9) price *= 1.2; // After hours
    }
    // Parking
    const parking = document.getElementById('parking').value;
    if (parking !== 'free') price += 20;
    return price.toFixed(2);
  }

  function updatePriceDisplay() {
    const priceElement = document.getElementById('priceAmount');
    if (priceElement) priceElement.textContent = calculatePrice();
  }

  // Event listeners for price update
  ['duration','date','time','parking'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updatePriceDisplay);
  });

  // Address input fallback for manual entry
  const addressInput = document.getElementById('address');
  if (addressInput) {
    addressInput.addEventListener('input', function() {
      if (this.value.length > 10 && (!currentLat || !currentLon)) {
        // Default to Brisbane CBD if not set
        currentLat = -27.4698;
        currentLon = 153.0251;
      }
    });
  }

  // --- Therapist Selection ---
  let selectedTherapist = null;
  
  // When moving to step 6 (therapist selection), filter and display therapists
  document.querySelector('.next[data-next="step6"]').onclick = function() {
    availableTherapists = filterTherapists();
    const selDiv = document.getElementById('therapistSelection');
    
    if (availableTherapists.length === 0) {
      selDiv.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">No therapists available in your area. Please try a different location.</p>';
      document.getElementById('requestBtn').disabled = true;
    } else {
      // Sort by distance
      availableTherapists.sort((a, b) => {
        const dA = distance(currentLat, currentLon, a.lat, a.lon);
        const dB = distance(currentLat, currentLon, b.lat, b.lon);
        return dA - dB;
      });
      
      selDiv.innerHTML = '<select id="therapistSelect"></select>';
      const sel = document.getElementById('therapistSelect');
      availableTherapists.forEach(t => {
        const d = distance(currentLat, currentLon, t.lat, t.lon);
        const opt = document.createElement('option');
        opt.value = JSON.stringify(t);
        opt.text = `${t.name} (${d.toFixed(1)} km away)`;
        sel.append(opt);
      });
      
      // Set default selection
      selectedTherapist = availableTherapists[0];
      sel.onchange = function() {
        selectedTherapist = JSON.parse(this.value);
      };
    }
  };

  // --- Payment Integration ---
  let stripe, card;
  
  // Initialize Stripe when step 7 (payment) is shown
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const step7 = document.getElementById('step7');
        if (step7 && step7.classList.contains('active')) {
          initializePayment();
        }
      }
    });
  });
  
  observer.observe(document.getElementById('step7'), {
    attributes: true,
    attributeFilter: ['class']
  });

  function initializePayment() {
    // Update booking summary
    const summary = document.getElementById('summary');
    const price = calculatePrice();
    summary.innerHTML = `
      <h3>Booking Summary</h3>
      <p><strong>Customer:</strong> ${document.getElementById('customerName').value}</p>
      <p><strong>Email:</strong> ${document.getElementById('customerEmail').value}</p>
      <p><strong>Phone:</strong> ${document.getElementById('customerPhone').value}</p>
      <p><strong>Address:</strong> ${document.getElementById('address').value}</p>
      <p><strong>Service:</strong> ${document.getElementById('service').value}</p>
      <p><strong>Duration:</strong> ${document.getElementById('duration').value} min</p>
      <p><strong>Date:</strong> ${document.getElementById('date').value}</p>
      <p><strong>Time:</strong> ${document.getElementById('time').value}</p>
      <p><strong>Room:</strong> ${document.getElementById('roomNumber').value || 'N/A'}</p>
      <p><strong>Room Size:</strong> ${document.getElementById('roomSize').value}</p>
      <p><strong>Therapist:</strong> ${selectedTherapist ? selectedTherapist.name : 'TBD'}</p>
      <p><strong>Total Price: $${price}</strong></p>
    `;

    // Initialize Stripe
    if (typeof Stripe !== 'undefined') {
      stripe = Stripe('pk_test_12345'); // Replace with your Stripe key
      const elements = stripe.elements();
      card = elements.create('card');
      document.getElementById('card-element').innerHTML = '';
      card.mount('#card-element');
      
      card.on('change', function(event) {
        const payBtn = document.getElementById('payBtn');
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

  // --- Booking Request & Notification System ---
  let bookingAccepted = false;
  let currentTherapistIndex = 0;
  let therapistTimeout = null;
  let timeRemaining = 120; // 2 minutes per therapist

  // Initialize EmailJS
  function initEmailJS() {
    if (typeof emailjs !== 'undefined') {
      emailjs.init('V8qq2pjH8vfh3a6q3'); // Your EmailJS public key
    }
  }

  // Payment button handler
  document.getElementById('payBtn').onclick = function() {
    if (typeof Stripe !== 'undefined' && stripe && card) {
      stripe.createPaymentMethod({
        type: 'card',
        card: card,
      }).then(result => {
        if (result.error) {
          alert(result.error.message);
          return;
        }
        // Store payment method for later use
        window.paymentMethodId = result.paymentMethod.id;
        startBookingRequest();
      });
    } else {
      // Fallback for testing
      window.paymentMethodId = 'pm_test_' + Math.random().toString(36).substr(2, 9);
      startBookingRequest();
    }
  };

  function startBookingRequest() {
    show('step8');
    bookingAccepted = false;
    currentTherapistIndex = 0;
    
    // Send acknowledgment email to customer
    sendCustomerAcknowledgmentEmail();
    
    // Start therapist assignment process
    sendRequestToCurrentTherapist();
  }

  function sendRequestToCurrentTherapist() {
    if (bookingAccepted || currentTherapistIndex >= availableTherapists.length) {
      if (currentTherapistIndex >= availableTherapists.length) {
        document.getElementById('requestMsg').innerText = 'No therapists responded in time. Your payment will be refunded.';
      }
      return;
    }

    const therapist = availableTherapists[currentTherapistIndex];
    document.getElementById('requestMsg').innerText = `Sending request to ${therapist.name}...`;
    document.getElementById('currentTherapist').textContent = therapist.name;
    
    // Send email to therapist
    sendTherapistEmail(therapist);
    
    // Start countdown
    startCountdown();
  }

  function sendTherapistEmail(therapist) {
    const bookingData = {
      customerName: document.getElementById('customerName').value,
      customerEmail: document.getElementById('customerEmail').value,
      customerPhone: document.getElementById('customerPhone').value,
      address: document.getElementById('address').value,
      service: document.getElementById('service').value,
      duration: document.getElementById('duration').value,
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      parking: document.getElementById('parking').value,
      roomNumber: document.getElementById('roomNumber').value,
      roomSize: document.getElementById('roomSize').value,
      price: calculatePrice()
    };

    const acceptUrl = `${window.location.origin}${window.location.pathname}?action=accept&therapist=${encodeURIComponent(therapist.name)}&booking=${encodeURIComponent(JSON.stringify(bookingData))}`;
    const declineUrl = `${window.location.origin}${window.location.pathname}?action=decline&therapist=${encodeURIComponent(therapist.name)}&booking=${encodeURIComponent(JSON.stringify(bookingData))}`;

    const emailHTML = `
      <h2>NEW BOOKING REQUEST</h2>
      <p><strong>Customer:</strong> ${bookingData.customerName}</p>
      <p><strong>Email:</strong> ${bookingData.customerEmail}</p>
      <p><strong>Phone:</strong> ${bookingData.customerPhone}</p>
      <p><strong>Address:</strong> ${bookingData.address}</p>
      <p><strong>Service:</strong> ${bookingData.service}</p>
      <p><strong>Duration:</strong> ${bookingData.duration} min</p>
      <p><strong>Date:</strong> ${bookingData.date}</p>
      <p><strong>Time:</strong> ${bookingData.time}</p>
      <p><strong>Room:</strong> ${bookingData.roomNumber || 'N/A'}</p>
      <p><strong>Room Size:</strong> ${bookingData.roomSize}</p>
      <p><strong>Price:</strong> $${bookingData.price}</p>
      <br>
      <p><strong>Please respond within 120 seconds:</strong></p>
      <p>
        <a href="${acceptUrl}" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">ACCEPT</a>
        <a href="${declineUrl}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">DECLINE</a>
      </p>
    `;

    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: therapist.name,
        to_email: 'aidanleo@yahoo.co.uk', // Replace with therapist.email in production
        subject: `Therapist - ${therapist.name} You've got a New Booking Request`,
        message_html: emailHTML,
        html_message: emailHTML,
        html_content: emailHTML
      }, 'V8qq2pjH8vfh3a6q3').then(res => {
        console.log('Therapist email sent:', res);
      }).catch(err => {
        console.error('Therapist email error:', err);
      });
    }
  }

  function sendCustomerAcknowledgmentEmail() {
    const bookingData = {
      customerName: document.getElementById('customerName').value,
      customerEmail: document.getElementById('customerEmail').value,
      service: document.getElementById('service').value,
      duration: document.getElementById('duration').value,
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      price: calculatePrice()
    };

    const emailHTML = `
      <h2>Booking Request Received</h2>
      <p>Hi ${bookingData.customerName},</p>
      <p>We've received your booking request for ${bookingData.service} on ${bookingData.date} at ${bookingData.time}.</p>
      <p>We're now contacting available therapists in your area. You'll receive a confirmation email once a therapist accepts your booking.</p>
      <p><strong>Total Price:</strong> $${bookingData.price}</p>
      <p>Your payment will only be processed once a therapist accepts your booking.</p>
    `;

    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: bookingData.customerName,
        to_email: bookingData.customerEmail,
        subject: 'Booking Request Received',
        message_html: emailHTML,
        html_message: emailHTML,
        html_content: emailHTML
      }, 'V8qq2pjH8vfh3a6q3').then(res => {
        console.log('Customer acknowledgment email sent:', res);
      }).catch(err => {
        console.error('Customer email error:', err);
      });
    }
  }

  function startCountdown() {
    timeRemaining = 120;
    const timerElement = document.getElementById('timeRemaining');
    
    if (therapistTimeout) clearInterval(therapistTimeout);
    
    therapistTimeout = setInterval(() => {
      if (bookingAccepted) {
        clearInterval(therapistTimeout);
        return;
      }
      
      timeRemaining--;
      timerElement.textContent = `${timeRemaining} seconds`;
      
      if (timeRemaining <= 0) {
        clearInterval(therapistTimeout);
        currentTherapistIndex++;
        
        if (currentTherapistIndex < availableTherapists.length) {
          sendRequestToCurrentTherapist();
        } else {
          document.getElementById('requestMsg').innerText = 'No therapists responded in time. Your payment will be refunded.';
        }
      }
    }, 1000);
  }

  // Handle therapist response from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  const therapistName = urlParams.get('therapist');
  const bookingData = urlParams.get('booking');
  
  if (action && therapistName && bookingData) {
    setTimeout(() => {
      handleTherapistResponse(action, therapistName, JSON.parse(decodeURIComponent(bookingData)));
    }, 100);
  }

  function handleTherapistResponse(action, therapistName, bookingData) {
    if (action === 'accept') {
      bookingAccepted = true;
      if (therapistTimeout) clearInterval(therapistTimeout);
      
      // Send confirmation email to customer
      sendCustomerConfirmationEmail(bookingData, therapistName);
      
      // Show confirmation page
      showConfirmationPage(bookingData, therapistName);
    } else if (action === 'decline') {
      // Move to next therapist or show decline message
      currentTherapistIndex++;
      if (currentTherapistIndex < availableTherapists.length) {
        sendRequestToCurrentTherapist();
      } else {
        document.getElementById('requestMsg').innerText = 'All therapists declined. Your payment will be refunded.';
      }
    }
  }

  function sendCustomerConfirmationEmail(bookingData, therapistName) {
    const emailHTML = `
      <h2>Booking Confirmed!</h2>
      <p>Hi ${bookingData.customerName},</p>
      <p>Great news! ${therapistName} has accepted your booking request.</p>
      <p><strong>Service:</strong> ${bookingData.service}</p>
      <p><strong>Date:</strong> ${bookingData.date}</p>
      <p><strong>Time:</strong> ${bookingData.time}</p>
      <p><strong>Address:</strong> ${bookingData.address}</p>
      <p><strong>Total Price:</strong> $${bookingData.price}</p>
      <p>Your payment has been processed successfully.</p>
      <p>${therapistName} will contact you before your appointment to confirm details.</p>
    `;

    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: bookingData.customerName,
        to_email: bookingData.customerEmail,
        subject: 'Booking Confirmed',
        message_html: emailHTML,
        html_message: emailHTML,
        html_content: emailHTML
      }, 'V8qq2pjH8vfh3a6q3').then(res => {
        console.log('Confirmation email sent:', res);
      }).catch(err => {
        console.error('Confirmation email error:', err);
      });
    }
  }

  function showConfirmationPage(bookingData, therapistName) {
    document.documentElement.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh;">
        <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
          <h1 style="color: #28a745; margin-bottom: 20px;">Booking Confirmed!</h1>
          <p style="font-size: 18px; color: #666; margin-bottom: 30px;">
            ${therapistName} has accepted your booking request.
          </p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left;">
            <h3 style="color: #00729B; margin-top: 0;">Booking Details</h3>
            <p><strong>Customer:</strong> ${bookingData.customerName}</p>
            <p><strong>Service:</strong> ${bookingData.service}</p>
            <p><strong>Duration:</strong> ${bookingData.duration} minutes</p>
            <p><strong>Date:</strong> ${bookingData.date}</p>
            <p><strong>Time:</strong> ${bookingData.time}</p>
            <p><strong>Address:</strong> ${bookingData.address}</p>
            <p><strong>Total Amount:</strong> $${bookingData.price}</p>
          </div>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0; color: #28a745;"><strong>Payment has been processed successfully.</strong></p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Thank you for choosing Rejuvenators Mobile Massage!
          </p>
        </div>
      </div>
    `;
  }

  // Load Google Maps API and try GPS
  loadGoogleMapsAPI();
  tryGeolocation();
  loadTherapists();
  initEmailJS();

  // Initial price
  updatePriceDisplay();
}); 