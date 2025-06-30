// Rejuvenators Booking System v12 - Fixed Timer and Messaging

// --- at top of your script, alongside other globals ---
let therapistTimeout = null;
let timeRemaining   = 120;
let bookingAccepted = false;

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
    
    // Surcharges - only apply one: either weekend OR after-hours
    const dateValue = document.getElementById('date').value;
    const timeValue = document.getElementById('time').value;
    
    if (dateValue && timeValue) {
      const dt = new Date(dateValue + 'T' + timeValue);
      const isWeekend = [0,6].includes(dt.getDay()); // Sunday = 0, Saturday = 6
      const hr = dt.getHours();
      const isAfterHours = hr >= 18 || hr < 9; // 6pm-9am
      
      // Apply surcharge only if it's weekend OR after-hours (not both)
      if (isWeekend || isAfterHours) {
        price *= 1.2; // 20% surcharge
      }
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
  const step6Observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const step6 = document.getElementById('step6');
        if (step6 && step6.classList.contains('active')) {
          loadTherapistSelection();
        }
      }
    });
  });
  
  step6Observer.observe(document.getElementById('step6'), {
    attributes: true,
    attributeFilter: ['class']
  });

  function loadTherapistSelection() {
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
      
      // Enable the request button
      document.getElementById('requestBtn').disabled = false;
    }
  }

  // Request Booking button handler
  document.getElementById('requestBtn').onclick = function() {
    // Ensure we have the selected therapist
    const therapistSelect = document.getElementById('therapistSelect');
    if (therapistSelect) {
      selectedTherapist = JSON.parse(therapistSelect.value);
    }
    
    if (selectedTherapist) {
      // Reorder availableTherapists to put the selected therapist first
      const otherTherapists = availableTherapists.filter(t => t.name !== selectedTherapist.name);
      availableTherapists = [selectedTherapist, ...otherTherapists];
      
      // Navigate to payment step
      show('step7');
    } else {
      alert('Please select a therapist first.');
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
      <p><strong>Therapist:</strong> ${selectedTherapist ? selectedTherapist.name : 'TBD'}</p>
      <p><strong>Total Price: $${price}</strong></p>
    `;

    // Initialize Stripe
    if (typeof Stripe !== 'undefined') {
      stripe = Stripe('pk_test_51PGxKUKn3GaB6FyY1qeTOeYxWnBMDax8bUZhdP7RggDi1OyUp4BbSJWPhgb7hcvDynNqakuSfpGzwfuVhOsTvXmb001lwoCn7a');
      const elements = stripe.elements();
      card = elements.create('card', {
        hidePostalCode: true
      });
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
  let bookingId = null; // Unique booking ID

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
        // Store payment method ID for later use
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
    // Check if already accepted before starting
    const alreadyAccepted = sessionStorage.getItem('bookingAccepted') === 'true';
    if (alreadyAccepted) {
      console.log('❌ Booking already accepted - not starting new request');
      return;
    }
    
    if (bookingAccepted) return;
    
    // Generate unique booking ID
    bookingId = 'booking_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Clear any previous acceptance data
    sessionStorage.removeItem('bookingAccepted');
    sessionStorage.removeItem('acceptedTherapist');
    sessionStorage.removeItem('acceptedBookingData');
    sessionStorage.removeItem('acceptedBookingId');
    
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
    
    // Update UI based on whether this is the selected therapist or a fallback
    if (currentTherapistIndex === 0) {
      document.getElementById('requestMsg').innerText = `Sending request to ${therapist.name} (your selected therapist)...`;
    } else {
      document.getElementById('requestMsg').innerText = `${selectedTherapist.name} was not available at your requested date and time. We are now looking to find a replacement therapist...`;
    }
    
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
      bookerName: document.getElementById('bookerName').value,
      price: calculatePrice()
    };

    // Calculate therapist fees based on hourly rates
    const durationHours = parseInt(bookingData.duration) / 60;
    const bookingDateTime = new Date(`${bookingData.date}T${bookingData.time}`);
    const hour = bookingDateTime.getHours();
    const isWeekend = [0, 6].includes(bookingDateTime.getDay()); // Sunday = 0, Saturday = 6
    
    // Normal hours: Monday-Friday 9am-6pm
    const isNormalHours = !isWeekend && hour >= 9 && hour < 18;
    const hourlyRate = isNormalHours ? 90 : 105;
    const therapistFees = (durationHours * hourlyRate).toFixed(2);

    const acceptUrl = `${window.location.origin}${window.location.pathname}?action=accept&therapist=${encodeURIComponent(therapist.name)}&booking=${encodeURIComponent(JSON.stringify(bookingData))}&bookingId=${bookingId}`;
    const declineUrl = `${window.location.origin}${window.location.pathname}?action=decline&therapist=${encodeURIComponent(therapist.name)}&booking=${encodeURIComponent(JSON.stringify(bookingData))}&bookingId=${bookingId}`;

    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 15px;">
        <div style="background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00729B; margin-bottom: 10px;">🎉 NEW BOOKING REQUEST</h1>
            <p style="color: #666; font-size: 18px;">You have a new client waiting for you!</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00729B;">
            <h3 style="color: #00729B; margin-top: 0; text-align: left;">📋 Booking Details</h3>
            <p style="text-align: left;"><strong>👤 Customer:</strong> ${bookingData.customerName}</p>
            <p style="text-align: left;"><strong>📧 Email:</strong> ${bookingData.customerEmail}</p>
            <p style="text-align: left;"><strong>📞 Phone:</strong> ${bookingData.customerPhone}</p>
            <p style="text-align: left;"><strong>📍 Address:</strong> ${bookingData.address}</p>
            <p style="text-align: left;"><strong>💆‍♀️ Service:</strong> ${bookingData.service}</p>
            <p style="text-align: left;"><strong>⏱️ Duration:</strong> ${bookingData.duration} minutes</p>
            <p style="text-align: left;"><strong>📅 Date:</strong> ${bookingData.date}</p>
            <p style="text-align: left;"><strong>🕐 Time:</strong> ${bookingData.time}</p>
            <p style="text-align: left;"><strong>🏠 Room:</strong> ${bookingData.roomNumber || 'N/A'}</p>
            <p style="text-align: left;"><strong>📝 Booked By:</strong> ${bookingData.bookerName || 'N/A'}</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #28a745; margin-top: 0; text-align: left;">💰 Your Fees</h3>
            <p style="text-align: left;"><strong>⏱️ Duration:</strong> ${bookingData.duration} minutes (${durationHours.toFixed(2)} hours)</p>
            <p style="text-align: left;"><strong>💵 Hourly Rate:</strong> $${hourlyRate}/hour ${isNormalHours ? '(Normal Hours)' : '(Premium Hours)'}</p>
            <p style="text-align: left;"><strong>💳 Your Earnings:</strong> $${therapistFees}</p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404; text-align: left;"><strong>⏰ Please respond within 120 seconds to secure this booking!</strong></p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <div style="display: block; margin-bottom: 15px;">
              <a href="${acceptUrl}" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; margin: 5px;">✅ ACCEPT BOOKING</a>
            </div>
            <div style="display: block;">
              <a href="${declineUrl}" style="background: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; margin: 5px;">❌ DECLINE</a>
            </div>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
            Thank you for being part of the Rejuvenators team! 💙
          </p>
        </div>
      </div>
    `;

    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: therapist.name,
        to_email: 'aishizhengjing@gmail.com', // Replace with therapist.email in production
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
    const customerEmail = document.getElementById('customerEmail').value;
    const customerName = document.getElementById('customerName').value;
    
    if (!customerEmail || !customerName) {
      console.error('Customer email or name not found');
      return;
    }
    
    const bookingData = {
      customerName: customerName,
      customerEmail: customerEmail,
      customerPhone: document.getElementById('customerPhone').value,
      address: document.getElementById('address').value,
      service: document.getElementById('service').value,
      duration: document.getElementById('duration').value,
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      parking: document.getElementById('parking').value,
      roomNumber: document.getElementById('roomNumber').value,
      price: calculatePrice()
    };

    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 15px;">
        <div style="background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00729B; margin-bottom: 10px;">📧 Booking Request Received</h1>
            <p style="color: #666; font-size: 18px;">Hi ${bookingData.customerName}, we've got your request!</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #28a745; margin-top: 0; text-align: left;">✅ What happens next?</h3>
            <p style="margin: 0; color: #28a745; text-align: left;">We're now contacting available therapists in your area. You'll receive a confirmation email once a therapist accepts your booking.</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00729B;">
            <h3 style="color: #00729B; margin-top: 0; text-align: left;">📋 Your Booking Details</h3>
            <p style="text-align: left;"><strong>💆‍♀️ Service:</strong> ${bookingData.service}</p>
            <p style="text-align: left;"><strong>⏱️ Duration:</strong> ${bookingData.duration} minutes</p>
            <p style="text-align: left;"><strong>📅 Date:</strong> ${bookingData.date}</p>
            <p style="text-align: left;"><strong>🕐 Time:</strong> ${bookingData.time}</p>
            <p style="text-align: left;"><strong>📍 Address:</strong> ${bookingData.address}</p>
            <p style="text-align: left;"><strong>🏠 Room:</strong> ${bookingData.roomNumber || 'N/A'}</p>
            <p style="text-align: left;"><strong>💰 Total Price:</strong> $${bookingData.price}</p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404; text-align: left;"><strong>💳 Your payment will only be processed once a therapist accepts your booking.</strong></p>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
            Thank you for choosing Rejuvenators Mobile Massage! We'll be in touch soon. 💙
          </p>
        </div>
      </div>
    `;

    if (typeof emailjs !== 'undefined') {
      console.log('Sending acknowledgment email to:', customerEmail);
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: bookingData.customerName,
        to_email: customerEmail,
        subject: 'Booking Request Received',
        message_html: emailHTML,
        html_message: emailHTML,
        html_content: emailHTML
      }, 'V8qq2pjH8vfh3a6q3').then(res => {
        console.log('Customer acknowledgment email sent successfully:', res);
      }).catch(err => {
        console.error('Customer acknowledgment email error:', err);
      });
    } else {
      console.error('EmailJS not available');
    }
  }

  function startCountdown() {
    // ensure no double interval
    if (therapistTimeout) clearInterval(therapistTimeout);
    bookingAccepted = false;
    timeRemaining = 120;
    document.getElementById('timeRemaining').textContent = `${timeRemaining}s`;

    therapistTimeout = setInterval(() => {
      if (bookingAccepted) {
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        return;
      }
      timeRemaining--;
      document.getElementById('timeRemaining').textContent = `${timeRemaining}s`;
      if (timeRemaining <= 0) {
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        onTherapistTimeout();
      }
    }, 1000);
  }

  function onTherapistTimeout() {
    // called when no response in 120s
    currentTherapistIndex++;
    if (currentTherapistIndex < availableTherapists.length) {
      sendRequestToCurrentTherapist();
    } else {
      document.getElementById('requestMsg').innerText =
        'No therapists responded. Payment will be refunded.';
    }
  }

  // Cross-tab coordination using storage events
  window.addEventListener('storage', (e) => {
    if (e.key === 'bookingAccepted' && e.newValue === 'true') {
      console.log('📢 Detected bookingAccepted in another tab');
      bookingAccepted = true;
      
      if (therapistTimeout) {
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        console.log('✅ Timer cleared via storage event');
      }

      // Show confirmation in the original tab
      const therapist = sessionStorage.getItem('acceptedTherapist');
      const bookingData = sessionStorage.getItem('acceptedBookingData');
      const acceptedBookingId = sessionStorage.getItem('acceptedBookingId');
      
      if (therapist && bookingData && acceptedBookingId === bookingId) {
        const parsedBookingData = JSON.parse(decodeURIComponent(bookingData));
        showConfirmationPage(parsedBookingData, therapist);
      }
    }
  });

  // Handle therapist response from URL
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  const therapistName = urlParams.get('therapist');
  const bookingData = urlParams.get('booking');
  const receivedBookingId = urlParams.get('bookingId');
  
  if (action && therapistName && bookingData && receivedBookingId) {
    if (action === 'accept') {
      // Check if this specific booking was already accepted
      const alreadyAccepted = sessionStorage.getItem('bookingAccepted') === 'true';
      const acceptedBookingId = sessionStorage.getItem('acceptedBookingId');
      
      console.log('=== ACCEPT CLICKED ===');
      console.log('alreadyAccepted:', alreadyAccepted);
      console.log('acceptedBookingId:', acceptedBookingId);
      console.log('receivedBookingId:', receivedBookingId);
      console.log('therapistName:', therapistName);
      
      if (alreadyAccepted && acceptedBookingId === receivedBookingId) {
        console.log('❌ This specific booking already accepted - showing error page');
        // Show "Already booked" message
        document.documentElement.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
              <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
              <h1 style="color: #ffc107; margin-bottom: 20px;">Booking Already Accepted</h1>
              <p style="font-size: 18px; color: #666; margin-bottom: 30px;">
                This booking has already been accepted by another therapist.
              </p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Thank you for your interest!
              </p>
            </div>
          </div>
        `;
        return;
      }
      
      console.log('✅ Processing acceptance for:', therapistName);
      
      // Process acceptance
      bookingAccepted = true;
      
      // Stop any running timer immediately
      if (therapistTimeout) {
        clearInterval(therapistTimeout);
        therapistTimeout = null;
        console.log('⏹️ Timer stopped on accept');
      }
      
      // Mark as accepted with booking ID
      sessionStorage.setItem('bookingAccepted', 'true');
      sessionStorage.setItem('acceptedTherapist', therapistName);
      sessionStorage.setItem('acceptedBookingData', bookingData);
      sessionStorage.setItem('acceptedBookingId', receivedBookingId);

      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Send confirmation emails and show confirmation page
      const parsedBookingData = JSON.parse(decodeURIComponent(bookingData));
      sendCustomerConfirmationEmail(parsedBookingData, therapistName);
      sendTherapistConfirmationEmail(parsedBookingData, therapistName);
      showConfirmationPage(parsedBookingData, therapistName);
      
    } else if (action === 'decline') {
      // Clean up the URL first
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Send decline notification to customer if this was their selected therapist
      const parsedBookingData = JSON.parse(decodeURIComponent(bookingData));
      if (currentTherapistIndex === 0) {
        sendCustomerDeclineEmail(parsedBookingData, therapistName);
      }
      
      // Move to next therapist
      currentTherapistIndex++;
      if (currentTherapistIndex < availableTherapists.length) {
        sendRequestToCurrentTherapist();
      } else {
        document.getElementById('requestMsg').innerText = 'All therapists declined. Your payment will be refunded.';
      }
    }
  }

  function sendCustomerDeclineEmail(bookingData, therapistName) {
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 15px;">
        <div style="background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00729B; margin-bottom: 10px;">📅 Finding Alternative Therapist</h1>
            <p style="color: #666; font-size: 18px;">Hi ${bookingData.customerName}, we have an update on your booking.</p>
          </div>
          
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404; text-align: left;">
              ${therapistName} was not available at your requested date and time. 
              <strong>We are now looking to find a replacement therapist.</strong>
            </p>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #28a745; margin-top: 0; text-align: left;">✅ What we're doing now:</h3>
            <p style="margin: 0; color: #155724; text-align: left;">
              • Contacting other qualified therapists in your area<br>
              • Maintaining your preferred time slot<br>
              • Ensuring the same quality service
            </p>
          </div>
          
          <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #155724; text-align: center;">
              <strong>Once we have a confirmed therapist available, we will let you know immediately.</strong>
            </p>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
            Thank you for your patience. We're working hard to find you the perfect therapist! 💙
          </p>
        </div>
      </div>
    `;

    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: bookingData.customerName,
        to_email: bookingData.customerEmail,
        subject: 'Update: Finding Alternative Therapist',
        message_html: emailHTML,
        html_message: emailHTML,
        html_content: emailHTML
      }, 'V8qq2pjH8vfh3a6q3').then(res => {
        console.log('Customer decline notification sent:', res);
      }).catch(err => {
        console.error('Customer decline email error:', err);
      });
    }
  }

  function sendCustomerConfirmationEmail(bookingData, therapistName) {
    const customerEmail = bookingData.customerEmail;
    const customerName = bookingData.customerName;
    
    if (!customerEmail || !customerName) {
      console.error('Customer email or name missing in confirmation email');
      return;
    }
    
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 15px;">
        <div style="background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #28a745; margin-bottom: 10px;">✅ Booking Confirmed!</h1>
            <p style="color: #666; font-size: 18px;">Hi ${customerName}, great news!</p>
          </div>
            <p style="margin: 0; color: #856404; text-align: left;">
              <strong>📞 ${therapistName} will contact you before your appointment to confirm details.</strong>
            </p>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
            Thank you for choosing Rejuvenators Mobile Massage! 💙
          </p>
        </div>
      </div>
    `;

    if (typeof emailjs !== 'undefined') {
      console.log('Sending confirmation email to:', customerEmail);
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: customerName,
        to_email: customerEmail,
        subject: 'Booking Confirmed - ' + therapistName,
        message_html: emailHTML,
        html_message: emailHTML,
        html_content: emailHTML
      }, 'V8qq2pjH8vfh3a6q3').then(res => {
        console.log('Customer confirmation email sent successfully:', res);
      }).catch(err => {
        console.error('Customer confirmation email error:', err);
      });
    } else {
      console.error('EmailJS not available for confirmation email');
    }
  }

  function sendTherapistConfirmationEmail(bookingData, therapistName) {
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 15px;">
        <div style="background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #28a745; margin-bottom: 10px;">✅ Booking Accepted Successfully!</h1>
            <p style="color: #666; font-size: 18px;">Thank you for accepting this booking!</p>
          </div>
          
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0; color: #155724; text-align: left;">
              You have successfully accepted the booking. The customer has been notified.
            </p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00729B;">
            <h3 style="color: #00729B; margin-top: 0; text-align: left;">📋 Booking Details</h3>
            <p style="text-align: left;"><strong>👤 Customer:</strong> ${bookingData.customerName}</p>
            <p style="text-align: left;"><strong>📧 Email:</strong> ${bookingData.customerEmail}</p>
            <p style="text-align: left;"><strong>📞 Phone:</strong> ${bookingData.customerPhone}</p>
            <p style="text-align: left;"><strong>📍 Address:</strong> ${bookingData.address}</p>
            <p style="text-align: left;"><strong>💆‍♀️ Service:</strong> ${bookingData.service}</p>
            <p style="text-align: left;"><strong>⏱️ Duration:</strong> ${bookingData.duration} minutes</p>
            <p style="text-align: left;"><strong>📅 Date:</strong> ${bookingData.date}</p>
            <p style="text-align: left;"><strong>🕐 Time:</strong> ${bookingData.time}</p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404; text-align: left;">
              <strong>📞 Please contact the customer before the appointment to confirm any specific requirements.</strong>
            </p>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
            Thank you for being part of the Rejuvenators team! 💙
          </p>
        </div>
      </div>
    `;

    if (typeof emailjs !== 'undefined') {
      emailjs.send('service_puww2kb', 'template_zh8jess', {
        to_name: therapistName,
        to_email: 'aishizhengjing@gmail.com', // Replace with actual therapist email
        subject: 'Booking Confirmation - ' + bookingData.customerName,
        message_html: emailHTML,
        html_message: emailHTML,
        html_content: emailHTML
      }, 'V8qq2pjH8vfh3a6q3').then(res => {
        console.log('Therapist confirmation email sent:', res);
      }).catch(err => {
        console.error('Therapist confirmation email error:', err);
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
            <p><strong>Therapist:</strong> ${therapistName}</p>
            <p><strong>Total Amount:</strong> ${bookingData.price}</p>
          </div>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0; color: #28a745;"><strong>Payment has been processed successfully.</strong></p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            ${therapistName} will contact you before your appointment to confirm details.<br><br>
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
  
  // Debug functions for testing
  window.debugAcceptance = function() {
    console.log('=== DEBUG INFO ===');
    console.log('bookingAccepted:', bookingAccepted);
    console.log('therapistTimeout:', therapistTimeout);
    console.log('sessionStorage bookingAccepted:', sessionStorage.getItem('bookingAccepted'));
    console.log('sessionStorage acceptedBookingId:', sessionStorage.getItem('acceptedBookingId'));
    console.log('sessionStorage acceptedTherapist:', sessionStorage.getItem('acceptedTherapist'));
    console.log('current bookingId:', bookingId);
    console.log('Customer email:', document.getElementById('customerEmail')?.value);
    console.log('Customer name:', document.getElementById('customerName')?.value);
    console.log('currentTherapistIndex:', currentTherapistIndex);
    console.log('availableTherapists:', availableTherapists);
    console.log('timeRemaining:', timeRemaining);
    
    // Show alert with key info
    alert(`Debug Info:
Booking Accepted: ${bookingAccepted}
Timer Running: ${therapistTimeout ? 'Yes' : 'No'}
Time Remaining: ${timeRemaining}`);
  };
  
  window.forceAccept = function() {
    console.log('Force accepting booking...');
    bookingAccepted = true;
    sessionStorage.setItem('bookingAccepted', 'true');
    sessionStorage.setItem('acceptedBookingId', bookingId || 'test_booking');
    sessionStorage.setItem('acceptedTherapist', 'Test Therapist');
    sessionStorage.setItem('acceptedBookingData', JSON.stringify({
      customerName: 'Test Customer',
      service: 'Test Service',
      duration: '60',
      date: '2024-01-01',
      time: '10:00',
      address: 'Test Address',
      price: '159.00'
    }));
    
    if (therapistTimeout) {
      clearInterval(therapistTimeout);
      therapistTimeout = null;
      console.log('Timer cleared by force accept');
    }
    
    // Show confirmation page
    showConfirmationPage({
      customerName: 'Test Customer',
      service: 'Test Service',
      duration: '60',
      date: '2024-01-01',
      time: '10:00',
      address: 'Test Address',
      price: '159.00'
    }, 'Test Therapist');
    
    console.log('Booking force accepted and confirmation shown');
    alert('Booking force accepted! Check the confirmation page.');
  };
  
  window.clearTimer = function() {
    console.log('Clearing timer manually...');
    if (therapistTimeout) {
      clearInterval(therapistTimeout);
      therapistTimeout = null;
      console.log('✅ Timer cleared manually');
      alert('✅ Timer cleared successfully!');
    } else {
      console.log('❌ No timer running');
      alert('❌ No timer running');
    }
  };
  
  window.clearSession = function() {
    console.log('Clearing session storage...');
    sessionStorage.clear();
    console.log('✅ Session storage cleared');
    alert('✅ Session storage cleared!');
  };
  
  window.resetBooking = function() {
    console.log('Resetting booking state...');
    bookingAccepted = false;
    currentTherapistIndex = 0;
    timeRemaining = 120;
    if (therapistTimeout) {
      clearInterval(therapistTimeout);
      therapistTimeout = null;
    }
    sessionStorage.clear();
    console.log('✅ Booking state reset');
    alert('✅ Booking state reset!');
  };
  
  window.testAcceptance = function() {
    console.log('Testing acceptance detection...');
    const url = window.location.href;
    const testUrl = url + (url.includes('?') ? '&' : '?') + 'action=accept&therapist=TestTherapist&booking=' + encodeURIComponent(JSON.stringify({test: true})) + '&bookingId=test123';
    console.log('Test URL:', testUrl);
    alert('Test URL created. Copy this and open in a new tab to test acceptance:\n\n' + testUrl);
  };
  
  // Add test buttons to the page for debugging
  setTimeout(() => {
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background: white; padding: 10px; border: 1px solid #ccc; border-radius: 5px; font-size: 12px; max-width: 200px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);';
    debugDiv.innerHTML = `
      <div style="margin-bottom: 5px;"><strong>Debug Tools:</strong></div>
      <button onclick="debugAcceptance()" style="margin: 2px; padding: 5px; font-size: 11px; width: 100%;">Debug Info</button>
      <button onclick="forceAccept()" style="margin: 2px; padding: 5px; font-size: 11px; width: 100%;">Force Accept</button>
      <button onclick="clearTimer()" style="margin: 2px; padding: 5px; font-size: 11px; width: 100%;">Clear Timer</button>
      <button onclick="clearSession()" style="margin: 2px; padding: 5px; font-size: 11px; width: 100%;">Clear Session</button>
      <button onclick="resetBooking()" style="margin: 2px; padding: 5px; font-size: 11px; width: 100%;">Reset Booking</button>
      <button onclick="testAcceptance()" style="margin: 2px; padding: 5px; font-size: 11px; width: 100%;">Test Accept URL</button>
    `;
    document.body.appendChild(debugDiv);
  }, 2000);

  // Handle acceptance URL callback
  (function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'accept' && params.get('bookingId') === bookingId) {
      bookingAccepted = true;
      if (therapistTimeout) {
        clearInterval(therapistTimeout);
        therapistTimeout = null;
      }
      const data = JSON.parse(decodeURIComponent(params.get('booking')));
      showConfirmationPage(data, params.get('therapist'));
    }
  })();
});

