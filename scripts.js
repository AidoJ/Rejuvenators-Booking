// Autocomplete initialization
let autocomplete, current='step1', currentLat, currentLon, selectedTherapistInfo;

// Global variables for therapist management
let availableTherapists = [];
let currentTherapistIndex = 0;
let therapistTimeout = null;
let timeRemaining = 120; // 120 seconds for testing
let bookingAccepted = false; // Flag to prevent sending emails to other therapists
let bookingId = null; // Unique booking ID to prevent duplicate acceptances
let selectedTherapistName = null; // Store the originally selected therapist
let isInFallbackMode = false; // Track if we're in fallback mode

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
  // Generate unique booking ID for this session
  bookingId = 'booking_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  console.log('Generated booking ID:', bookingId);
  
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
  const action = urlParams.get('a') || urlParams.get('action');
  const therapistName = urlParams.get('t') || urlParams.get('therapist');
  const bookingData = urlParams.get('b') || urlParams.get('booking');
  const receivedBookingId = urlParams.get('bid') || urlParams.get('bookingId');
  
  if (action && bookingData && therapistName && receivedBookingId) {
    handleTherapistResponse(action, therapistName, bookingData, receivedBookingId);
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
          selDiv.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Unfortunately we don\'t have any therapists available in your area right now.</p>';
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
          selectedTherapistName = selectedTherapistInfo.name; // Store the selected name
          sel.onchange = function() {
            selectedTherapistInfo = JSON.parse(this.value);
            selectedTherapistName = selectedTherapistInfo.name; // Update the selected name
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
  
  // When user clicks Request Booking, prepare the selected therapist
  const requestBtn = document.getElementById('requestBtn');
  if (requestBtn) {
    requestBtn.onclick = () => {
      // Store the selected therapist as the first to try
      if (selectedTherapistInfo) {
        // Create a new array with selected therapist first, then others
        const otherTherapists = availableTherapists.filter(t => t.name !== selectedTherapistInfo.name);
        availableTherapists = [selectedTherapistInfo, ...otherTherapists];
        console.log('Therapist order set:', availableTherapists.map(t => t.name));
      }
      show('step6'); // Move to payment step
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
            <p><strong>Selected Therapist:</strong> ${selectedTherapistName}</p>
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
});

// Handle therapist response from URL
function handleTherapistResponse(action, therapistName, bookingData, receivedBookingId) {
  try {
    // Check if this booking has already been accepted
    const acceptedBookingId = localStorage.getItem('acceptedBookingId');
    if (acceptedBookingId === receivedBookingId) {
      console.log('This booking has already been accepted');
      showAlreadyAcceptedMessage();
      return;
    }
    
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
      // Store the accepted booking ID to prevent duplicate acceptances
      localStorage.setItem('acceptedBookingId', receivedBookingId);
      bookingAccepted = true;
      stopTherapistAssignment('Therapist accepted.');
      
      // Send notifications
      sendAdminNotification(fullBooking, therapistName);
      sendCustomerConfirmationEmail(fullBooking, therapistName);
      
      // Show confirmation
      showSimpleConfirmation(therapistName, fullBooking);
    } else if (action === 'decline') {
      // Show decline message
      showDeclineMessage(therapistName);
    }
  } catch (e) {
    console.error('Error parsing booking data:', e);
  }
}

// Show already accepted message
function showAlreadyAcceptedMessage() {
  document.body.innerHTML = `
    <div style="text-align: center; padding: 50px 20px; font-family: Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
        <h1 style="color: #f0ad4e; margin-bottom: 20px;">Booking Already Accepted</h1>
        <p style="font-size: 18px; color: #666;">
          This booking has already been accepted by another therapist.
        </p>
      </div>
    </div>
  `;
}

// Show decline message
function showDeclineMessage(therapistName) {
  document.body.innerHTML = `
    <div style="text-align: center; padding: 50px 20px; font-family: Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h1 style="color: #dc3545; margin-bottom: 20px;">Booking Declined</h1>
        <p style="font-size: 18px; color: #666;">
          Thank you for your response. The booking has been declined.
        </p>
      </div>
    </div>
  `;
}

// Haversine distance
function distance(lat1,lon1,lat2,lon2){
  const R=3958.8, rLat1=lat1*Math.PI/180, rLat2=lat2*Math.PI/180;
  const dLat=rLat2-rLat1, dLon=(lon2-lon1)*Math.PI/180;
  return 2*R*Math.asin(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(rLat1)*Math.cos(rLat2)*Math.sin(dLon/2)**2));
}

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
  console.log('Selected therapist:', selectedTherapistName);
  
  // Reset booking accepted flag for new booking
  bookingAccepted = false;
  currentTherapistIndex = 0;
  timeRemaining = 120;
  isInFallbackMode = false;
  show('step7');
  
  // Update the UI to show we're contacting the selected therapist
  document.getElementById('requestMsg').innerText = `Sending request to ${selectedTherapistName}...`;
  
  // Add a small delay to ensure step 7 is visible
  setTimeout(() => {
    sendRequestToCurrentTherapist();
  }, 500);
}

