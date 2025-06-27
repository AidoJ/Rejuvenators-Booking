// Autocomplete initialization
let autocomplete, current='step1', currentLat, currentLon, selectedTherapistInfo;

// Global variables for therapist management
let availableTherapists = [];
let currentTherapistIndex = 0;
let therapistTimeout = null;
let timeRemaining = 120; // 120 seconds for testing
let bookingAccepted = false; // Flag to prevent sending emails to other therapists

// Load Google API key securely and initialize Maps
async function loadGoogleMapsAPI() {
  try {
    // Try to load from secure endpoint first
    const response = await fetch('/api/google-key');
    const data = await response.json();
    
    if (data.apiKey) {
      // Load Google Maps API with the secure key
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=places&callback=initAutocomplete`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      console.log('Google Maps API loaded securely from server');
    } else {
      console.error('Failed to load Google API key from server');
      loadGoogleMapsAPIFallback();
    }
  } catch (error) {
    console.log('Secure endpoint not available, using fallback method');
    loadGoogleMapsAPIFallback();
  }
}

// Fallback method for when secure server is not available
function loadGoogleMapsAPIFallback() {
  // For development/testing, you can temporarily use the API key directly
  // In production, this should be replaced with proper server-side handling
  const apiKey = 'AIzaSyBo632bfwdyKtue_-wkAms0Ac2mMRVnTWg'; // Your API key
  
  if (apiKey && apiKey !== 'your_google_api_key_here') {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAutocomplete`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    console.log('Google Maps API loaded with fallback method');
  } else {
    console.error('No valid Google API key available');
    // Show error message to user
    const addressInput = document.getElementById('address');
    if (addressInput) {
      addressInput.placeholder = 'Address autocomplete not available - please enter address manually';
      addressInput.style.backgroundColor = '#fff3cd';
    }
  }
}

// Initialize EmailJS
function initEmailJS() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init('V8qq2pjH8vfh3a6q3');
    console.log('EmailJS v3 initialized successfully');
  } else {
    console.log('EmailJS not loaded');
  }
}

function initAutocomplete() {
  console.log('Initializing Google Places Autocomplete...');
  
  const addressInput = document.getElementById('address');
  if (!addressInput) {
    console.error('Address input element not found');
    return;
  }
  
  if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
    console.error('Google Maps API not loaded properly');
    return;
  }
  
  try {
    autocomplete = new google.maps.places.Autocomplete(
      addressInput, 
      { componentRestrictions: { country: 'au' } }
    );
    
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      console.log('Place selected:', place);
      
      if (place.geometry && place.geometry.location) {
        currentLat = place.geometry.location.lat();
        currentLon = place.geometry.location.lng();
        console.log('Coordinates set:', currentLat, currentLon);
      } else {
        console.error('No geometry found for selected place');
      }
    });
    
    console.log('Google Places Autocomplete initialized successfully');
  } catch (error) {
    console.error('Error initializing autocomplete:', error);
  }
}
window.initAutocomplete = initAutocomplete;

// Navigation
function show(step) {
  document.querySelectorAll('.step').forEach(s=>s.classList.remove('active'));
  document.getElementById(step).classList.add('active');
  current=step;
}
document.querySelectorAll('.next').forEach(b=>b.onclick=()=>show(b.dataset.next));
document.querySelectorAll('.prev').forEach(b=>b.onclick=()=>show(b.dataset.prev));

// Price display update
function updatePriceDisplay() {
  const priceElement = document.getElementById('priceAmount');
  if (priceElement) {
    const price = calculatePrice();
    priceElement.textContent = price;
  }
}

