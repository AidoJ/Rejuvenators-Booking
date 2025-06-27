// Autocomplete initialization
let autocomplete, current='step1', currentLat, currentLon, selectedTherapistInfo;

// Global variables for therapist management
let availableTherapists = [];
let currentTherapistIndex = 0;
let therapistTimeout = null;
let timeRemaining = 120; // 120 seconds for testing

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
  autocomplete = new google.maps.places.Autocomplete(
    document.getElementById('address'), { componentRestrictions:{country:'au'} }
  );
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    currentLat = place.geometry.location.lat();
    currentLon = place.geometry.location.lng();
  });
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
  // Initialize EmailJS
  initEmailJS();
  
  // Test EmailJS functionality
  setTimeout(() => {
    if (typeof emailjs !== 'undefined') {
      console.log('Testing EmailJS...');
      // Simple test email
      emailjs.send('service_puww2kb','template_zh8jess', {
        to_name: 'Test',
        to_email: 'aidanleo@yahoo.co.uk',
        message: 'This is a test email from the booking system',
        customer_name: 'Test Customer',
        customer_email: 'test@example.com',
        customer_phone: '123-456-7890',
        booking_details: 'Test booking details'
      }, 'V8qq2pjH8vfh3a6q3').then((response) => {
        console.log('Test email sent successfully:', response);
      }).catch(err => {
        console.error('Test email failed:', err);
      });
    }
  }, 2000);
  
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
  const action = urlParams.get('action');
  const therapistName = urlParams.get('therapist');
  const bookingData = urlParams.get('booking');
  
  if (action && bookingData && therapistName) {
    try {
      const booking = JSON.parse(decodeURIComponent(bookingData));
      if (action === 'accept') {
        // Process payment now that therapist has accepted
        processPaymentAfterAcceptance(booking, therapistName);
      } else if (action === 'decline') {
        // Show decline message and move to next therapist
        document.getElementById('requestMsg').innerText = `${therapistName} declined. Trying next therapist...`;
        show('step7');
        // Clear any existing timeout
        if (therapistTimeout) {
          clearInterval(therapistTimeout);
        }
        // Move to next therapist after a short delay
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
  
  // Test email button
  const testEmailBtn = document.getElementById('testEmailBtn');
  if (testEmailBtn) {
    testEmailBtn.onclick = () => {
      console.log('Test email button clicked');
      if (typeof emailjs !== 'undefined') {
        emailjs.send('service_puww2kb','template_zh8jess', {
          to_name: 'Test User',
          to_email: 'aidanleo@yahoo.co.uk',
          message: 'This is a test email from the booking system - ' + new Date().toLocaleString(),
          customer_name: 'Test Customer',
          customer_email: 'test@example.com',
          customer_phone: '123-456-7890',
          booking_details: 'Test booking details - ' + new Date().toLocaleString()
        }, 'V8qq2pjH8vfh3a6q3').then((response) => {
          console.log('Test email sent successfully:', response);
          alert('Test email sent successfully! Check console for details.');
        }).catch(err => {
          console.error('Test email failed:', err);
          alert('Test email failed: ' + err.text);
        });
      } else {
        alert('EmailJS not loaded!');
      }
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
document.getElementById('requestBtn').onclick = () => {
  // Proceed to payment step
  show('step6');
};

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
  currentTherapistIndex = 0;
  timeRemaining = 120;
  show('step7');
  sendRequestToCurrentTherapist();
}

// Send request to current therapist
function sendRequestToCurrentTherapist() {
  if (currentTherapistIndex >= availableTherapists.length) {
    // No more therapists available
    document.getElementById('requestMsg').innerText = 'No therapists available. Your payment will be refunded.';
    document.getElementById('therapistStatus').innerHTML = '<p style="color: red;">No therapists responded in time.</p>';
    return;
  }

  const currentTherapist = availableTherapists[currentTherapistIndex];
  document.getElementById('currentTherapist').textContent = `${currentTherapist.name} (${currentTherapist.distance.toFixed(1)} mi)`;
  
  // Send email to current therapist
  sendTherapistEmail(currentTherapist);
  
  // Start countdown timer
  startCountdown();
}

// Send email to therapist
function sendTherapistEmail(therapist) {
  const price = calculatePrice();
  const customerName = document.getElementById('customerName').value;
  const customerEmail = document.getElementById('customerEmail').value;
  const customerPhone = document.getElementById('customerPhone').value;
  const address = document.getElementById('address').value;
  
  const emailHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #00729B; text-align: center;">NEW BOOKING REQUEST</h2>
      
      <div style="background: #f5f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3 style="color: #005f7d; margin-top: 0;">Customer Details</h3>
        <p><strong>Name:</strong> ${customerName}</p>
        <p><strong>Email:</strong> ${customerEmail}</p>
        <p><strong>Phone:</strong> ${customerPhone}</p>
      </div>
      
      <div style="background: #f5f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3 style="color: #005f7d; margin-top: 0;">Booking Details</h3>
        <p><strong>Address For Massage:</strong> ${address}</p>
        <p><strong>Service:</strong> ${document.getElementById('service').value}</p>
        <p><strong>Duration:</strong> ${document.getElementById('duration').value} min</p>
        <p><strong>Date:</strong> ${document.getElementById('date').value}</p>
        <p><strong>Time:</strong> ${document.getElementById('time').value}</p>
        <p><strong>Parking:</strong> ${document.getElementById('parking').value}</p>
        <p><strong>Total Price:</strong> $${price}</p>
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
        <p style="margin: 0; color: #856404;"><strong>Payment Information:</strong> Customer's payment details have been collected. Payment will be processed automatically when you accept this booking.</p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <p style="font-size: 16px; color: #333;">Please respond to this booking request within 120 seconds:</p>
        <div style="margin: 20px 0;">
          <a href="${window.location.origin}${window.location.pathname}?action=accept&therapist=${therapist.name}&booking=${encodeURIComponent(JSON.stringify({
            customerName, customerEmail, customerPhone, address,
            service: document.getElementById('service').value,
            duration: document.getElementById('duration').value,
            date: document.getElementById('date').value,
            time: document.getElementById('time').value,
            parking: document.getElementById('parking').value,
            price: price,
            therapistName: therapist.name
          }))}" style="display: inline-block; background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 0 10px; font-weight: bold;">✅ ACCEPT</a>
          
          <a href="${window.location.origin}${window.location.pathname}?action=decline&therapist=${therapist.name}&booking=${encodeURIComponent(JSON.stringify({
            customerName, customerEmail, customerPhone, address,
            service: document.getElementById('service').value,
            duration: document.getElementById('duration').value,
            date: document.getElementById('date').value,
            time: document.getElementById('time').value,
            parking: document.getElementById('parking').value,
            price: price,
            therapistName: therapist.name
          }))}" style="display: inline-block; background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 0 10px; font-weight: bold;">❌ DECLINE</a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
        <p>This booking request was sent from the Rejuvenators Mobile Massage Booking System</p>
        <p><strong>You have 120 seconds to respond before this request is sent to another therapist.</strong></p>
      </div>
    </div>
  `;

  if (typeof emailjs !== 'undefined' && emailjs.init) {
    emailjs.send('service_puww2kb','template_zh8jess', {
      to_name: therapist.name,
      to_email: 'aidanleo@yahoo.co.uk', // For testing
      message_html: emailHTML,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      address_for_massage: address,
      therapist_name: therapist.name
    }, 'V8qq2pjH8vfh3a6q3').then((response) => {
      console.log('Email sent to therapist:', therapist.name, response);
    }).catch(err => {
      console.error('Email failed for therapist:', therapist.name, err);
    });
  }
}

// Start countdown timer
function startCountdown() {
  const timerElement = document.getElementById('timeRemaining');
  
  const countdown = setInterval(() => {
    timeRemaining--;
    timerElement.textContent = `${timeRemaining} seconds`;
    
    if (timeRemaining <= 0) {
      clearInterval(countdown);
      // Timeout - move to next therapist
      currentTherapistIndex++;
      timeRemaining = 120;
      sendRequestToCurrentTherapist();
    }
  }, 1000);
  
  // Store the interval ID to clear it if needed
  therapistTimeout = countdown;
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