// Send request to current therapist
function sendRequestToCurrentTherapist() {
  if (bookingAccepted) {
    stopTherapistAssignment('sendRequestToCurrentTherapist called but already accepted.');
    return;
  }
  
  console.log('Sending request to therapist index:', currentTherapistIndex);
  console.log('Available therapists length:', availableTherapists.length);
  console.log('Booking accepted flag:', bookingAccepted);
  console.log('Is in fallback mode:', isInFallbackMode);

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
  if (bookingAccepted) {
    stopTherapistAssignment('sendRequestToCurrentTherapist about to send email but already accepted.');
    return;
  }

  // Update UI based on whether we're in fallback mode
  if (currentTherapistIndex === 0) {
    // First therapist (selected one)
    document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi) - Your selected therapist`;
  } else if (currentTherapistIndex === 1 && !isInFallbackMode) {
    // Entering fallback mode
    isInFallbackMode = true;
    document.getElementById('requestMsg').innerText = `${selectedTherapistName} did not respond. Now trying other available therapists...`;
    document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi)`;
  } else {
    // Already in fallback mode
    document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi)`;
  }

  // Send email to current therapist
  sendTherapistEmail(currentTherapist);

  // Start countdown timer
  console.log('Starting countdown timer...');
  startCountdown();
}

// Send email to therapist
function sendTherapistEmail(therapist) {
  if (bookingAccepted) {
    stopTherapistAssignment('sendTherapistEmail called but already accepted.');
    return;
  }
  console.log('Sending email to therapist:', therapist.name);

  const price = calculatePrice();
  const customerName = document.getElementById('customerName').value;
  const customerEmail = document.getElementById('customerEmail').value;
  const customerPhone = document.getElementById('customerPhone').value;
  const address = document.getElementById('address').value;

  // Include booking ID in the URL to track acceptances
  const acceptUrl = `${window.location.origin}${window.location.pathname}?a=accept&t=${encodeURIComponent(therapist.name)}&bid=${bookingId}&b=${encodeURIComponent(JSON.stringify({
    n: customerName, e: customerEmail, p: customerPhone, a: address,
    s: document.getElementById('service').value, d: document.getElementById('duration').value,
    dt: document.getElementById('date').value, tm: document.getElementById('time').value,
    pk: document.getElementById('parking').value, pr: price, tn: therapist.name
  }))}`;
  const declineUrl = `${window.location.origin}${window.location.pathname}?a=decline&t=${encodeURIComponent(therapist.name)}&bid=${bookingId}&b=${encodeURIComponent(JSON.stringify({
    n: customerName, e: customerEmail, p: customerPhone, a: address,
    s: document.getElementById('service').value, d: document.getElementById('duration').value,
    dt: document.getElementById('date').value, tm: document.getElementById('time').value,
    pk: document.getElementById('parking').value, pr: price, tn: therapist.name
  }))}`;

  // Determine if this is the selected therapist
  const isSelectedTherapist = therapist.name === selectedTherapistName;
  const therapistNote = isSelectedTherapist ? ' (Customer specifically requested you!)' : '';

  // Plain text fallback (no hyperlinks)
  const summaryText =
    `NEW BOOKING REQUEST${therapistNote}\n\n` +
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
    <h2>NEW BOOKING REQUEST${therapistNote}</h2>
    ${isSelectedTherapist ? '<p style="background: #28a745; color: white; padding: 10px; border-radius: 5px; font-weight: bold;">Customer specifically requested YOU!</p>' : ''}
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

// Send confirmation email to customer - now includes therapist name
function sendCustomerConfirmationEmail(booking, therapistName) {
  console.log('Sending customer confirmation email...');

  const customerName = booking.customerName;
  const customerEmail = booking.customerEmail;

  // Updated HTML to include therapist information
  const customerEmailHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff;">
      <h2 style="color: #00729B; text-align: center;">Booking Confirmed!</h2>
      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="color: #28a745; margin-top: 0;">✅ Your booking has been accepted!</h3>
        <p><strong>Therapist:</strong> ${therapistName}</p>
      </div>
      <div style="background: #f5f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