// Add event listeners for price updates
document.addEventListener('DOMContentLoaded', function() {
  // Load Google Maps API securely
  loadGoogleMapsAPI();
  
  // Initialize EmailJS
  initEmailJS();
  
  // Set up manual address input fallback
  const addressInput = document.getElementById('address');
  if (addressInput) {
    // Add manual input handling for when autocomplete fails
    addressInput.addEventListener('input', function() {
      // If user types manually, we can still use the address
      // The coordinates will be set to a default location for distance calculation
      if (this.value.length > 10) {
        // Set default coordinates for Brisbane CBD if no coordinates available
        if (!currentLat || !currentLon) {
          currentLat = -27.4698; // Brisbane CBD latitude
          currentLon = 153.0251; // Brisbane CBD longitude
          console.log('Using default coordinates for distance calculation');
        }
      }
    });
  }
  
  const durationSelect = document.getElementById('duration');
  const parkingSelect = document.getElementById('parking');
  const dateInput = document.getElementById('date');
  const timeSelect = document.getElementById('time');
  
  if (durationSelect) {
    durationSelect.addEventListener('change', updatePriceDisplay);
  }
  if (parkingSelect) {
    parkingSelect.addEventListener('change', updatePriceDisplay);
  }
  if (dateInput) {
    dateInput.addEventListener('change', updatePriceDisplay);
  }
  if (timeSelect) {
    timeSelect.addEventListener('change', updatePriceDisplay);
  }
  
  // Initial price calculation
  updatePriceDisplay();
  
  // Handle URL parameters for accept/decline functionality
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('a') || urlParams.get('action'); // Support both old and new format
  const therapistName = urlParams.get('t') || urlParams.get('therapist'); // Support both old and new format
  const bookingData = urlParams.get('b') || urlParams.get('booking'); // Support both old and new format
  
  if (action && bookingData && therapistName) {
    try {
      const booking = JSON.parse(decodeURIComponent(bookingData));
      
      // Convert compact format to full format for compatibility
      const fullBooking = {
        customerName: booking.customerName || booking.n,
        customerEmail: booking.customerEmail || booking.e,
        customerPhone: booking.customerPhone || booking.p,
        address: booking.address || booking.a,
        service: booking.service || booking.s,
        duration: booking.duration || booking.d,
        date: booking.date || booking.dt,
        time: booking.time || booking.tm,
        parking: booking.parking || booking.pk,
        price: booking.price || booking.pr,
        therapistName: booking.therapistName || booking.tn
      };
      
      if (action === 'accept') {
        sessionStorage.setItem('bookingAccepted', 'true');
        stopTherapistAssignment('Therapist accepted.');
        sendAdminNotification(fullBooking, therapistName);
        showSimpleConfirmation(therapistName, fullBooking);
      } else if (action === 'decline') {
        document.getElementById('requestMsg').innerText = `${therapistName} declined. Trying next therapist...`;
        show('step7');
        stopTherapistAssignment('Therapist declined.');
        setTimeout(() => {
          currentTherapistIndex++;
          timeRemaining = 120;
          sendRequestToCurrentTherapist();
        }, 2000);
      }
    } catch (e) {
      console.error('Error parsing booking data:', e);
    }
  }
  
  // After datetime step to fetch therapists
  const nextToStep5Btn = document.querySelector('.next[data-next="step5"]');
  if (nextToStep5Btn) {
    nextToStep5Btn.onclick = () => {
      fetch('mock-api/therapists.json').then(r=>r.json()).then(data=>{
        const selDiv=document.getElementById('therapistSelection');
        availableTherapists = [];
        
        data.forEach(t=>{
          const d = distance(currentLat, currentLon, t.lat, t.lon);
          if(d<=10 && t.available) {
            availableTherapists.push({...t, distance: d});
          }
        });
        
        if (availableTherapists.length === 0) {
          selDiv.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Unfortunately we\'re don\'t have any therapists available in your area right now.</p>';
          // Disable the request button
          const requestBtn = document.getElementById('requestBtn');
          if (requestBtn) {
            requestBtn.disabled = true;
            requestBtn.style.opacity = '0.5';
            requestBtn.textContent = 'No Therapists Available';
          }
        } else {
          // Sort by distance
          availableTherapists.sort((a, b) => a.distance - b.distance);
          
          selDiv.innerHTML='<select id="therapistSelect"></select>';
          const sel=document.getElementById('therapistSelect');
          availableTherapists.forEach(t=>{
            let opt=document.createElement('option');
            opt.value=JSON.stringify(t);
            opt.text=`${t.name} (${t.distance.toFixed(1)} mi)`;
            sel.append(opt);
          });
          // Default to first therapist
          selectedTherapistInfo = availableTherapists[0];
          sel.onchange = function() {
            selectedTherapistInfo = JSON.parse(this.value);
          };
          // Re-enable the request button
          const requestBtn = document.getElementById('requestBtn');
          if (requestBtn) {
            requestBtn.disabled = false;
            requestBtn.style.opacity = '1';
            requestBtn.textContent = 'Request Booking';
          }
        }
        show('step5');
      });
    };
  }
  
  // When user clicks Request Booking, use the selected therapist
  const requestBtn = document.getElementById('requestBtn');
  if (requestBtn) {
    requestBtn.onclick = () => {
      if (selectedTherapistInfo) {
        availableTherapists = [selectedTherapistInfo];
      }
      startTherapistAssignment();
    };
  }
  
  // Step6 summary and stripe setup - this should trigger when entering step 6
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const step6 = document.getElementById('step6');
        if (step6 && step6.classList.contains('active')) {
          // Step 6 is now active, update summary and setup Stripe
          const summary = document.getElementById('summary');
          const price = calculatePrice();
          const customerName = document.getElementById('customerName').value;
          const customerEmail = document.getElementById('customerEmail').value;
          const customerPhone = document.getElementById('customerPhone').value;
          const address = document.getElementById('address').value;
          
          summary.innerHTML = `
            <h3>Booking Summary</h3>
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Phone:</strong> ${customerPhone}</p>
            <p><strong>Address For Massage:</strong> ${address}</p>
            <p><strong>Service:</strong> ${document.getElementById('service').value}</p>
            <p><strong>Duration:</strong> ${document.getElementById('duration').value} min</p>
            <p><strong>Date:</strong> ${document.getElementById('date').value}</p>
            <p><strong>Time:</strong> ${document.getElementById('time').value}</p>
            <p><strong>Total Price: $${price}</strong></p>
          `;
          
          // Initialize Stripe
          if (typeof Stripe !== 'undefined') {
            const stripe = Stripe('pk_test_12345');
            const elements = stripe.elements();
            const card = elements.create('card');
            document.getElementById('card-element').innerHTML = ''; 
            card.mount('#card-element');
            
            // Enable submit button when card details are complete
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
      }
    });
  });
  
  // Start observing
  observer.observe(document.getElementById('step6'), {
    attributes: true,
    attributeFilter: ['class']
  });
  
  // Debug button (temporary)
  const debugBtn = document.getElementById('debugBtn');
  if (debugBtn) {
    debugBtn.onclick = () => {
      console.log('Debug button clicked');
      console.log('Available therapists:', availableTherapists);
      console.log('Current therapist index:', currentTherapistIndex);
      
      // Simulate some test data if no therapists available
      if (availableTherapists.length === 0) {
        console.log('No therapists available, creating test data...');
        availableTherapists = [
          { name: 'Test Therapist 1', distance: 2.5, lat: -33.8688, lon: 151.2093 },
          { name: 'Test Therapist 2', distance: 5.1, lat: -33.8688, lon: 151.2093 }
        ];
      }
      
      // Test the therapist assignment process
      startTherapistAssignment();
    };
  }
});

