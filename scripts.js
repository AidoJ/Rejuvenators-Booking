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
  
  // Update progress bar
  updateProgressBar(step);
}

// Update progress bar based on current step
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
  
  // Initialize progress bar
  updateProgressBar('step1');
  
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
  
  console.log('URL Parameters found:', { action, therapistName, bookingData, receivedBookingId });
  
  if (action && bookingData && therapistName && receivedBookingId) {
    console.log('All required parameters found, calling handleTherapistResponse...');
    // Call immediately to prevent form from showing
    setTimeout(() => {
      handleTherapistResponse(action, therapistName, bookingData, receivedBookingId);
    }, 100);
  } else {
    console.log('Missing required parameters for therapist response');
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
          
          // Set the selected therapist to the first one initially
          selectedTherapistInfo = availableTherapists[0];
          selectedTherapistName = selectedTherapistInfo.name;
          
          // Update when user changes selection
          sel.onchange = function() {
            selectedTherapistInfo = JSON.parse(this.value);
            selectedTherapistName = selectedTherapistInfo.name;
            console.log('User selected therapist:', selectedTherapistName);
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
      console.log('Request button clicked. Selected therapist:', selectedTherapistName);
      
      // Ensure we have the correct selected therapist
      const therapistSelect = document.getElementById('therapistSelect');
      if (therapistSelect) {
        selectedTherapistInfo = JSON.parse(therapistSelect.value);
        selectedTherapistName = selectedTherapistInfo.name;
        console.log('Final selected therapist:', selectedTherapistName);
      }
      
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
  
  // Debug button handler
  const debugBtn = document.getElementById('debugBtn');
  if (debugBtn) {
    debugBtn.onclick = () => {
      console.log('Debug button clicked - testing therapist assignment...');
      
      // Create test booking data
      const testBooking = {
        customerName: document.getElementById('customerName').value || 'Test Customer',
        customerEmail: document.getElementById('customerEmail').value || 'test@example.com',
        customerPhone: document.getElementById('customerPhone').value || '123-456-7890',
        address: document.getElementById('address').value || '123 Test St, Brisbane',
        service: document.getElementById('service').value || 'Stressbuster',
        duration: document.getElementById('duration').value || '60',
        date: document.getElementById('date').value || '2024-01-15',
        time: document.getElementById('time').value || '14:00',
        parking: document.getElementById('parking').value || 'free',
        price: calculatePrice() || '159.00',
        therapistName: selectedTherapistName || 'Test Therapist'
      };
      
      console.log('Test booking data:', testBooking);
      
      // Test the Accept functionality
      const testBookingId = 'test_booking_' + Date.now();
      const testBookingData = encodeURIComponent(JSON.stringify({
        n: testBooking.customerName,
        e: testBooking.customerEmail,
        p: testBooking.customerPhone,
        a: testBooking.address,
        s: testBooking.service,
        d: testBooking.duration,
        dt: testBooking.date,
        tm: testBooking.time,
        pk: testBooking.parking,
        pr: testBooking.price,
        tn: testBooking.therapistName
      }));
      
      // Simulate Accept action
      handleTherapistResponse('accept', testBooking.therapistName, testBookingData, testBookingId);
    };
  }
});

// Handle therapist response from URL
function handleTherapistResponse(action, therapistName, bookingData, receivedBookingId) {
  console.log('handleTherapistResponse called with:', { action, therapistName, bookingData, receivedBookingId });
  
  try {
    // Check if this booking has already been accepted
    const acceptedBookingId = localStorage.getItem('acceptedBookingId');
    console.log('Checking for existing acceptance. Stored ID:', acceptedBookingId, 'Received ID:', receivedBookingId);
    
    if (acceptedBookingId === receivedBookingId) {
      console.log('This booking has already been accepted');
      showAlreadyAcceptedMessage();
      return;
    }
    
    const booking = JSON.parse(decodeURIComponent(bookingData));
    console.log('Parsed booking data:', booking);
    
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
    
    console.log('Full booking object:', fullBooking);
    
    if (action === 'accept') {
      console.log('Processing ACCEPT action...');
      
      // Store the accepted booking ID to prevent duplicate acceptances
      localStorage.setItem('acceptedBookingId', receivedBookingId);
      bookingAccepted = true;
      stopTherapistAssignment('Therapist accepted.');
      
      // Send notifications
      sendAdminNotification(fullBooking, therapistName);
      sendCustomerConfirmationEmail(fullBooking, therapistName);
      
      // Show confirmation
      console.log('Showing confirmation page...');
      showSimpleConfirmation(therapistName, fullBooking);
    } else if (action === 'decline') {
      console.log('Processing DECLINE action...');
      // Show decline message
      showDeclineMessage(therapistName);
    } else {
      console.log('Unknown action:', action);
    }
  } catch (e) {
    console.error('Error parsing booking data:', e);
    console.error('Raw booking data:', bookingData);
  }
}

// Show already accepted message
function showAlreadyAcceptedMessage() {
  document.documentElement.innerHTML = `
    <div style="text-align: center; padding: 50px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
        <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
        <h1 style="color: #f0ad4e; margin-bottom: 20px; font-size: 32px;">Booking Already Accepted</h1>
        <p style="font-size: 18px; color: #666;">
          This booking has already been accepted by another therapist.
        </p>
      </div>
    </div>
  `;
}

// Show decline message
function showDeclineMessage(therapistName) {
  document.documentElement.innerHTML = `
    <div style="text-align: center; padding: 50px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
        <h1 style="color: #dc3545; margin-bottom: 20px; font-size: 32px;">Booking Declined</h1>
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
  console.log('Selected therapist name:', selectedTherapistName);
  console.log('Selected therapist info:', selectedTherapistInfo);
  
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
    document.getElementById('requestMsg').innerText = 'No therapists responded in time. Your payment will be refunded.';
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
    document.getElementById('requestMsg').innerText = `Sending request to ${currentTherapist.name}...`;
    document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi) - Your selected therapist`;
  } else if (currentTherapistIndex === 1 && !isInFallbackMode) {
    // Entering fallback mode
    isInFallbackMode = true;
    document.getElementById('requestMsg').innerText = `${selectedTherapistName} did not respond. Now trying other available therapists...`;
    document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi)`;
  } else {
    // Already in fallback mode
    document.getElementById('requestMsg').innerText = `Trying ${currentTherapist.name}...`;
    document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi)`;
  }

  // Send email to current therapist
  sendTherapistEmail(currentTherapist);

  // Start countdown timer
  console.log('Starting countdown timer for therapist index:', currentTherapistIndex);
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

// Send admin notification (placeholder for now)
function sendAdminNotification(booking, therapistName) {
  console.log('Admin notification would be sent here for booking:', booking);
  // This could be used to notify admin of accepted bookings
}

// Send confirmation email to customer - now includes therapist name
function sendCustomerConfirmationEmail(booking, therapistName) {
  console.log('Sending customer confirmation email...');

  const customerName = booking.customerName;
  const customerEmail = booking.customerEmail;

  // Updated HTML to match the therapist email style with better formatting
  const customerEmailHTML = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
        <h1 style="color: #28a745; margin-bottom: 10px;">Booking Confirmed!</h1>
        <p style="color: #666; font-size: 16px;">Your massage booking has been accepted</p>
      </div>
      
      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="color: #28a745; margin-top: 0;">✅ Your booking has been accepted!</h3>
        <p><strong>Therapist:</strong> ${therapistName}</p>
      </div>
      
      <div style="background: #f5f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3 style="color: #005f7d; margin-top: 0;">Your Details</h3>
        <p><strong>Name:</strong> ${customerName}</p>
        <p><strong>Email:</strong> ${customerEmail}</p>
      </div>
      
      <div style="background: #f5f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3 style="color: #005f7d; margin-top: 0;">Booking Details</h3>
        <p><strong>Address For Massage:</strong> ${booking.address}</p>
        <p><strong>Service:</strong> ${booking.service}</p>
        <p><strong>Duration:</strong> ${booking.duration} min</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Time:</strong> ${booking.time}</p>
        <p><strong>Parking:</strong> ${booking.parking}</p>
        <p><strong>Total Price:</strong> $${booking.price}</p>
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
        <p style="margin: 0; color: #856404;"><strong>Payment Information:</strong> Your payment has been processed successfully.</p>
      </div>
      
      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="color: #28a745; margin-top: 0;">What's Next?</h3>
        <p>${therapistName} will contact you before your appointment to confirm details and provide any special instructions. Please ensure someone is available at the address at the scheduled time.</p>
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
      message: `Booking confirmed! ${therapistName} has accepted your booking for ${booking.service} on ${booking.date} at ${booking.time}. Address: ${booking.address}. Total: $${booking.price}.`, // Plain text fallback
      message_html: customerEmailHTML,
      html_message: customerEmailHTML,
      html_content: customerEmailHTML,
      customer_name: customerName,
      customer_email: customerEmail,
      booking_details: `Service: ${booking.service}, Duration: ${booking.duration}min, Date: ${booking.date}, Time: ${booking.time}, Address: ${booking.address}, Price: $${booking.price}`
    }, 'V8qq2pjH8vfh3a6q3').then((response) => {
      console.log('Customer confirmation email sent successfully:', response);
    }).catch(err => {
      console.error('Customer confirmation email failed:', err);
    });
  } else {
    console.error('EmailJS not available for customer email');
  }
}