// Haversine distance
function distance(lat1,lon1,lat2,lon2){
  const R=3958.8, rLat1=lat1*Math.PI/180, rLat2=lat2*Math.PI/180;
  const dLat=rLat2-rLat1, dLon=(lon2-lon1)*Math.PI/180;
  return 2*R*Math.asin(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(rLat1)*Math.cos(rLat2)*Math.sin(dLon/2)**2));
}

// Booking request simulate - now just proceeds to payment
// REMOVED - no longer needed since we go directly to payment

// Accept/Decline simulation - these are now handled by URL parameters
document.getElementById('acceptBtn').onclick=()=>{
  show('step7');
};
document.getElementById('declineBtn').onclick=()=>{
  document.getElementById('finalMsg').innerText='Booking Request Declined';
  show('step8');
};

// Price calculation
function calculatePrice(){
  const base=159, dur=parseInt(document.getElementById('duration').value);
  let price=base+((dur-60)/15)*35;
  let breakdown = [`Base: $${base}`];
  
  if (dur > 60) {
    const durationSurcharge = ((dur-60)/15)*35;
    breakdown.push(`Duration (${dur}min): +$${durationSurcharge.toFixed(2)}`);
  }
  
  // Only apply date/time surcharges if date and time are selected
  const dateValue = document.getElementById('date').value;
  const timeValue = document.getElementById('time').value;
  
  if (dateValue && timeValue) {
    const dt=new Date(dateValue+'T'+timeValue);
    if([0,6].includes(dt.getDay())) {
      price*=1.2; // Weekend surcharge
      breakdown.push('Weekend: +20%');
    }
    const hr=dt.getHours();
    if(hr>=16&&hr<21) {
      price*=1.2; // Peak hours (4-9 PM)
      breakdown.push('Peak hours: +20%');
    }
    if(hr>=21||hr<9) {
      price*=1.3; // Late night/early morning (9 PM-9 AM)
      breakdown.push('Late night: +30%');
    }
  }
  
  if(document.getElementById('parking').value!=='free') {
    price+=20;
    breakdown.push('Parking: +$20');
  }
  
  // Update breakdown display
  const breakdownElement = document.getElementById('priceBreakdown');
  if (breakdownElement) {
    breakdownElement.innerHTML = breakdown.join('<br>');
  }
  
  return price.toFixed(2);
}

// Payment and booking request - collect payment details without charging
document.getElementById('payBtn').onclick=()=>{
  if (typeof Stripe !== 'undefined') {
    const stripe=Stripe('pk_test_12345');
    const cardElement = document.querySelector('#card-element .StripeElement');
    if (cardElement) {
      // Create payment method instead of charging
      stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      }).then(result => {
        if(result.error) {
          alert(result.error.message);
          return;
        }
        // Store payment method ID for later use
        window.paymentMethodId = result.paymentMethod.id;
        console.log('Payment method created:', result.paymentMethod.id);
        // Start therapist assignment process
        startTherapistAssignment();
      });
    } else {
      // Simulate successful payment method creation for testing
      window.paymentMethodId = 'pm_test_' + Math.random().toString(36).substr(2, 9);
      console.log('Test payment method created:', window.paymentMethodId);
      startTherapistAssignment();
    }
  } else {
    // Stripe not loaded, simulate success
    window.paymentMethodId = 'pm_test_' + Math.random().toString(36).substr(2, 9);
    console.log('Test payment method created:', window.paymentMethodId);
    startTherapistAssignment();
  }
};

// Start the therapist assignment process
function startTherapistAssignment() {
  console.log('Starting therapist assignment process...');
  console.log('Available therapists:', availableTherapists);
  
  // Reset booking accepted flag for new booking
  bookingAccepted = false;
  currentTherapistIndex = 0;
  timeRemaining = 120;
  show('step7');
  
  // Add a small delay to ensure step 7 is visible
  setTimeout(() => {
    sendRequestToCurrentTherapist();
  }, 500);
}