// Show simple confirmation page
function showSimpleConfirmation(therapistName, booking) {
  console.log('Showing simple confirmation page...');
  console.log('Therapist name:', therapistName);
  console.log('Booking data:', booking);
  
  // Clear any existing timeout
  if (therapistTimeout) {
    clearInterval(therapistTimeout);
  }
  
  // Stop all therapist assignment processes
  stopTherapistAssignment('showSimpleConfirmation called');
  
  // Send confirmation email to customer FIRST
  console.log('Sending customer confirmation email...');
  sendCustomerConfirmationEmail(booking, therapistName);
  
  // Create a simple confirmation page
  const confirmationHTML = `
    <div style="text-align: center; padding: 50px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
        <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
        <h1 style="color: #28a745; margin-bottom: 20px; font-size: 32px;">Booking Confirmed!</h1>
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
          <p style="margin: 0; color: #28a745;"><strong>Payment has been processed successfully.</strong></p>
        </div>
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <p style="margin: 0; color: #856404;"><strong>What's Next?</strong></p>
          <p style="margin: 10px 0 0 0; color: #856404;">You will receive a confirmation email shortly with all the details. ${therapistName} will contact you before your appointment.</p>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Thank you for choosing Rejuvenators Mobile Massage!<br>
          We look forward to providing you with an amazing massage experience.
        </p>
      </div>
    </div>
  `;
  
  // Replace the entire page content - this ensures no form is shown
  console.log('Replacing page content with confirmation...');
  document.documentElement.innerHTML = confirmationHTML;
}

// Start countdown timer
function startCountdown() {
  console.log('Starting countdown timer for therapist index:', currentTherapistIndex);
  
  const timerElement = document.getElementById('timeRemaining');
  if (!timerElement) {
    console.error('Timer element not found');
    return;
  }
  
  // Reset timer for current therapist
  timeRemaining = 120;
  timerElement.textContent = `${timeRemaining} seconds`;
  
  therapistTimeout = setInterval(() => {
    if (bookingAccepted) {
      console.log('Booking accepted, stopping timer');
      clearInterval(therapistTimeout);
      return;
    }
    
    timeRemaining--;
    timerElement.textContent = `${timeRemaining} seconds`;
    
    if (timeRemaining <= 0) {
      console.log('Timer expired for therapist index:', currentTherapistIndex);
      clearInterval(therapistTimeout);
      
      // Move to next therapist
      currentTherapistIndex++;
      console.log('Moving to next therapist, index:', currentTherapistIndex);
      
      if (currentTherapistIndex < availableTherapists.length) {
        // Send request to next therapist
        sendRequestToCurrentTherapist();
      } else {
        // No more therapists available
        console.log('No more therapists available');
        document.getElementById('requestMsg').innerText = 'No therapists responded in time. Your payment will be refunded.';
        document.getElementById('therapistStatus').innerHTML = '<p style="color: red;">No therapists responded in time.</p>';
      }
    }
  }, 1000);
}

// Stop therapist assignment process
function stopTherapistAssignment(reason) {
  console.log('Stopping therapist assignment:', reason);
  
  // Clear any existing timeout
  if (therapistTimeout) {
    clearInterval(therapistTimeout);
    therapistTimeout = null;
  }
  
  // Set booking as accepted to prevent further emails
  bookingAccepted = true;
  
  // Update sessionStorage to stop other tabs
  sessionStorage.setItem('bookingAccepted', 'true');
  sessionStorage.setItem('acceptedBookingId', bookingId);
  
  console.log('Therapist assignment stopped successfully');
}