// Send request to current therapist
function sendRequestToCurrentTherapist() {
  // Check for acceptance before doing anything
  if (checkForAcceptance() || bookingAccepted) {
    stopTherapistAssignment('sendRequestToCurrentTherapist called but already accepted.');
    return;
  }
  
  console.log('Sending request to therapist index:', currentTherapistIndex);
  console.log('Available therapists length:', availableTherapists.length);
  console.log('Booking accepted flag:', bookingAccepted);

  if (currentTherapistIndex >= availableTherapists.length) {
    // No more therapists available
    console.log('No more therapists available');
    document.getElementById('requestMsg').innerText = 'No therapists available. Your payment will be refunded.';
    document.getElementById('therapistStatus').innerHTML = '<p style="color: red;">No therapists responded in time.</p>';
    return;
  }

  const currentTherapist = availableTherapists[currentTherapistIndex];
  console.log('Current therapist:', currentTherapist);

  // Final check before sending email
  if (checkForAcceptance() || bookingAccepted) {
    stopTherapistAssignment('sendRequestToCurrentTherapist about to send email but already accepted.');
    return;
  }

  document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi)`;

  // Send email to current therapist
  sendTherapistEmail(currentTherapist);

  // Send confirmation email to customer (only on first therapist)
  if (currentTherapistIndex === 0) {
    console.log('Sending customer confirmation email...');
    sendCustomerConfirmationEmail();
  }

  // Start countdown timer
  console.log('Starting countdown timer...');
  startCountdown();
}

// Send email to therapist
function sendTherapistEmail(therapist) {
  // Check for acceptance before sending email
  if (checkForAcceptance() || bookingAccepted) {
    stopTherapistAssignment('sendTherapistEmail called but already accepted.');
    return;
  }
  
  console.log('Sending email to therapist:', therapist.name);

  const price = calculatePrice();
  const customerName = document.getElementById('customerName').value;
  const customerEmail = document.getElementById('customerEmail').value;
  const customerPhone = document.getElementById('customerPhone').value;
  const address = document.getElementById('address').value;

  const acceptUrl = `${window.location.origin}${window.location.pathname}?a=accept&t=${encodeURIComponent(therapist.name)}&b=${encodeURIComponent(JSON.stringify({
    n: customerName, e: customerEmail, p: customerPhone, a: address,
    s: document.getElementById('service').value, d: document.getElementById('duration').value,
    dt: document.getElementById('date').value, tm: document.getElementById('time').value,
    pk: document.getElementById('parking').value, pr: price, tn: therapist.name
  }))}`;
  const declineUrl = `${window.location.origin}${window.location.pathname}?a=decline&t=${encodeURIComponent(therapist.name)}&b=${encodeURIComponent(JSON.stringify({
    n: customerName, e: customerEmail, p: customerPhone, a: address,
    s: document.getElementById('service').value, d: document.getElementById('duration').value,
    dt: document.getElementById('date').value, tm: document.getElementById('time').value,
    pk: document.getElementById('parking').value, pr: price, tn: therapist.name
  }))}`;

  // Plain text fallback (no hyperlinks)
  const summaryText =
    `NEW BOOKING REQUEST\n\n` +
    `Customer Details:\n` +
    `Name: ${customerName}\n` +
    `Email: ${customerEmail}\n` +
    `Phone: ${customerPhone}\n\n` +
    `Booking Details:\n` +
    `Address For Massage: ${address}\n` +
    `Service: ${document.getElementById('service').value}\n` +
    `Duration: ${document.getElementById('duration').value} min\n` +
    `Date: ${document.getElementById('date').value}\n` +
    `Time: ${document.getElementById('time').value}\n` +
    `Parking: ${document.getElementById('parking').value}\n` +
    `Total Price: $${price}\n\n` +
    `Please respond to this booking request within 120 seconds:\n\n` +
    `ACCEPT: ${acceptUrl}\n` +
    `DECLINE: ${declineUrl}\n` +
    `You have 120 seconds to respond before this request is sent to another therapist.`;

  // HTML version with hyperlinks, larger, bold, ALL CAPS
  const simpleEmailHTML = `
    <h2>NEW BOOKING REQUEST</h2>
    <p><strong>Customer:</strong> ${customerName}</p>
    <p><strong>Email:</strong> ${customerEmail}</p>
    <p><strong>Phone:</strong> ${customerPhone}</p>
    <p><strong>Address:</strong> ${address}</p>
    <p><strong>Service:</strong> ${document.getElementById('service').value}</p>
    <p><strong>Duration:</strong> ${document.getElementById('duration').value} min</p>
    <p><strong>Date:</strong> ${document.getElementById('date').value}</p>
    <p><strong>Time:</strong> ${document.getElementById('time').value}</p>
    <p><strong>Price:</strong> $${price}</p>
    <br>
    <p><strong>Please respond within 120 seconds:</strong></p>
    <p>
      <a href="${acceptUrl}" style="font-size: 22px; color: #28a745; text-decoration: underline; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">ACCEPT</a>
      &nbsp;|&nbsp;
      <a href="${declineUrl}" style="font-size: 22px; color: #dc3545; text-decoration: underline; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">DECLINE</a>
    </p>
  `;

  emailjs.send('service_puww2kb','template_zh8jess', {
    to_name: therapist.name,
    to_email: 'aidanleo@yahoo.co.uk', // For testing
    message: summaryText, // Plain text fallback
    message_html: simpleEmailHTML, // Use hyperlinks in HTML
    html_message: simpleEmailHTML, // Alternative HTML field
    html_content: simpleEmailHTML, // Another HTML field name
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    address_for_massage: address,
    therapist_name: therapist.name,
    accept_link: acceptUrl,
    decline_link: declineUrl
  }, 'V8qq2pjH8vfh3a6q3').then((response) => {
    console.log('Email sent to therapist successfully:', therapist.name, response);
  }).catch(err => {
    console.error('Email failed for therapist:', therapist.name, err);
  });
}

// Send confirmation email to customer
function sendCustomerConfirmationEmail() {
  console.log('Sending customer confirmation email...');

  const customerName = document.getElementById('customerName').value;
  const customerEmail = document.getElementById('customerEmail').value;
  const address = document.getElementById('address').value;
  const service = document.getElementById('service').value;
  const duration = document.getElementById('duration').value;
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;
  const price = calculatePrice();
  const parking = document.getElementById('parking').value;

  // Updated HTML to match therapist email look and feel
  const customerEmailHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff;">
      <h2 style="color: #00729B; text-align: center;">Booking Request Received</h2>
      <div style="background: #f5f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3 style="color: #005f7d; margin-top: 0;">Your Details</h3>
        <p><strong>Name:</strong> ${customerName}</p>
        <p><strong>Email:</strong> ${customerEmail}</p>
      </div>
      <div style="background: #f5f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3 style="color: #005f7d; margin-top: 0;">Booking Details</h3>
        <p><strong>Address For Massage:</strong> ${address}</p>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Duration:</strong> ${duration} min</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Time:</strong> ${time}</p>
        <p><strong>Parking:</strong> ${parking}</p>
        <p><strong>Total Price:</strong> $${price}</p>
      </div>
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
        <p style="margin: 0; color: #856404;"><strong>Payment Information:</strong> Your payment details have been securely collected. Your card will only be charged after a therapist accepts your booking.</p>
      </div>
      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="color: #28a745; margin-top: 0;">What Happens Next?</h3>
        <p>We're reaching out to our qualified therapists in your area to confirm your booking. You'll receive a confirmation as soon as a therapist accepts.</p>
      </div>
      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
        <p><strong>Rejuvenators Mobile Massage</strong></p>
        <p>Bringing wellness to your doorstep</p>
        <p style="font-size: 12px;">If you have any questions, please don't hesitate to contact us</p>
      </div>
    </div>
  `;

  if (typeof emailjs !== 'undefined' && emailjs.init) {
    console.log('Attempting to send customer confirmation email...');
    emailjs.send('service_puww2kb','template_zh8jess', {
      to_name: customerName,
      to_email: customerEmail, // Send to customer's actual email
      message: '', // No plain text, only HTML
      message_html: customerEmailHTML,
      html_message: customerEmailHTML,
      html_content: customerEmailHTML,
      customer_name: customerName,
      customer_email: customerEmail,
      booking_details: `Service: ${service}, Duration: ${duration}min, Date: ${date}, Time: ${time}, Address: ${address}, Price: $${price}`
    }, 'V8qq2pjH8vfh3a6q3').then((response) => {
      console.log('Customer confirmation email sent successfully:', response);
    }).catch(err => {
      console.error('Customer confirmation email failed:', err);
    });
  } else {
    console.error('EmailJS not available for customer email');
  }
}

// Start countdown timer
function startCountdown() {
  // Check for acceptance before starting timer
  if (checkForAcceptance() || bookingAccepted) {
    stopTherapistAssignment('startCountdown called but already accepted.');
    return;
  }
  
  console.log('Starting countdown timer with timeRemaining:', timeRemaining);

  const timerElement = document.getElementById('timeRemaining');
  if (!timerElement) {
    console.error('Timer element not found!');
    return;
  }

  // Clear any existing timer
  if (therapistTimeout) {
    clearInterval(therapistTimeout);
  }

  const countdown = setInterval(() => {
    // Check for acceptance on every timer tick
    if (checkForAcceptance() || bookingAccepted) {
      stopTherapistAssignment('Countdown tick detected acceptance.');
      clearInterval(countdown);
      return;
    }

    timeRemaining--;
    console.log('Timer tick:', timeRemaining);
    timerElement.textContent = `${timeRemaining} seconds`;

    if (timeRemaining <= 0) {
      console.log('Timer expired, moving to next therapist');
      clearInterval(countdown);

      // Double-check if booking was accepted before moving to next therapist
      if (checkForAcceptance() || bookingAccepted) {
        stopTherapistAssignment('Timer expired but acceptance detected.');
        return;
      }

      // Timeout - move to next therapist
      currentTherapistIndex++;
      timeRemaining = 120;
      sendRequestToCurrentTherapist();
    }
  }, 1000);

  // Store the interval ID to clear it if needed
  therapistTimeout = countdown;
  console.log('Timer started, interval ID:', countdown);
}

// Process payment after acceptance
function processPaymentAfterAcceptance(booking, therapistName) {
  // Show processing message
  document.getElementById('requestMsg').innerText = `Booking Accepted by ${therapistName}! Processing payment...`;
  document.getElementById('therapistStatus').innerHTML = `<p style="color: green;"><strong>Confirmed with ${therapistName}</strong></p>`;
  show('step7');
  
  // Clear any existing timeout
  if (therapistTimeout) {
    clearInterval(therapistTimeout);
  }
  
  // Process the payment using the stored payment method
  if (typeof Stripe !== 'undefined' && window.paymentMethodId) {
    const stripe = Stripe('pk_test_12345');
    
    // In a real implementation, you would send this to your server
    // For now, we'll simulate the payment processing
    console.log('Processing payment with method:', window.paymentMethodId);
    console.log('Amount:', booking.price);
    
    // Simulate payment processing
    setTimeout(() => {
      console.log('Payment processed successfully!');
      document.getElementById('requestMsg').innerText = `Payment processed! Booking confirmed with ${therapistName}`;
      
      // Show final confirmation
      setTimeout(() => {
        document.getElementById('finalMsg').innerText = 'Booking Confirmed & Payment Processed!';
        show('step8');
      }, 2000);
    }, 1500);
  } else {
    // Fallback for testing
    console.log('Payment method not available, simulating payment');
    document.getElementById('requestMsg').innerText = `Booking confirmed with ${therapistName}! Payment will be processed.`;
    
    setTimeout(() => {
      document.getElementById('finalMsg').innerText = 'Booking Confirmed!';
      show('step8');
    }, 3000);
  }
}

// Send admin notification
function sendAdminNotification(booking, therapistName) {
  console.log('Sending admin notification...');
  
  if (typeof emailjs !== 'undefined' && emailjs.init) {
    const adminEmailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #28a745; margin-bottom: 10px;">✅ Booking Confirmed!</h1>
          <p style="color: #666; font-size: 16px;">A therapist has accepted a booking request</p>
        </div>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3 style="color: #28a745; margin-top: 0;">Booking Details</h3>
          <p><strong>Therapist:</strong> ${therapistName}</p>
          <p><strong>Customer:</strong> ${booking.customerName}</p>
          <p><strong>Email:</strong> ${booking.customerEmail}</p>
          <p><strong>Phone:</strong> ${booking.customerPhone}</p>
          <p><strong>Address:</strong> ${booking.address}</p>
          <p><strong>Service:</strong> ${booking.service}</p>
          <p><strong>Duration:</strong> ${booking.duration} minutes</p>
          <p><strong>Date:</strong> ${booking.date}</p>
          <p><strong>Time:</strong> ${booking.time}</p>
          <p><strong>Total Amount:</strong> $${booking.price}</p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
          <p><strong>Rejuvenators Mobile Massage</strong></p>
          <p>Booking confirmed automatically</p>
        </div>
      </div>
    `;
    
    emailjs.send('service_puww2kb','template_zh8jess', {
      to_name: 'Admin',
      to_email: 'ajleo2205@gmail.com',
      message: `Booking confirmed by ${therapistName} for ${booking.customerName} on ${booking.date} at ${booking.time}. Service: ${booking.service}, Duration: ${booking.duration}min, Address: ${booking.address}, Price: $${booking.price}`,
      message_html: adminEmailHTML,
      html_message: adminEmailHTML,
      customer_name: booking.customerName,
      customer_email: booking.customerEmail,
      customer_phone: booking.customerPhone,
      address_for_massage: booking.address,
      therapist_name: therapistName,
      booking_details: `Service: ${booking.service}, Duration: ${booking.duration}min, Date: ${booking.date}, Time: ${booking.time}, Price: $${booking.price}`
    }, 'V8qq2pjH8vfh3a6q3').then((response) => {
      console.log('Admin notification sent successfully:', response);
    }).catch(err => {
      console.error('Admin notification failed:', err);
    });
  } else {
    console.error('EmailJS not available for admin notification');
  }
}

// Show simple confirmation page
function showSimpleConfirmation(therapistName, booking) {
  console.log('Showing simple confirmation page...');
  
  // Clear any existing timeout
  if (therapistTimeout) {
    clearInterval(therapistTimeout);
  }
  
  // Create a simple confirmation page
  const confirmationHTML = `
    <div style="text-align: center; padding: 50px 20px; font-family: Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
        <h1 style="color: #28a745; margin-bottom: 20px;">Booking Confirmed!</h1>
        <p style="font-size: 18px; color: #666; margin-bottom: 30px;">
          ${therapistName} has accepted your booking request.
        </p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left;">
          <h3 style="color: #00729B; margin-top: 0;">Booking Details</h3>
          <p><strong>Customer:</strong> ${booking.customerName}</p>
          <p><strong>Service:</strong> ${booking.service}</p>
          <p><strong>Duration:</strong> ${booking.duration} minutes</p>
          <p><strong>Date:</strong> ${booking.date}</p>
          <p><strong>Time:</strong> ${booking.time}</p>
          <p><strong>Address:</strong> ${booking.address}</p>
          <p><strong>Total Amount:</strong> $${booking.price}</p>
        </div>
        
        <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
          <p style="margin: 0; color: #28a745;"><strong>Payment will be processed automatically.</strong></p>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          You will receive a confirmation email shortly.<br>
          Thank you for choosing Rejuvenators Mobile Massage!
        </p>
      </div>
    </div>
  `;
  
  // Replace the entire page content
  document.body.innerHTML = confirmationHTML;
}

// --- Global Stop Function ---
function stopTherapistAssignment(reason = '') {
  if (!bookingAccepted) {
    bookingAccepted = true;
    sessionStorage.setItem('bookingAccepted', 'true');
    console.log('Therapist assignment stopped.' + (reason ? ' Reason: ' + reason : ''));
  } else {
    console.log('Therapist assignment already stopped.' + (reason ? ' Reason: ' + reason : ''));
  }
  if (therapistTimeout) {
    clearInterval(therapistTimeout);
    therapistTimeout = null;
    console.log('Therapist timer cleared.');
  }
}

// --- Check for acceptance from sessionStorage ---
function checkForAcceptance() {
  if (sessionStorage.getItem('bookingAccepted') === 'true') {
    if (!bookingAccepted) {
      stopTherapistAssignment('Detected acceptance in sessionStorage.');
    }
    return true;
  }
  return false;
}

// --- Cross-Tab Acceptance Sync ---
window.addEventListener('storage', function(e) {
  if (e.key === 'bookingAccepted' && e.newValue === 'true') {
    stopTherapistAssignment('Detected acceptance in another tab/window.');
  }
});